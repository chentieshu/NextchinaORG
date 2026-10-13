begin;
alter table public.omni_profiles add column handle text, add column bio text not null default '' check(length(bio)<=160), add column website text not null default '' check(length(website)<=500);
update public.omni_profiles set handle='u_'||replace(id::text,'-','');
alter table public.omni_profiles alter column handle set not null;
alter table public.omni_profiles add constraint profile_handle_format check(handle~'^[a-z0-9_]{3,40}$');
create unique index omni_profiles_handle on public.omni_profiles(lower(handle));
create function omni_private.omni_default_handle() returns trigger language plpgsql set search_path='' as $$begin new.handle=coalesce(new.handle,'u_'||replace(new.id::text,'-',''));return new;end;$$;
create trigger omni_default_handle before insert on public.omni_profiles for each row execute function omni_private.omni_default_handle();
revoke all on function omni_private.omni_default_handle() from public,anon,authenticated;

create function omni_private.omni_update_bio(new_handle text,new_bio text,new_website text,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.omni_profiles;
begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 select * into p from public.omni_profiles where id=auth.uid() for update;
 if expected_updated_at is null or p.updated_at<>expected_updated_at then raise exception 'Profile changed' using errcode='PT409';end if;
 if new_handle is null or lower(trim(new_handle))!~'^[a-z0-9_]{3,40}$' or new_bio is null or length(new_bio)>160 or new_website is null or length(new_website)>500 or (new_website<>'' and (new_website!~'^https://[^/@[:space:]]+([/].*)?$' or new_website~'[[:cntrl:]]')) then raise exception 'Invalid profile' using errcode='PT400';end if;
 update public.omni_profiles set handle=lower(trim(new_handle)),bio=trim(new_bio),website=trim(new_website) where id=auth.uid() returning * into p;
 return to_jsonb(p);
end;$$;
create function public.omni_update_bio(new_handle text,new_bio text,new_website text,expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_update_bio(new_handle,new_bio,new_website,expected_updated_at);$$;
revoke all on function omni_private.omni_update_bio(text,text,text,timestamptz),public.omni_update_bio(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.omni_update_bio(text,text,text,timestamptz),public.omni_update_bio(text,text,text,timestamptz) to authenticated;

create table public.omni_follows(follower_id uuid not null references public.omni_profiles(id) on delete cascade,following_id uuid not null references public.omni_profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(follower_id,following_id),check(follower_id<>following_id));
create index omni_follows_following on public.omni_follows(following_id,created_at desc);
alter table public.omni_follows enable row level security;
grant select on public.omni_follows to anon,authenticated;
grant insert(follower_id,following_id),delete on public.omni_follows to authenticated;
create policy follows_read on public.omni_follows for select to anon,authenticated using(true);
create policy follows_insert on public.omni_follows for insert to authenticated with check(follower_id=(select auth.uid()) and (select omni_private.omni_role()) is not null);
create policy follows_delete on public.omni_follows for delete to authenticated using(follower_id=(select auth.uid()) and (select omni_private.omni_role()) is not null);
create function omni_private.omni_follow_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.omni_profiles where id=new.following_id and not disabled) then raise exception 'User unavailable' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.follower_id::text,843));
 if (select count(*) from public.omni_follows where follower_id=new.follower_id and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait before following again' using errcode='PT429';end if;
 new.created_at=now();return new;end;$$;
create trigger omni_follow_guard before insert on public.omni_follows for each row execute function omni_private.omni_follow_guard();
revoke all on function omni_private.omni_follow_guard() from public,anon,authenticated;

create function omni_private.omni_profile_page(target_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'avatar_key',p.avatar_key,'handle',p.handle,'bio',p.bio,'website',p.website,'created_at',p.created_at,
 'follower_count',(select count(*) from public.omni_follows where following_id=p.id),'following_count',(select count(*) from public.omni_follows where follower_id=p.id),
 'post_count',(select count(*) from public.omni_articles where author_id=p.id and status='published' and content_type='post'),
 'following',exists(select 1 from public.omni_follows where follower_id=auth.uid() and following_id=p.id)) from public.omni_profiles p where p.id=target_user and not p.disabled;
$$;
create function public.omni_profile_page(target_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.omni_profile_page(target_user);$$;
revoke all on function omni_private.omni_profile_page(uuid),public.omni_profile_page(uuid) from public,anon,authenticated;
grant execute on function omni_private.omni_profile_page(uuid),public.omni_profile_page(uuid) to anon,authenticated;
create function omni_private.omni_follow_list(target_user uuid,list_kind text,offset_rows integer default 0) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'avatar_key',p.avatar_key,'handle',p.handle,'bio',p.bio) from public.omni_follows f join public.omni_profiles p on p.id=case when list_kind='followers' then f.follower_id else f.following_id end
 where list_kind in ('followers','following') and case when list_kind='followers' then f.following_id=target_user else f.follower_id=target_user end and not p.disabled order by f.created_at desc,p.id limit 31 offset greatest(0,least(offset_rows,100000));$$;
create function public.omni_follow_list(target_user uuid,list_kind text,offset_rows integer default 0) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.omni_follow_list(target_user,list_kind,offset_rows);$$;
revoke all on function omni_private.omni_follow_list(uuid,text,integer),public.omni_follow_list(uuid,text,integer) from public,anon,authenticated;
grant execute on function omni_private.omni_follow_list(uuid,text,integer),public.omni_follow_list(uuid,text,integer) to anon,authenticated;

-- Posts are body-first. News keeps its existing title and body requirements.
create or replace function omni_private.omni_validate_article() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;lang text;attachments integer;
begin
 if jsonb_typeof(new.translations)<>'object' or not(new.translations ? new.original_locale) then raise exception 'Original translation required';end if;
 for lang,item in select key,value from jsonb_each(new.translations) loop
  if lang not in ('zh-CN','en','ja','es','zh-TW') or jsonb_typeof(item)<>'object' or coalesce(jsonb_typeof(item->'title'),'')<>'string' or length(item->>'title')>200 or coalesce(jsonb_typeof(item->'summary'),'')<>'string' or length(item->>'summary')>500 or coalesce(jsonb_typeof(item->'body'),'')<>'string' or length(item->>'body')>100000 then raise exception 'Invalid translation';end if;
  if new.content_type='news' and (length(trim(item->>'title'))<1 or length(trim(item->>'body'))<1) then raise exception 'News title and body required';end if;
  if new.content_type='post' and length(trim(item->>'body'))=0 and not jsonb_path_exists(item,'$.document.** ? (@.type == "image" && @.attrs.src starts with "https://media.nextchina.org/")') and not jsonb_path_exists(item,'$.document.** ? (@.type == "embed" && @.attrs.url starts with "https://")') then raise exception 'Post content required';end if;
  select count(*) into attachments from jsonb_path_query(item,'strict $.document.** ? (@.type == "image")','{}',true) n;
  if new.content_type='post' and attachments>4 then raise exception 'Maximum four images';end if;
 end loop;
 new.updated_at=clock_timestamp();if new.status='published' and new.published_at is null then new.published_at=now();end if;return new;
end;$$;

alter table public.omni_comments add column parent_id uuid references public.omni_comments(id) on delete set null, add column depth smallint not null default 0 check(depth between 0 and 32), add column deleted boolean not null default false;
create index omni_comments_parent on public.omni_comments(article_id,parent_id,created_at,id);
grant insert(parent_id) on public.omni_comments to authenticated;
create function omni_private.omni_reply_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent public.omni_comments;
begin
 if tg_op='INSERT' then
  new.depth=0;new.deleted=false;
  if new.parent_id is not null then select * into parent from public.omni_comments where id=new.parent_id;
   if not found or parent.article_id<>new.article_id or parent.depth>=32 then raise exception 'Invalid reply parent' using errcode='PT400';end if;
   new.depth=parent.depth+1;
  end if;
 else
  if new.article_id is distinct from old.article_id or new.user_id is distinct from old.user_id or new.id is distinct from old.id or new.created_at is distinct from old.created_at or new.depth is distinct from old.depth then raise exception 'Reply identity is immutable' using errcode='PT403';end if;
  if new.parent_id is distinct from old.parent_id and not(new.parent_id is null and not exists(select 1 from public.omni_comments where id=old.parent_id)) then raise exception 'Reply parent is immutable' using errcode='PT403';end if;
  if old.deleted and (new.body is distinct from old.body or new.document is distinct from old.document) then raise exception 'Reply deleted' using errcode='PT400';end if;
 end if;return new;
end;$$;
create trigger omni_reply_guard before insert or update on public.omni_comments for each row execute function omni_private.omni_reply_guard();
revoke all on function omni_private.omni_reply_guard() from public,anon,authenticated;
create function omni_private.omni_remove_comment(target_comment uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 update public.omni_comments set body='[deleted]',document=null,deleted=true where id=target_comment and not deleted and (user_id=auth.uid() or omni_private.omni_is_admin());
 if not found then raise exception 'Reply unavailable' using errcode='PT404';end if;end;$$;
create function public.omni_remove_comment(target_comment uuid) returns void language sql security invoker set search_path='' as $$select omni_private.omni_remove_comment(target_comment);$$;
revoke all on function omni_private.omni_remove_comment(uuid),public.omni_remove_comment(uuid) from public,anon,authenticated;
grant execute on function omni_private.omni_remove_comment(uuid),public.omni_remove_comment(uuid) to authenticated;

create function omni_private.omni_thread_replies(target_article uuid,parent_comment uuid default null,offset_rows integer default 0) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'article_id',c.article_id,'user_id',c.user_id,'body',c.body,'document',c.document,'created_at',c.created_at,'updated_at',c.updated_at,'parent_id',c.parent_id,'depth',c.depth,'deleted',c.deleted,'display_name',p.display_name,'avatar_key',p.avatar_key,'parent_name',pp.display_name,
 'reply_count',(select count(*) from public.omni_comments ch where ch.parent_id=c.id and (not ch.deleted or exists(select 1 from public.omni_comments gc where gc.parent_id=ch.id))))
 from public.omni_comments c join public.omni_articles a on a.id=c.article_id join public.omni_profiles p on p.id=c.user_id left join public.omni_comments pc on pc.id=c.parent_id left join public.omni_profiles pp on pp.id=pc.user_id
 where c.article_id=target_article and c.parent_id is not distinct from parent_comment and (a.status='published' or omni_private.omni_is_admin()) and (not c.deleted or exists(select 1 from public.omni_comments ch where ch.parent_id=c.id))
 order by c.created_at,c.id limit 31 offset greatest(0,least(offset_rows,100000));$$;
create function public.omni_thread_replies(target_article uuid,parent_comment uuid default null,offset_rows integer default 0) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.omni_thread_replies(target_article,parent_comment,offset_rows);$$;
revoke all on function omni_private.omni_thread_replies(uuid,uuid,integer),public.omni_thread_replies(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function omni_private.omni_thread_replies(uuid,uuid,integer),public.omni_thread_replies(uuid,uuid,integer) to anon,authenticated;

create function public.omni_user_replies(target_user uuid,offset_rows integer default 0) returns setof jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'article_id',c.article_id,'body',c.body,'document',c.document,'created_at',c.created_at,'content_type',a.content_type) from public.omni_comments c join public.omni_articles a on a.id=c.article_id where c.user_id=target_user and not c.deleted and a.status='published' order by c.created_at desc,c.id desc limit 31 offset greatest(0,least(offset_rows,100000));$$;
revoke all on function public.omni_user_replies(uuid,integer) from public,anon,authenticated;
grant execute on function public.omni_user_replies(uuid,integer) to anon,authenticated;
create or replace function omni_private.omni_content_counts(target_article uuid) returns table(like_count bigint,comment_count bigint)
language sql stable security definer set search_path='' as $$
 select (select count(*) from public.omni_likes where article_id=target_article),(select count(*) from public.omni_comments where article_id=target_article and not deleted)
 where exists(select 1 from public.omni_articles where id=target_article and (status='published' or author_id=auth.uid() or omni_private.omni_is_admin()));
$$;
drop function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean);
create or replace function public.omni_content_feed(content_kind text default 'post',filter_category text default 'all',filter_query text default '',sort_by text default 'latest',page_size integer default 20,offset_rows integer default 0,own_only boolean default false,bookmarks_only boolean default false,featured_only boolean default false,author_filter uuid default null,following_only boolean default false,media_only boolean default false)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
  select a.* from public.omni_articles a
  where (content_kind='all' or a.content_type=content_kind)
   and (author_filter is null or a.author_id=author_filter)
   and (not following_only or exists(select 1 from public.omni_follows f where f.follower_id=(select auth.uid()) and f.following_id=a.author_id))
   and (not media_only or jsonb_path_exists(a.translations,'$.*.document.** ? (@.type == "image" || @.type == "embed")'))
   and (filter_category='all' or a.category=filter_category)
   and (not featured_only or a.featured)
   and (case when own_only then a.author_id=(select auth.uid()) else a.status='published' end)
   and (not bookmarks_only or omni_private.omni_has_bookmark(a.id))
   and (coalesce(filter_query,'')='' or exists(select 1 from jsonb_each(a.translations) v where position(lower(left(filter_query,120)) in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')||' '||coalesce(v.value->>'body','')))>0))
 ), selected as materialized (
  select a.*,coalesce(c.like_count,0) as likes,coalesce(c.comment_count,0) as comments from candidates a
  left join lateral omni_private.omni_content_counts(a.id) c on true
  order by (case when not own_only then a.featured else false end) desc,
   (case when sort_by='popular' then coalesce(c.like_count,0) else 0 end) desc,
   coalesce(a.published_at,a.created_at) desc,a.id desc
  limit greatest(1,least(coalesce(page_size,20),50))+1 offset greatest(0,least(coalesce(offset_rows,0),100000))
 ) select jsonb_build_object('id',s.id,'slug',s.slug,'category',s.category,'status',s.status,'original_locale',s.original_locale,'author_id',s.author_id,'author_name',coalesce(p.display_name,s.author_name),'author_avatar_key',p.avatar_key,'content_type',s.content_type,'featured',s.featured,'locked',s.locked,'moderated',s.moderated,'cover_style',s.cover_style,'source_url',s.source_url,'created_at',s.created_at,'updated_at',s.updated_at,'published_at',s.published_at,'like_count',s.likes,'comment_count',s.comments,'thumbnail_url',coalesce(jsonb_path_query_first(s.translations->s.original_locale,'$.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}',jsonb_path_query_first(s.translations,'$.*.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}'),
 'media',coalesce((select jsonb_agg(jsonb_build_object('type',m.n->>'type','url',coalesce(m.n->'attrs'->>'src',m.n->'attrs'->>'url'),'alt',m.n->'attrs'->>'alt') order by m.position) from (select n,min(position) as position from jsonb_path_query(s.translations->s.original_locale,'$.document.** ? (@.type == "image" || @.type == "embed")') with ordinality as nodes(n,position) group by n order by min(position) limit 8) m),'[]'::jsonb),
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',case when s.content_type='post' then left(coalesce(nullif(v.value->>'body',''),v.value->>'summary',''),600) else v.value->>'summary' end,'body','')) from jsonb_each(s.translations) v)) from selected s
 left join lateral public.omni_public_profiles(array[s.author_id]) p on true
 order by (case when not own_only then s.featured else false end) desc,(case when sort_by='popular' then s.likes else 0 end) desc,coalesce(s.published_at,s.created_at) desc,s.id desc;
$$;
revoke all on function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean,uuid,boolean,boolean) to anon,authenticated;
commit;
