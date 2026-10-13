begin;
alter table public.omni_profiles
 add column avatar_key text,
 add column avatar_source text not null default 'provider' check(avatar_source in ('provider','custom','none')),
 add column updated_at timestamptz not null default now();

create function omni_private.omni_profile_timestamp() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at=clock_timestamp();return new;end;$$;
create trigger omni_profile_timestamp before update on public.omni_profiles for each row execute function omni_private.omni_profile_timestamp();
revoke all on function omni_private.omni_profile_timestamp() from public,anon,authenticated;

-- Quota ledger. Images themselves live only in Cloudflare R2, never in Postgres.
create table omni_private.media_uploads(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.omni_profiles(id) on delete cascade,
 kind text not null check(kind in ('avatar','content')),bytes integer not null check(bytes>0 and bytes<=4194304),
 object_key text not null unique,created_at timestamptz not null default now()
);
create index media_uploads_owner_created on omni_private.media_uploads(owner_id,created_at);
alter table omni_private.media_uploads enable row level security;
revoke all on omni_private.media_uploads from public,anon,authenticated;

create function omni_private.omni_reserve_media(media_kind text,media_bytes integer,media_extension text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid();asset uuid=gen_random_uuid();object_path text;uploads bigint;total_bytes bigint;
begin
 if actor is null or omni_private.omni_role() is null then raise exception 'Account unavailable' using errcode='PT403';end if;
 if media_kind is null or media_kind not in ('avatar','content') or media_extension is null or media_extension not in ('webp','png','jpg') or media_bytes is null or media_bytes<24 or media_bytes>(case when media_kind='avatar' then 2097152 else 4194304 end) then raise exception 'Invalid image' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,731));
 select count(*),coalesce(sum(bytes),0) into uploads,total_bytes from omni_private.media_uploads where owner_id=actor and created_at>now()-interval '24 hours';
 if uploads>=50 or total_bytes+media_bytes>52428800 then raise exception 'Daily image quota reached' using errcode='PT429';end if;
 object_path=(case when media_kind='avatar' then 'avatars' else 'content' end)||'/'||actor||'/'||asset||'.'||media_extension;
 insert into omni_private.media_uploads(id,owner_id,kind,bytes,object_key) values(asset,actor,media_kind,media_bytes,object_path);
 return jsonb_build_object('object_key',object_path);
end;$$;
create function public.omni_reserve_media(media_kind text,media_bytes integer,media_extension text) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_reserve_media(media_kind,media_bytes,media_extension);$$;
revoke all on function omni_private.omni_reserve_media(text,integer,text),public.omni_reserve_media(text,integer,text) from public,anon,authenticated;
grant execute on function omni_private.omni_reserve_media(text,integer,text),public.omni_reserve_media(text,integer,text) to authenticated;

