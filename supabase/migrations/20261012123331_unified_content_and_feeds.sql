begin;
alter table public.omni_comments add column document jsonb,
 add column updated_at timestamptz not null default now();
grant update(document) on public.omni_comments to authenticated;
create function omni_private.omni_guard_comment_document() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.body is distinct from old.body and new.document is not distinct from old.document then new.document=null; end if;
 if new.document is not null and (jsonb_typeof(new.document)<>'object' or new.document->>'type' is distinct from 'doc' or octet_length(new.document::text)>64000) then raise exception 'Invalid comment document'; end if;
 new.updated_at=now();return new;
end; $$;
create trigger omni_comment_document before insert or update on public.omni_comments for each row execute function omni_private.omni_guard_comment_document();
revoke all on function omni_private.omni_guard_comment_document() from public,anon,authenticated;

-- Existing signature stays available to earlier clients; the new endpoint carries rich content.
create function omni_private.omni_rich_comments(target_article uuid,offset_rows integer default 0)
returns table(id uuid,article_id uuid,user_id uuid,body text,document jsonb,created_at timestamptz,updated_at timestamptz,display_name text)
language sql stable security definer set search_path='' as $$
 select c.id,c.article_id,c.user_id,c.body,c.document,c.created_at,c.updated_at,p.display_name
 from public.omni_comments c join public.omni_profiles p on p.id=c.user_id join public.omni_articles a on a.id=c.article_id
 where c.article_id=target_article and (a.status='published' or omni_private.omni_is_admin())
 order by c.created_at,c.id limit 51 offset greatest(0,least(offset_rows,100000));
$$;
create function public.omni_rich_comments(target_article uuid,offset_rows integer default 0)
returns table(id uuid,article_id uuid,user_id uuid,body text,document jsonb,created_at timestamptz,updated_at timestamptz,display_name text)
language sql stable security invoker set search_path='' as $$select * from omni_private.omni_rich_comments(target_article,offset_rows);$$;
revoke all on function omni_private.omni_rich_comments(uuid,integer),public.omni_rich_comments(uuid,integer) from public,anon,authenticated;
grant execute on function omni_private.omni_rich_comments(uuid,integer),public.omni_rich_comments(uuid,integer) to anon,authenticated;

-- Only public/admin-visible content can expose aggregate counts. No liker identity is returned.
create function omni_private.omni_content_counts(target_article uuid) returns table(like_count bigint,comment_count bigint)
language sql stable security definer set search_path='' as $$
 select (select count(*) from public.omni_likes where article_id=target_article),
 (select count(*) from public.omni_comments where article_id=target_article)
 where exists(select 1 from public.omni_articles where id=target_article and (status='published' or omni_private.omni_is_admin()));
$$;
revoke all on function omni_private.omni_content_counts(uuid) from public,anon,authenticated;
grant execute on function omni_private.omni_content_counts(uuid) to anon,authenticated;
create function omni_private.omni_has_bookmark(target_article uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.omni_bookmarks where article_id=target_article and user_id=auth.uid());$$;
revoke all on function omni_private.omni_has_bookmark(uuid) from public,anon,authenticated;
grant execute on function omni_private.omni_has_bookmark(uuid) to anon,authenticated;

create function public.omni_content_feed(content_kind text default 'post',filter_category text default 'all',filter_query text default '',sort_by text default 'latest',page_size integer default 20,offset_rows integer default 0,own_only boolean default false,bookmarks_only boolean default false,featured_only boolean default false)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
  select a.* from public.omni_articles a
  where (content_kind='all' or a.content_type=content_kind)
   and (filter_category='all' or a.category=filter_category)
   and (not featured_only or a.featured)
   and (case when own_only then a.author_id=(select auth.uid()) else a.status='published' end)
   and (not bookmarks_only or omni_private.omni_has_bookmark(a.id))
   and (coalesce(filter_query,'')='' or exists(select 1 from jsonb_each(a.translations) v where position(lower(left(filter_query,120)) in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')))>0))
 ), selected as materialized (
  select a.*,coalesce(c.like_count,0) as likes,coalesce(c.comment_count,0) as comments from candidates a
  left join lateral omni_private.omni_content_counts(a.id) c on true
  order by (case when not own_only then a.featured else false end) desc,
   (case when sort_by='popular' then coalesce(c.like_count,0) else 0 end) desc,
   coalesce(a.published_at,a.created_at) desc,a.id desc
  limit greatest(1,least(coalesce(page_size,20),50))+1 offset greatest(0,least(coalesce(offset_rows,0),100000))
 ) select jsonb_build_object('id',s.id,'slug',s.slug,'category',s.category,'status',s.status,'original_locale',s.original_locale,'author_id',s.author_id,'author_name',s.author_name,'content_type',s.content_type,'featured',s.featured,'locked',s.locked,'moderated',s.moderated,'cover_style',s.cover_style,'source_url',s.source_url,'created_at',s.created_at,'updated_at',s.updated_at,'published_at',s.published_at,'like_count',s.likes,'comment_count',s.comments,
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',v.value->>'summary','body','')) from jsonb_each(s.translations) v)) from selected s
 order by (case when not own_only then s.featured else false end) desc,(case when sort_by='popular' then s.likes else 0 end) desc,coalesce(s.published_at,s.created_at) desc,s.id desc;
$$;
revoke all on function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean) to anon,authenticated;
commit;
