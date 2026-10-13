begin;
-- Public allowlisted account ownership only, sourced from Auth's OAuth identities.
-- Never expose email, tokens, arbitrary metadata or disabled/incomplete profiles.
create function omni_private.omni_public_connections(profile_ids uuid[]) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'accounts',coalesce((select jsonb_agg(jsonb_build_object('provider',case when i.provider='twitter' then 'x' else i.provider end,'provider_id',i.provider_id,'handle',i.identity_data->>'user_name','url',case when i.provider='github' then 'https://github.com/' else 'https://x.com/' end || (i.identity_data->>'user_name')) order by i.provider)
 from auth.identities i where i.user_id=p.id and i.provider in ('github','x','twitter') and i.provider_id ~ '^[0-9]{1,22}$' and case when i.provider='github' then (i.identity_data->>'user_name') ~ '^[a-zA-Z0-9-]{1,39}$' else (i.identity_data->>'user_name') ~ '^[a-zA-Z0-9_]{1,15}$' end),'[]'::jsonb))
 from public.omni_profiles p where p.id=any(profile_ids[1:100]) and not p.disabled and p.profile_completed_at is not null;
$$;
create function public.omni_public_connections(profile_ids uuid[]) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.omni_public_connections(profile_ids);$$;
revoke all on function omni_private.omni_public_connections(uuid[]),public.omni_public_connections(uuid[]) from public,anon,authenticated;
grant execute on function omni_private.omni_public_connections(uuid[]),public.omni_public_connections(uuid[]) to anon,authenticated;

-- A private per-account gate prevents public page visits and concurrent requests from spending X API credits.
create table omni_private.omni_x_metric_sync(user_id uuid primary key references public.omni_profiles(id) on delete cascade,requested_at timestamptz not null);
alter table omni_private.omni_x_metric_sync enable row level security;
revoke all on omni_private.omni_x_metric_sync from public,anon,authenticated;
create function omni_private.omni_claim_x_metric_sync(expected_provider_id text) returns boolean language plpgsql security definer set search_path='' as $$declare allowed uuid;begin
 if auth.uid() is null or omni_private.omni_role() is null or not exists(select 1 from auth.identities where user_id=auth.uid() and provider in ('x','twitter') and provider_id=expected_provider_id) then raise exception 'Forbidden' using errcode='PT403';end if;
 insert into omni_private.omni_x_metric_sync(user_id,requested_at) values(auth.uid(),clock_timestamp()) on conflict(user_id) do update set requested_at=excluded.requested_at where omni_private.omni_x_metric_sync.requested_at<clock_timestamp()-interval '24 hours' returning user_id into allowed;
 return allowed is not null;
end;$$;
create function public.omni_claim_x_metric_sync(expected_provider_id text) returns boolean language sql security invoker set search_path='' as $$select omni_private.omni_claim_x_metric_sync(expected_provider_id);$$;
revoke all on function omni_private.omni_claim_x_metric_sync(text),public.omni_claim_x_metric_sync(text) from public,anon,authenticated;
grant execute on function omni_private.omni_claim_x_metric_sync(text),public.omni_claim_x_metric_sync(text) to authenticated;

create or replace function omni_private.omni_quote_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and (new.quoted_article_id is distinct from old.quoted_article_id or new.has_quote is distinct from old.has_quote) then
  -- FK deletion may clear the reference, while preserving the unavailable placeholder.
  if not(new.quoted_article_id is null and old.quoted_article_id is not null and pg_trigger_depth()>1) then raise exception 'Quote identity cannot change' using errcode='PT400';end if;
 end if;
 if tg_op='INSERT' then
  new.has_quote=new.quoted_article_id is not null;
  if new.has_quote and (new.content_type<>'post' or new.quoted_article_id=new.id or not exists(select 1 from public.omni_articles where id=new.quoted_article_id and status='published')) then raise exception 'Original content unavailable' using errcode='PT404';end if;
 end if;
 return new;
end;$$;

create or replace function omni_private.omni_social_context(article_ids uuid[]) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'quoted_article_id',a.quoted_article_id,'has_quote',a.has_quote,
 'repost_count',(select count(*) from public.omni_reposts r join public.omni_profiles p on p.id=r.user_id and not p.disabled where r.article_id=a.id),
 'quote_count',(select count(*) from public.omni_articles q where q.quoted_article_id=a.id and q.status='published'),
 'quoted_article',(select jsonb_build_object('id',q.id,'content_type',q.content_type,'status',q.status,'original_locale',q.original_locale,'created_at',q.created_at,'published_at',q.published_at,'author_id',q.author_id,'author_name',p.display_name,'author_handle',p.handle,'author_avatar_key',p.avatar_key,
 'thumbnail_url',jsonb_path_query_first(q.translations->q.original_locale,'$.document.** ? (@.type == "image").attrs.src')#>>'{}',
 'translations',(select jsonb_object_agg(lang,jsonb_build_object('title',case when q.content_type='news' then text->>'title' else '' end,'summary',left(coalesce(nullif(text->>'summary',''),text->>'body'),350),'body','')) from jsonb_each(q.translations) as t(lang,text) where q.content_type='news' or lang=q.original_locale))
 from public.omni_articles q left join public.omni_profiles p on p.id=q.author_id where q.id=a.quoted_article_id and q.status='published'))
 from public.omni_articles a where a.id=any(article_ids[1:100]) and (a.status='published' or a.author_id=auth.uid() and omni_private.omni_role() is not null or omni_private.omni_is_admin());
$$;

create or replace function omni_private.omni_validate_article() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;lang text;attachments integer;
begin
 if jsonb_typeof(new.translations)<>'object' or not(new.translations ? new.original_locale) then raise exception 'Original translation required';end if;
 for lang,item in select key,value from jsonb_each(new.translations) loop
  if lang not in ('zh-CN','en','ja','es','zh-TW') or jsonb_typeof(item)<>'object' or coalesce(jsonb_typeof(item->'title'),'')<>'string' or length(item->>'title')>200 or coalesce(jsonb_typeof(item->'summary'),'')<>'string' or length(item->>'summary')>500 or coalesce(jsonb_typeof(item->'body'),'')<>'string' or length(item->>'body')>100000 then raise exception 'Invalid translation';end if;
  if new.content_type='news' and (length(trim(item->>'title'))<1 or length(trim(item->>'body'))<1) then raise exception 'News title and body required';end if;
  if new.content_type='post' and not new.has_quote and length(trim(item->>'body'))=0 and not jsonb_path_exists(item,'$.document.** ? (@.type == "image" && (@.attrs.src starts with "https://media.nextchina.org/" || @.attrs.src starts with "https://media.chinateam.org/"))') and not jsonb_path_exists(item,'$.document.** ? (@.type == "embed" && @.attrs.url starts with "https://")') then raise exception 'Post content required';end if;
  select count(*) into attachments from jsonb_path_query(item,'strict $.document.** ? (@.type == "image")','{}',true) n;
  if new.content_type='post' and attachments>4 then raise exception 'Maximum four images';end if;
 end loop;
 new.updated_at=clock_timestamp();if new.status='published' and new.published_at is null then new.published_at=now();end if;return new;
end;$$;

commit;