create function omni_private.omni_save_profile(new_name text,new_avatar_key text,new_source text,expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid();p public.omni_profiles;
begin
 if actor is null or omni_private.omni_role() is null then raise exception 'Account unavailable' using errcode='PT403';end if;
 select * into p from public.omni_profiles where id=actor for update;
 if expected_updated_at is null or p.updated_at<>expected_updated_at then raise exception 'Profile changed' using errcode='PT409';end if;
 if new_name is null or length(trim(new_name)) not between 1 and 80 or new_name~'[[:cntrl:]]' or new_source is null or new_source not in ('keep','provider','custom','none') then raise exception 'Invalid profile' using errcode='PT400';end if;
 if new_source in ('provider','custom') and (new_avatar_key is null or not exists(select 1 from omni_private.media_uploads where owner_id=actor and kind='avatar' and object_key=new_avatar_key)) then raise exception 'Avatar ownership required' using errcode='PT403';end if;
 update public.omni_profiles set display_name=trim(new_name),
  avatar_key=case when new_source='keep' then avatar_key when new_source='none' then null else new_avatar_key end,
  avatar_source=case when new_source='keep' then avatar_source else new_source end
 where id=actor returning * into p;
 return to_jsonb(p);
end;$$;
create function public.omni_save_profile(new_name text,new_avatar_key text,new_source text,expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_save_profile(new_name,new_avatar_key,new_source,expected_updated_at);$$;
revoke all on function omni_private.omni_save_profile(text,text,text,timestamptz),public.omni_save_profile(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.omni_save_profile(text,text,text,timestamptz),public.omni_save_profile(text,text,text,timestamptz) to authenticated;

-- Intentionally public identity fields only. Private account rows, email, roles and status stay protected.
create function omni_private.omni_public_profiles(profile_ids uuid[]) returns table(id uuid,display_name text,avatar_key text)
language sql stable security definer set search_path='' as $$select p.id,p.display_name,p.avatar_key from public.omni_profiles p where p.id=any(profile_ids[1:100]);$$;
create function public.omni_public_profiles(profile_ids uuid[]) returns table(id uuid,display_name text,avatar_key text)
language sql stable security invoker set search_path='' as $$select * from omni_private.omni_public_profiles(profile_ids);$$;
revoke all on function omni_private.omni_public_profiles(uuid[]),public.omni_public_profiles(uuid[]) from public,anon,authenticated;
grant execute on function omni_private.omni_public_profiles(uuid[]),public.omni_public_profiles(uuid[]) to anon,authenticated;

drop function public.omni_rich_comments(uuid,integer);
drop function omni_private.omni_rich_comments(uuid,integer);
create function omni_private.omni_rich_comments(target_article uuid,offset_rows integer default 0)
returns table(id uuid,article_id uuid,user_id uuid,body text,document jsonb,created_at timestamptz,updated_at timestamptz,display_name text,avatar_key text)
language sql stable security definer set search_path='' as $$
 select c.id,c.article_id,c.user_id,c.body,c.document,c.created_at,c.updated_at,p.display_name,p.avatar_key
 from public.omni_comments c join public.omni_profiles p on p.id=c.user_id join public.omni_articles a on a.id=c.article_id
 where c.article_id=target_article and (a.status='published' or omni_private.omni_is_admin())
 order by c.created_at,c.id limit 51 offset greatest(0,least(offset_rows,100000));$$;
create function public.omni_rich_comments(target_article uuid,offset_rows integer default 0)
returns table(id uuid,article_id uuid,user_id uuid,body text,document jsonb,created_at timestamptz,updated_at timestamptz,display_name text,avatar_key text)
language sql stable security invoker set search_path='' as $$select * from omni_private.omni_rich_comments(target_article,offset_rows);$$;
revoke all on function omni_private.omni_rich_comments(uuid,integer),public.omni_rich_comments(uuid,integer) from public,anon,authenticated;
grant execute on function omni_private.omni_rich_comments(uuid,integer),public.omni_rich_comments(uuid,integer) to anon,authenticated;

-- Feed rows join current public identities; the legacy stored author_name remains only for old clients.
create or replace function public.omni_content_feed(content_kind text default 'post',filter_category text default 'all',filter_query text default '',sort_by text default 'latest',page_size integer default 20,offset_rows integer default 0,own_only boolean default false,bookmarks_only boolean default false,featured_only boolean default false)
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
 ) select jsonb_build_object('id',s.id,'slug',s.slug,'category',s.category,'status',s.status,'original_locale',s.original_locale,'author_id',s.author_id,'author_name',coalesce(p.display_name,s.author_name),'author_avatar_key',p.avatar_key,'content_type',s.content_type,'featured',s.featured,'locked',s.locked,'moderated',s.moderated,'cover_style',s.cover_style,'source_url',s.source_url,'created_at',s.created_at,'updated_at',s.updated_at,'published_at',s.published_at,'like_count',s.likes,'comment_count',s.comments,'thumbnail_url',coalesce(jsonb_path_query_first(s.translations->s.original_locale,'$.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}',jsonb_path_query_first(s.translations,'$.*.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}'),
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',v.value->>'summary','body','')) from jsonb_each(s.translations) v)) from selected s
 left join lateral public.omni_public_profiles(array[s.author_id]) p on true
 order by (case when not own_only then s.featured else false end) desc,(case when sort_by='popular' then s.likes else 0 end) desc,coalesce(s.published_at,s.created_at) desc,s.id desc;
$$;
commit;
