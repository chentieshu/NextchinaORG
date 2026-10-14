begin;
-- Each part is an ordinary post: existing moderation, search and interactions still apply.
alter table public.omni_articles add column thread_id uuid, add column thread_position integer;
alter table public.omni_articles add constraint omni_thread_shape check (
 (thread_id is null and thread_position is null) or
 (thread_id is not null and thread_position between 1 and 100 and content_type='post'));
alter table public.omni_articles add constraint omni_thread_order unique(thread_id,thread_position) deferrable initially deferred;

-- Transaction-bound permits are never writable by API roles. They also record idempotency.
create table omni_private.omni_thread_requests(
 request_id uuid primary key,user_id uuid not null references public.omni_profiles(id) on delete cascade,
 fingerprint text not null,article_ids uuid[] not null,transaction_id bigint not null,
 created_at timestamptz not null default clock_timestamp(),active boolean not null default true);
create index omni_thread_requests_user on omni_private.omni_thread_requests(user_id,created_at desc);
alter table omni_private.omni_thread_requests enable row level security;
revoke all on omni_private.omni_thread_requests from public,anon,authenticated;

create function omni_private.omni_thread_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' and new.thread_id is not null) or
 (tg_op='UPDATE' and (new.thread_id is distinct from old.thread_id or new.thread_position is distinct from old.thread_position)) then
  if not exists(select 1 from omni_private.omni_thread_requests r where r.user_id=auth.uid()
   and r.active and r.transaction_id=txid_current() and new.id=any(r.article_ids)) then
   raise exception 'Thread identity is managed by the thread publisher' using errcode='PT403';
  end if;
 end if;return new;
end;$$;
revoke all on function omni_private.omni_thread_guard() from public,anon,authenticated;
create trigger omni_02_thread_guard before insert or update on public.omni_articles for each row execute function omni_private.omni_thread_guard();

create or replace function omni_private.omni_post_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.content_type<>'post' or omni_private.omni_is_admin() then return new;end if;
 if new.author_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtext('post:'||auth.uid()::text));
 if exists(select 1 from omni_private.omni_thread_requests r where r.user_id=auth.uid()
   and r.active and r.transaction_id=txid_current() and new.id=any(r.article_ids)) then return new;end if;
 if exists(select 1 from public.omni_articles where author_id=auth.uid() and content_type='post' and created_at>now()-interval '30 seconds') then
  raise exception 'Please wait 30 seconds before creating another post';end if;return new;
end;$$;

-- Full snapshots make multi-device draft edits conflict instead of silently losing parts.
create function omni_private.omni_write_post_thread(request_id uuid,parts jsonb,new_status text,
 expected_parts jsonb default '[]',append_to uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); role_value text:=omni_private.omni_role(); prior omni_private.omni_thread_requests;
 stamp text; p jsonb; row_value public.omni_articles; anchor public.omni_articles;
 ids uuid[]:='{}'; old_ids uuid[]:='{}'; permitted uuid[]; group_id uuid; start_position integer:=0;
 total integer; ordinal integer:=0; part_id uuid; result jsonb:='[]'; actual jsonb;
