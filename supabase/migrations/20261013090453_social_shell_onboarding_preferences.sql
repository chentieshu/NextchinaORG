begin;
alter table public.omni_profiles add column profile_completed_at timestamptz,
 add column ui_locale text check(ui_locale in ('zh-CN','en','ja','es','zh-TW')),
 add column theme text not null default 'system' check(theme in ('system','light','dark'));
-- Keep deliberately chosen historical usernames. Generated placeholders still need confirmation.
update public.omni_profiles set profile_completed_at=now() where handle !~ '^u_[0-9a-f]{32}$';
revoke update(profile_completed_at,ui_locale,theme) on public.omni_profiles from public,anon,authenticated;

create function omni_private.omni_complete_profile(new_name text,new_handle text,new_locale text,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.omni_profiles;begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 select * into p from public.omni_profiles where id=auth.uid() for update;
 if p.profile_completed_at is not null then return to_jsonb(p);end if;
 if expected_updated_at is null or p.updated_at<>expected_updated_at then raise exception 'Profile changed' using errcode='PT409';end if;
 if new_name is null or length(trim(new_name)) not between 1 and 80 or new_name~'[[:cntrl:]]' or new_handle is null or lower(trim(new_handle))!~'^[a-z0-9_]{3,40}$' or lower(trim(new_handle))~'^u_[0-9a-f]{32}$' or new_locale is null or new_locale not in ('zh-CN','en','ja','es','zh-TW') then raise exception 'Invalid profile' using errcode='PT400';end if;
 update public.omni_profiles set display_name=trim(new_name),handle=lower(trim(new_handle)),ui_locale=new_locale,profile_completed_at=clock_timestamp() where id=auth.uid() returning * into p;
 return to_jsonb(p);
end;$$;
create function public.omni_complete_profile(new_name text,new_handle text,new_locale text,expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_complete_profile(new_name,new_handle,new_locale,expected_updated_at);$$;
create function omni_private.omni_save_preferences(new_locale text,new_theme text,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.omni_profiles;begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 if new_locale is null or new_locale not in ('zh-CN','en','ja','es','zh-TW') or new_theme is null or new_theme not in ('system','light','dark') then raise exception 'Invalid preferences' using errcode='PT400';end if;
 update public.omni_profiles set ui_locale=new_locale,theme=new_theme where id=auth.uid() and updated_at=expected_updated_at returning * into p;
 if not found then raise exception 'Profile changed' using errcode='PT409';end if;return to_jsonb(p);
end;$$;
create function public.omni_save_preferences(new_locale text,new_theme text,expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_save_preferences(new_locale,new_theme,expected_updated_at);$$;
revoke all on function omni_private.omni_complete_profile(text,text,text,timestamptz),public.omni_complete_profile(text,text,text,timestamptz),omni_private.omni_save_preferences(text,text,timestamptz),public.omni_save_preferences(text,text,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.omni_complete_profile(text,text,text,timestamptz),public.omni_complete_profile(text,text,text,timestamptz),omni_private.omni_save_preferences(text,text,timestamptz),public.omni_save_preferences(text,text,timestamptz) to authenticated;

create function omni_private.omni_require_completed_profile() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and not exists(select 1 from public.omni_profiles where id=auth.uid() and not disabled and profile_completed_at is not null) then raise exception 'Complete your profile first' using errcode='PT403';end if;return new;
end;$$;
revoke all on function omni_private.omni_require_completed_profile() from public,anon,authenticated;
create trigger omni_00_profile_required before insert or update on public.omni_articles for each row execute function omni_private.omni_require_completed_profile();
create trigger omni_00_profile_required before insert or update on public.omni_comments for each row execute function omni_private.omni_require_completed_profile();
create trigger omni_00_profile_required before insert on public.omni_likes for each row execute function omni_private.omni_require_completed_profile();
create trigger omni_00_profile_required before insert on public.omni_bookmarks for each row execute function omni_private.omni_require_completed_profile();
create trigger omni_00_profile_required before insert on public.omni_follows for each row execute function omni_private.omni_require_completed_profile();

create function omni_private.omni_post_original_only() returns trigger language plpgsql set search_path='' as $$begin
 if new.content_type='post' and (tg_op='INSERT' or new.translations is distinct from old.translations) and (select count(*) from jsonb_object_keys(new.translations))<>1 then raise exception 'Posts have one original body' using errcode='PT400';end if;
 if tg_op='UPDATE' and new.content_type='post' and new.original_locale is distinct from old.original_locale then raise exception 'Post original key cannot change' using errcode='PT400';end if;return new;
end;$$;
revoke all on function omni_private.omni_post_original_only() from public,anon,authenticated;
create trigger omni_post_original_only before insert or update on public.omni_articles for each row execute function omni_private.omni_post_original_only();

-- Extend the existing batch identity API; no duplicate profile store or per-author HTTP request.
drop function public.omni_public_profiles(uuid[]);
drop function omni_private.omni_public_profiles(uuid[]);
create function omni_private.omni_public_profiles(profile_ids uuid[]) returns table(id uuid,display_name text,avatar_key text,handle text) language sql stable security definer set search_path='' as $$select p.id,p.display_name,p.avatar_key,p.handle from public.omni_profiles p where p.id=any(profile_ids[1:100]);$$;
create function public.omni_public_profiles(profile_ids uuid[]) returns table(id uuid,display_name text,avatar_key text,handle text) language sql stable security invoker set search_path='' as $$select * from omni_private.omni_public_profiles(profile_ids);$$;
revoke all on function omni_private.omni_public_profiles(uuid[]),public.omni_public_profiles(uuid[]) from public,anon,authenticated;
grant execute on function omni_private.omni_public_profiles(uuid[]),public.omni_public_profiles(uuid[]) to anon,authenticated;

create function omni_private.omni_search(search_query text,result_kind text default 'all',offset_rows integer default 0) returns setof jsonb language sql stable security definer set search_path='' as $$
 with needle as (select lower(left(trim(coalesce(search_query,'')),120)) q),
 matches as (
  select a.id,a.created_at,a.content_type kind from public.omni_articles a,needle n where n.q<>'' and a.status='published' and (result_kind='all' or result_kind=a.content_type)
   and exists(select 1 from jsonb_each(a.translations) v where (a.content_type='news' or v.key=a.original_locale) and position(n.q in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'body','')))>0)
  union all
  select p.id,p.created_at,'user' from public.omni_profiles p,needle n where n.q<>'' and result_kind in ('all','user') and not p.disabled and p.profile_completed_at is not null and position(n.q in lower(p.display_name||' '||p.handle||' '||p.bio))>0
  union all
  select c.id,c.created_at,'reply' from public.omni_comments c join public.omni_articles a on a.id=c.article_id,needle n where n.q<>'' and result_kind in ('all','reply') and a.status='published' and not c.deleted and position(n.q in lower(c.body))>0
 ), selected as materialized (select * from matches order by created_at desc,id desc,kind limit 21 offset greatest(0,least(coalesce(offset_rows,0),100000)))
 select case when s.kind='user' then jsonb_build_object('kind','user','profile',(select jsonb_build_object('id',p.id,'display_name',p.display_name,'handle',p.handle,'avatar_key',p.avatar_key,'bio',p.bio) from public.omni_profiles p where p.id=s.id))
 when s.kind='reply' then jsonb_build_object('kind','reply','reply',(select jsonb_build_object('id',c.id,'article_id',c.article_id,'content_type',a.content_type,'body',left(c.body,500),'created_at',c.created_at,'user_id',c.user_id,'display_name',p.display_name,'handle',p.handle,'avatar_key',p.avatar_key) from public.omni_comments c join public.omni_articles a on a.id=c.article_id left join public.omni_profiles p on p.id=c.user_id where c.id=s.id))
 else jsonb_build_object('kind',s.kind,'article',(select jsonb_build_object('id',a.id,'slug',a.slug,'category',a.category,'status',a.status,'original_locale',a.original_locale,'author_id',a.author_id,'author_name',p.display_name,'author_handle',p.handle,'author_avatar_key',p.avatar_key,'content_type',a.content_type,'created_at',a.created_at,'updated_at',a.updated_at,'published_at',a.published_at,'featured',a.featured,'locked',a.locked,'moderated',a.moderated,'cover_style',a.cover_style,'source_url',a.source_url,
 'like_count',(select count(*) from public.omni_likes where article_id=a.id),'comment_count',(select count(*) from public.omni_comments where article_id=a.id and not deleted),
 'thumbnail_url',jsonb_path_query_first(a.translations->a.original_locale,'$.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}',
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',case when a.content_type='post' then left(v.value->>'body',600) else v.value->>'summary' end,'body','')) from jsonb_each(a.translations) v where a.content_type='news' or v.key=a.original_locale)) from public.omni_articles a left join public.omni_profiles p on p.id=a.author_id where a.id=s.id)) end
 from selected s order by s.created_at desc,s.id desc,s.kind;
$$;
create function public.omni_search(search_query text,result_kind text default 'all',offset_rows integer default 0) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.omni_search(search_query,result_kind,offset_rows);$$;
revoke all on function omni_private.omni_search(text,text,integer),public.omni_search(text,text,integer) from public,anon,authenticated;
grant execute on function omni_private.omni_search(text,text,integer),public.omni_search(text,text,integer) to anon,authenticated;
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
   and (coalesce(filter_query,'')='' or exists(select 1 from jsonb_each(a.translations) v where (a.content_type='news' or v.key=a.original_locale) and position(lower(left(filter_query,120)) in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')||' '||coalesce(v.value->>'body','')))>0))
 ), selected as materialized (
  select a.*,coalesce(c.like_count,0) as likes,coalesce(c.comment_count,0) as comments from candidates a
  left join lateral omni_private.omni_content_counts(a.id) c on true
  order by (case when not own_only then a.featured else false end) desc,
   (case when sort_by='popular' then coalesce(c.like_count,0) else 0 end) desc,
   coalesce(a.published_at,a.created_at) desc,a.id desc
  limit greatest(1,least(coalesce(page_size,20),50))+1 offset greatest(0,least(coalesce(offset_rows,0),100000))
 ) select jsonb_build_object('id',s.id,'slug',s.slug,'category',s.category,'status',s.status,'original_locale',s.original_locale,'author_id',s.author_id,'author_handle',p.handle,'author_name',coalesce(p.display_name,s.author_name),'author_avatar_key',p.avatar_key,'content_type',s.content_type,'featured',s.featured,'locked',s.locked,'moderated',s.moderated,'cover_style',s.cover_style,'source_url',s.source_url,'created_at',s.created_at,'updated_at',s.updated_at,'published_at',s.published_at,'like_count',s.likes,'comment_count',s.comments,'thumbnail_url',coalesce(jsonb_path_query_first(s.translations->s.original_locale,'$.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}',jsonb_path_query_first(s.translations,'$.*.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}'),
 'media',coalesce((select jsonb_agg(jsonb_build_object('type',m.n->>'type','url',coalesce(m.n->'attrs'->>'src',m.n->'attrs'->>'url'),'alt',m.n->'attrs'->>'alt') order by m.position) from (select n,min(position) as position from jsonb_path_query(s.translations->s.original_locale,'$.document.** ? (@.type == "image" || @.type == "embed")') with ordinality as nodes(n,position) group by n order by min(position) limit 8) m),'[]'::jsonb),
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',case when s.content_type='post' then left(coalesce(nullif(v.value->>'body',''),v.value->>'summary',''),600) else v.value->>'summary' end,'body','')) from jsonb_each(s.translations) v where s.content_type='news' or v.key=s.original_locale)) from selected s
 left join lateral public.omni_public_profiles(array[s.author_id]) p on true
 order by (case when not own_only then s.featured else false end) desc,(case when sort_by='popular' then s.likes else 0 end) desc,coalesce(s.published_at,s.created_at) desc,s.id desc;
$$;
commit;