begin
 if actor is null or role_value is null then raise exception 'Forbidden' using errcode='PT403';end if;
 if not exists(select 1 from public.omni_profiles where id=actor and profile_completed_at is not null) then raise exception 'Complete profile first' using errcode='PT403';end if;
 if role_value='member' and not (select ugc_enabled from public.omni_settings where id) then raise exception 'Posting closed' using errcode='PT403';end if;
 if request_id is null or jsonb_typeof(parts) is distinct from 'array' or jsonb_typeof(expected_parts) is distinct from 'array'
  or new_status is null or new_status not in ('draft','published') or octet_length(parts::text)>950000 then raise exception 'Invalid thread' using errcode='PT400';end if;
 total=jsonb_array_length(parts);
 if total not between 1 and 20 or jsonb_array_length(expected_parts)>20 then raise exception 'Maximum 20 posts per batch' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtext('post:'||actor::text));
 stamp=md5(jsonb_build_object('parts',parts,'status',new_status,'expected',expected_parts,'append',append_to)::text);
 select * into prior from omni_private.omni_thread_requests r where r.request_id=omni_write_post_thread.request_id;
 if found then
  if prior.user_id<>actor or prior.fingerprint<>stamp then raise exception 'Request changed' using errcode='PT409';end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by n.position),'[]') into result from unnest(prior.article_ids) with ordinality n(id,position) join public.omni_articles a on a.id=n.id where a.status='published' or a.author_id=actor or omni_private.omni_is_admin();
  return result;
 end if;
 if append_to is not null then
  if new_status<>'published' or expected_parts<>'[]'::jsonb then raise exception 'Invalid continuation' using errcode='PT400';end if;
  select * into anchor from public.omni_articles where id=append_to for update;
  -- Even an administrator cannot write under another person's thread identity.
  if not found or anchor.author_id<>actor or anchor.content_type<>'post' or anchor.status<>'published' or anchor.locked or anchor.moderated then raise exception 'Thread unavailable' using errcode='PT403';end if;
  group_id=coalesce(anchor.thread_id,gen_random_uuid());
  if anchor.thread_id is not null then
   perform 1 from public.omni_articles where thread_id=group_id order by id for update;
   if exists(select 1 from public.omni_articles where thread_id=group_id and (locked or moderated or author_id is distinct from actor or status<>'published')) then raise exception 'Thread unavailable' using errcode='PT403';end if;
   select max(thread_position) into start_position from public.omni_articles where thread_id=group_id;
  else start_position=1;end if;
 elsif expected_parts<>'[]'::jsonb then
  select array_agg((v->>'id')::uuid) into old_ids from jsonb_array_elements(expected_parts) v;
  select * into anchor from public.omni_articles where id=old_ids[1] for update;
  if not found then raise exception 'Content changed' using errcode='PT409';end if;
  group_id=coalesce(anchor.thread_id,gen_random_uuid());
  perform 1 from public.omni_articles where id=anchor.id or thread_id=anchor.thread_id order by id for update;
  if exists(select 1 from public.omni_articles where (id=anchor.id or thread_id=anchor.thread_id)
    and (status<>'draft' or locked or moderated or (author_id is distinct from actor and role_value='member'))) then raise exception 'Draft unavailable' using errcode='PT403';end if;
  -- Keeping every part's author unchanged prevents publishing as a different user.
  select jsonb_agg(jsonb_build_object('id',a.id,'updated_at',a.updated_at) order by a.id) into actual
   from public.omni_articles a where a.id=anchor.id or a.thread_id=anchor.thread_id;
  if actual is distinct from (select jsonb_agg(v order by v->>'id') from jsonb_array_elements(expected_parts) v) then raise exception 'Content changed' using errcode='PT409';end if;
 else group_id=gen_random_uuid();end if;
 if total+start_position>100 then raise exception 'Thread limit reached' using errcode='PT400';end if;
 for p in select value from jsonb_array_elements(parts) loop
  if jsonb_typeof(p) is distinct from 'object' or p->>'content_type' is distinct from 'post' then raise exception 'Posts only' using errcode='PT400';end if;
  part_id=coalesce((p->>'id')::uuid,gen_random_uuid());
  if part_id=any(ids) or (p->>'id' is not null and not part_id=any(old_ids)) then raise exception 'Invalid part identity' using errcode='PT403';end if;
  ids=array_append(ids,part_id);
 end loop;
 if not omni_private.omni_is_admin() and cardinality(old_ids)=0 and exists(select 1 from public.omni_articles where author_id=actor and content_type='post' and created_at>now()-interval '30 seconds') then raise exception 'Please wait 30 seconds before creating another post';end if;
 -- Also throttle repeat batches made only from old drafts or rapid continuations.
 if not omni_private.omni_is_admin() and cardinality(old_ids)=0 and exists(select 1 from omni_private.omni_thread_requests r where r.user_id=actor and r.created_at>now()-interval '30 seconds') then raise exception 'Please wait 30 seconds before creating another post';end if;
 permitted=ids||case when append_to is not null then array[append_to] else '{}'::uuid[] end;
 insert into omni_private.omni_thread_requests(request_id,user_id,fingerprint,article_ids,transaction_id) values(request_id,actor,stamp,permitted,txid_current());
 if append_to is not null and anchor.thread_id is null then update public.omni_articles set thread_id=group_id,thread_position=1 where id=anchor.id;end if;
 -- Remove only the author's/admin's private draft rows, never published content.
 delete from public.omni_articles where id=any(old_ids) and not id=any(ids);
 for p in select value from jsonb_array_elements(parts) loop
  ordinal=ordinal+1;part_id=ids[ordinal];
  if part_id=any(old_ids) then
   update public.omni_articles set translations=p->'translations',category=p->>'category',status=new_status,
    thread_id=group_id,thread_position=ordinal where id=part_id returning * into row_value;
  else
   insert into public.omni_articles(id,author_id,content_type,translations,original_locale,category,source_url,cover_style,status,quoted_article_id,thread_id,thread_position)
    values(part_id,coalesce(anchor.author_id,actor),'post',p->'translations',p->>'original_locale',p->>'category',null,0,new_status,(p->>'quoted_article_id')::uuid,group_id,start_position+ordinal) returning * into row_value;
  end if;
  result=result||jsonb_build_array(to_jsonb(row_value));
 end loop;
 update omni_private.omni_thread_requests r set article_ids=ids,active=false where r.request_id=omni_write_post_thread.request_id;
 return result;
end;$$;
create function public.omni_write_post_thread(request_id uuid,parts jsonb,new_status text,expected_parts jsonb default '[]',append_to uuid default null) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_write_post_thread(request_id,parts,new_status,expected_parts,append_to);$$;
revoke all on function omni_private.omni_write_post_thread(uuid,jsonb,text,jsonb,uuid),public.omni_write_post_thread(uuid,jsonb,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function omni_private.omni_write_post_thread(uuid,jsonb,text,jsonb,uuid),public.omni_write_post_thread(uuid,jsonb,text,jsonb,uuid) to authenticated;

-- Invoker reads apply the same RLS as reading a single article. Public readers never see drafts.
create function public.omni_post_thread(target_article uuid) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(a)||coalesce(s.value,'{}')||jsonb_build_object('author_name',p.display_name,'author_handle',p.handle,'author_avatar_key',p.avatar_key,'like_count',c.like_count,'comment_count',c.comment_count)
 from public.omni_articles a join public.omni_articles anchor on anchor.id=target_article
 left join lateral public.omni_public_profiles(array[a.author_id]) p on true
 left join lateral public.omni_social_context(array[a.id]) s(value) on true
 left join lateral public.omni_content_counts(a.id) c on true
 where a.content_type='post' and (a.id=anchor.id or a.thread_id=anchor.thread_id)
 and (case when anchor.status='published' then a.status='published' else a.status=anchor.status end)
 order by a.thread_position nulls first,a.id limit 100;
$$;
revoke all on function public.omni_post_thread(uuid) from public,anon,authenticated;
grant execute on function public.omni_post_thread(uuid) to anon,authenticated;
create or replace function omni_private.omni_social_context(article_ids uuid[]) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'thread_id',a.thread_id,'thread_position',a.thread_position,
 'thread_count',(select count(*) from public.omni_articles part where part.thread_id=a.thread_id and (part.status='published' or a.status='draft' and part.status='draft' and (a.author_id=auth.uid() or omni_private.omni_is_admin()))),
 'thread_start_id',(select part.id from public.omni_articles part where part.thread_id=a.thread_id and part.status='published' order by part.thread_position limit 1),'quoted_article_id',a.quoted_article_id,'has_quote',a.has_quote,
 'repost_count',(select count(*) from public.omni_reposts r join public.omni_profiles p on p.id=r.user_id and not p.disabled where r.article_id=a.id),
 'quote_count',(select count(*) from public.omni_articles q where q.quoted_article_id=a.id and q.status='published'),
 'quoted_article',(select jsonb_build_object('id',q.id,'content_type',q.content_type,'status',q.status,'original_locale',q.original_locale,'created_at',q.created_at,'published_at',q.published_at,'author_id',q.author_id,'author_name',p.display_name,'author_handle',p.handle,'author_avatar_key',p.avatar_key,
 'thumbnail_url',jsonb_path_query_first(q.translations->q.original_locale,'$.document.** ? (@.type == "image").attrs.src')#>>'{}',
 'translations',(select jsonb_object_agg(lang,jsonb_build_object('title',case when q.content_type='news' then text->>'title' else '' end,'summary',left(coalesce(nullif(text->>'summary',''),text->>'body'),350),'body','')) from jsonb_each(q.translations) as t(lang,text) where q.content_type='news' or lang=q.original_locale))
 from public.omni_articles q left join public.omni_profiles p on p.id=q.author_id where q.id=a.quoted_article_id and q.status='published'))
 from public.omni_articles a where a.id=any(article_ids[1:100]) and (a.status='published' or a.author_id=auth.uid() and omni_private.omni_role() is not null or omni_private.omni_is_admin());
$$;


create or replace function public.omni_content_feed(content_kind text default 'post',filter_category text default 'all',filter_query text default '',sort_by text default 'latest',page_size integer default 20,offset_rows integer default 0,own_only boolean default false,bookmarks_only boolean default false,featured_only boolean default false,author_filter uuid default null,following_only boolean default false,media_only boolean default false,include_reposts boolean default true,news_language text default null,quote_filter uuid default null)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
  select a.*,r.user_id reposter_id,r.created_at reposted_at,greatest(coalesce(a.published_at,a.created_at),coalesce(r.created_at,a.created_at)) feed_at from public.omni_articles a
  left join lateral (select rp.user_id,rp.created_at from omni_private.omni_feed_reposts(a.id) rp
   where include_reposts and a.content_type='post' and not own_only and not bookmarks_only and not media_only and quote_filter is null
   and (author_filter is null or rp.user_id=author_filter)
   and (not following_only or exists(select 1 from public.omni_follows ff where ff.follower_id=(select auth.uid()) and ff.following_id=rp.user_id))
   order by rp.created_at desc,rp.user_id limit 1) r on true
  where (content_kind='all' or a.content_type=content_kind)
   and (author_filter is null or a.author_id=author_filter or r.user_id=author_filter)
   and (not following_only or r.user_id is not null or exists(select 1 from public.omni_follows f where f.follower_id=(select auth.uid()) and f.following_id=a.author_id))
   and (not media_only or jsonb_path_exists(a.translations,'$.*.document.** ? (@.type == "image" || @.type == "embed")'))
   and (quote_filter is null or a.quoted_article_id=quote_filter)
   and (a.content_type='post' or news_language is null or a.translations ? news_language)
   and (a.thread_id is null or author_filter is not null or bookmarks_only or media_only or quote_filter is not null or coalesce(filter_query,'')<>'' or r.user_id is not null
     or not exists(select 1 from public.omni_articles earlier where earlier.thread_id=a.thread_id and earlier.thread_position<a.thread_position and earlier.status=a.status and (filter_category='all' or earlier.category=filter_category) and (not featured_only or earlier.featured)))
   and (filter_category='all' or a.category=filter_category)
   and (not featured_only or a.featured)
   and (case when own_only then a.author_id=(select auth.uid()) else a.status='published' end)
   and (not bookmarks_only or omni_private.omni_has_bookmark(a.id))
   and (coalesce(filter_query,'')='' or exists(select 1 from jsonb_each(a.translations) v where (a.content_type='news' or v.key=a.original_locale) and position(lower(left(filter_query,120)) in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')||' '||coalesce(v.value->>'body','')))>0))
 ), selected as materialized (
  select a.*,coalesce(c.like_count,0) as likes,coalesce(c.comment_count,0) as comments from candidates a
  left join lateral omni_private.omni_content_counts(a.id) c on true
  order by (case when not own_only then a.featured else false end) desc,
   (case when sort_by='popular' then coalesce(c.like_count,0) else 0 end) desc,
   a.feed_at desc,a.id desc
  limit greatest(1,least(coalesce(page_size,20),50))+1 offset greatest(0,least(coalesce(offset_rows,0),100000))
 ) select coalesce(social.value,'{}'::jsonb)||jsonb_build_object('reposter_id',s.reposter_id,'reposter_name',rp.display_name,'reposter_handle',rp.handle,'reposted_at',s.reposted_at,'id',s.id,'slug',s.slug,'category',s.category,'status',s.status,'original_locale',s.original_locale,'author_id',s.author_id,'author_handle',p.handle,'author_name',coalesce(p.display_name,s.author_name),'author_avatar_key',p.avatar_key,'content_type',s.content_type,'featured',s.featured,'locked',s.locked,'moderated',s.moderated,'cover_style',s.cover_style,'source_url',s.source_url,'created_at',s.created_at,'updated_at',s.updated_at,'published_at',s.published_at,'like_count',s.likes,'comment_count',s.comments,'thumbnail_url',coalesce(jsonb_path_query_first(s.translations->s.original_locale,'$.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}',jsonb_path_query_first(s.translations,'$.*.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}'),
 'media',coalesce((select jsonb_agg(jsonb_build_object('type',m.n->>'type','url',coalesce(m.n->'attrs'->>'src',m.n->'attrs'->>'url'),'alt',m.n->'attrs'->>'alt') order by m.position) from (select n,min(position) as position from jsonb_path_query(s.translations->s.original_locale,'$.document.** ? (@.type == "image" || @.type == "embed")') with ordinality as nodes(n,position) group by n order by min(position) limit 8) m),'[]'::jsonb),
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',case when s.content_type='post' then left(coalesce(nullif(v.value->>'body',''),v.value->>'summary',''),600) else v.value->>'summary' end,'body','')) from jsonb_each(s.translations) v where s.content_type='news' or v.key=s.original_locale)) from selected s
 left join lateral public.omni_public_profiles(array[s.author_id]) p on true
 left join lateral public.omni_public_profiles(array[s.reposter_id]) rp on true
 left join lateral public.omni_social_context(array[s.id]) social(value) on true
 order by (case when not own_only then s.featured else false end) desc,(case when sort_by='popular' then s.likes else 0 end) desc,s.feed_at desc,s.id desc;
$$;


commit;
