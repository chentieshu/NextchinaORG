begin;

-- Brand changes never rename existing infrastructure or invalidate account IDs.
alter table public.omni_profiles
 add column news_locale text check(news_locale in ('zh-CN','en','ja','es','zh-TW')),
 add column embed_mode text not null default 'click' check(embed_mode in ('click','auto')),
 add column show_reposts boolean not null default true;
revoke update(news_locale,embed_mode,show_reposts) on public.omni_profiles from public,anon,authenticated;
create function omni_private.omni_save_reading_preferences(new_news_locale text,new_embed_mode text,new_show_reposts boolean,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare p public.omni_profiles;begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 if (new_news_locale is not null and new_news_locale not in ('zh-CN','en','ja','es','zh-TW')) or new_embed_mode is null or new_embed_mode not in ('click','auto') or new_show_reposts is null then raise exception 'Invalid preferences' using errcode='PT400';end if;
 update public.omni_profiles set news_locale=new_news_locale,embed_mode=new_embed_mode,show_reposts=new_show_reposts where id=auth.uid() and updated_at=expected_updated_at returning * into p;
 if not found then raise exception 'Profile changed' using errcode='PT409';end if;return to_jsonb(p);
end;$$;
create function public.omni_save_reading_preferences(new_news_locale text,new_embed_mode text,new_show_reposts boolean,expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_save_reading_preferences(new_news_locale,new_embed_mode,new_show_reposts,expected_updated_at);$$;
revoke all on function omni_private.omni_save_reading_preferences(text,text,boolean,timestamptz),public.omni_save_reading_preferences(text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.omni_save_reading_preferences(text,text,boolean,timestamptz),public.omni_save_reading_preferences(text,text,boolean,timestamptz) to authenticated;

alter table public.omni_articles add column quoted_article_id uuid references public.omni_articles(id) on delete set null,
 add column has_quote boolean not null default false;
create index omni_articles_quoted on public.omni_articles(quoted_article_id) where quoted_article_id is not null;
create function omni_private.omni_quote_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and (new.quoted_article_id is distinct from old.quoted_article_id or new.has_quote is distinct from old.has_quote) then
  -- FK deletion may clear the reference, while preserving the unavailable placeholder.
  if not(new.quoted_article_id is null and old.quoted_article_id is not null and pg_trigger_depth()>1) then raise exception 'Quote identity cannot change' using errcode='PT400';end if;
 end if;
 if tg_op='INSERT' then
  new.has_quote=new.quoted_article_id is not null;
  if new.has_quote and (new.content_type<>'post' or new.quoted_article_id=new.id or not exists(select 1 from public.omni_articles where id=new.quoted_article_id and content_type='post' and status='published')) then raise exception 'Original post unavailable' using errcode='PT404';end if;
 end if;
 return new;
end;$$;
revoke all on function omni_private.omni_quote_guard() from public,anon,authenticated;
create trigger omni_01_quote_guard before insert or update on public.omni_articles for each row execute function omni_private.omni_quote_guard();

create table public.omni_reposts(
 user_id uuid not null references public.omni_profiles(id) on delete cascade,
 article_id uuid not null references public.omni_articles(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,article_id));
create index omni_reposts_article on public.omni_reposts(article_id,created_at desc,user_id);
create index omni_reposts_user_time on public.omni_reposts(user_id,created_at desc);
alter table public.omni_reposts enable row level security;
grant select,delete on public.omni_reposts to authenticated;
grant select on public.omni_reposts to anon;
grant insert(user_id,article_id) on public.omni_reposts to authenticated;
create policy reposts_read on public.omni_reposts for select to anon,authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published'));
create policy reposts_insert on public.omni_reposts for insert to authenticated with check(user_id=(select auth.uid()) and (select omni_private.omni_role()) is not null and exists(select 1 from public.omni_articles a where a.id=article_id and a.content_type='post' and a.status='published'));
create policy reposts_delete on public.omni_reposts for delete to authenticated using(user_id=(select auth.uid()) and (select omni_private.omni_role()) is not null);
create trigger omni_00_profile_required before insert on public.omni_reposts for each row execute function omni_private.omni_require_completed_profile();
create function omni_private.omni_repost_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,844));
 if (select count(*) from public.omni_reposts where user_id=new.user_id and created_at>now()-interval '1 minute')>=20 then raise exception 'Please wait before reposting' using errcode='PT429';end if;
 new.created_at=clock_timestamp();return new;
end;$$;
revoke all on function omni_private.omni_repost_guard() from public,anon,authenticated;
create trigger omni_repost_guard before insert on public.omni_reposts for each row execute function omni_private.omni_repost_guard();

-- Public, single-level quote summaries. Never return a private original, even to an admin.
create function omni_private.omni_social_context(article_ids uuid[]) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'quoted_article_id',a.quoted_article_id,'has_quote',a.has_quote,
 'repost_count',(select count(*) from public.omni_reposts r join public.omni_profiles p on p.id=r.user_id and not p.disabled where r.article_id=a.id),
 'quote_count',(select count(*) from public.omni_articles q where q.quoted_article_id=a.id and q.status='published'),
 'quoted_article',(select jsonb_build_object('id',q.id,'content_type',q.content_type,'status',q.status,'original_locale',q.original_locale,'created_at',q.created_at,'published_at',q.published_at,'author_id',q.author_id,'author_name',p.display_name,'author_handle',p.handle,'author_avatar_key',p.avatar_key,
 'thumbnail_url',jsonb_path_query_first(q.translations->q.original_locale,'$.document.** ? (@.type == "image").attrs.src')#>>'{}',
 'translations',jsonb_build_object(q.original_locale,jsonb_build_object('title','','summary',left(q.translations->q.original_locale->>'body',350),'body','')))
 from public.omni_articles q left join public.omni_profiles p on p.id=q.author_id where q.id=a.quoted_article_id and q.status='published'))
 from public.omni_articles a where a.id=any(article_ids[1:100]) and (a.status='published' or a.author_id=auth.uid() and omni_private.omni_role() is not null or omni_private.omni_is_admin());
$$;
create function public.omni_social_context(article_ids uuid[]) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.omni_social_context(article_ids);$$;
revoke all on function omni_private.omni_social_context(uuid[]),public.omni_social_context(uuid[]) from public,anon,authenticated;
grant execute on function omni_private.omni_social_context(uuid[]),public.omni_social_context(uuid[]) to anon,authenticated;

-- Cloud drafts are private to the editor and separate from the live article.
create table public.omni_content_drafts(
 article_id uuid not null references public.omni_articles(id) on delete cascade,
 user_id uuid not null references public.omni_profiles(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=1000000),
 base_updated_at timestamptz not null,updated_at timestamptz not null default clock_timestamp(),primary key(article_id,user_id));
create index omni_content_drafts_user on public.omni_content_drafts(user_id,updated_at desc);
alter table public.omni_content_drafts enable row level security;
grant select on public.omni_content_drafts to authenticated;
create policy drafts_read on public.omni_content_drafts for select to authenticated using(user_id=(select auth.uid()) and (select omni_private.omni_role()) is not null);
create function omni_private.omni_save_content_draft(target_article uuid,new_payload jsonb,expected_article_at timestamptz,expected_draft_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.omni_articles;d public.omni_content_drafts;begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 select * into a from public.omni_articles where id=target_article for update;
 if not found or not(omni_private.omni_is_admin() or a.content_type='post' and a.author_id=auth.uid() and not a.locked and not a.moderated and (select ugc_enabled from public.omni_settings where id)) then raise exception 'Forbidden' using errcode='PT403';end if;
 if a.updated_at is distinct from expected_article_at then raise exception 'Content changed' using errcode='PT409';end if;
 if new_payload is null or jsonb_typeof(new_payload)<>'object' or octet_length(new_payload::text)>1000000 or jsonb_typeof(new_payload->'translations') is distinct from 'object' then raise exception 'Invalid draft' using errcode='PT400';end if;
 select * into d from public.omni_content_drafts where article_id=target_article and user_id=auth.uid() for update;
 if d.updated_at is distinct from expected_draft_at then raise exception 'Draft changed' using errcode='PT409';end if;
 insert into public.omni_content_drafts(article_id,user_id,payload,base_updated_at) values(target_article,auth.uid(),new_payload,a.updated_at)
 on conflict(article_id,user_id) do update set payload=excluded.payload,base_updated_at=excluded.base_updated_at,updated_at=clock_timestamp() returning * into d;
 return to_jsonb(d);
end;$$;
create function public.omni_save_content_draft(target_article uuid,new_payload jsonb,expected_article_at timestamptz,expected_draft_at timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_save_content_draft(target_article,new_payload,expected_article_at,expected_draft_at);$$;
-- Invoker publishing preserves RLS and all existing content validators. The update and draft cleanup are atomic.
create function public.omni_publish_content(target_article uuid,new_payload jsonb,expected_article_at timestamptz,expected_draft_at timestamptz default null,remaining_payload jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare a public.omni_articles;begin
 if target_article is null then
  insert into public.omni_articles(translations,original_locale,category,source_url,cover_style,status,content_type,author_id,quoted_article_id) values(new_payload->'translations',new_payload->>'original_locale',new_payload->>'category',nullif(new_payload->>'source_url',''),(new_payload->>'cover_style')::integer,'published',new_payload->>'content_type',auth.uid(),(new_payload->>'quoted_article_id')::uuid) returning * into a;
 else
 update public.omni_articles set translations=new_payload->'translations',original_locale=new_payload->>'original_locale',category=new_payload->>'category',source_url=nullif(new_payload->>'source_url',''),cover_style=(new_payload->>'cover_style')::integer,status='published' where id=target_article and updated_at=expected_article_at returning * into a;
 if not found then raise exception 'Content changed' using errcode='PT409';end if;
 end if;
 perform omni_private.omni_clear_content_draft(a.id,expected_draft_at);
 if remaining_payload is not null then perform omni_private.omni_save_content_draft(a.id,remaining_payload,a.updated_at,null);end if;
 return to_jsonb(a);
end;$$;
create function omni_private.omni_clear_content_draft(target_article uuid,expected_draft_at timestamptz) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 delete from public.omni_content_drafts where article_id=target_article and user_id=auth.uid() and updated_at=expected_draft_at;
 if not found and expected_draft_at is not null then raise exception 'Draft changed' using errcode='PT409';end if;
end;$$;
revoke all on function omni_private.omni_save_content_draft(uuid,jsonb,timestamptz,timestamptz),public.omni_save_content_draft(uuid,jsonb,timestamptz,timestamptz),public.omni_publish_content(uuid,jsonb,timestamptz,timestamptz,jsonb),omni_private.omni_clear_content_draft(uuid,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.omni_save_content_draft(uuid,jsonb,timestamptz,timestamptz),public.omni_save_content_draft(uuid,jsonb,timestamptz,timestamptz),public.omni_publish_content(uuid,jsonb,timestamptz,timestamptz,jsonb),omni_private.omni_clear_content_draft(uuid,timestamptz) to authenticated;

-- A verified second factor must be satisfied on every protected database operation.
-- to_regclass keeps clean-room migrations usable before Auth is installed in tests.
create or replace function omni_private.omni_role() returns text language plpgsql stable security definer set search_path='' as $$declare role_value text;factor_exists boolean:=false;begin
 select role into role_value from public.omni_profiles where id=auth.uid() and not disabled;
 if role_value is null then return null;end if;
 if to_regclass('auth.mfa_factors') is not null then
  select exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') into factor_exists;
 end if;
 if factor_exists and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')<>'aal2' then return null;end if;
 return role_value;
end;$$;

-- The media gateway uses the same MFA-aware authority as database writes.
create function public.omni_account_role() returns text language sql stable security invoker set search_path='' as $$select omni_private.omni_role();$$;
revoke all on function public.omni_account_role() from public,anon,authenticated;
grant execute on function public.omni_account_role() to authenticated;

create or replace function omni_private.omni_thread_replies(target_article uuid,parent_comment uuid default null,offset_rows integer default 0) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'article_id',c.article_id,'user_id',c.user_id,'body',c.body,'document',c.document,'created_at',c.created_at,'updated_at',c.updated_at,'parent_id',c.parent_id,'depth',c.depth,'deleted',c.deleted,'display_name',p.display_name,'handle',p.handle,'avatar_key',p.avatar_key,'parent_name',pp.display_name,
 'reply_count',(select count(*) from public.omni_comments ch where ch.parent_id=c.id and (not ch.deleted or exists(select 1 from public.omni_comments gc where gc.parent_id=ch.id))))
 from public.omni_comments c join public.omni_articles a on a.id=c.article_id join public.omni_profiles p on p.id=c.user_id left join public.omni_comments pc on pc.id=c.parent_id left join public.omni_profiles pp on pp.id=pc.user_id
 where c.article_id=target_article and c.parent_id is not distinct from parent_comment and (a.status='published' or omni_private.omni_is_admin()) and (not c.deleted or exists(select 1 from public.omni_comments ch where ch.parent_id=c.id))
 order by c.created_at,c.id limit 31 offset greatest(0,least(offset_rows,100000));$$;

create function omni_private.omni_feed_reposts(target_article uuid) returns table(user_id uuid,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select r.user_id,r.created_at from public.omni_reposts r join public.omni_profiles p on p.id=r.user_id and not p.disabled join public.omni_articles a on a.id=r.article_id and a.status='published' where r.article_id=target_article;
$$;
revoke all on function omni_private.omni_feed_reposts(uuid) from public,anon,authenticated;
grant execute on function omni_private.omni_feed_reposts(uuid) to anon,authenticated;
drop function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean,uuid,boolean,boolean);
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

revoke all on function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean,uuid,boolean,boolean,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.omni_content_feed(text,text,text,text,integer,integer,boolean,boolean,boolean,uuid,boolean,boolean,boolean,text,uuid) to anon,authenticated;
create function public.omni_set_repost(target_article uuid,new_state boolean) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 if new_state then insert into public.omni_reposts(user_id,article_id) values(auth.uid(),target_article) on conflict(user_id,article_id) do nothing;
 else delete from public.omni_reposts where user_id=auth.uid() and article_id=target_article;end if;
 return jsonb_build_object('reposted',exists(select 1 from public.omni_reposts where user_id=auth.uid() and article_id=target_article),'repost_count',(select count(*) from omni_private.omni_feed_reposts(target_article)));
end;$$;
revoke all on function public.omni_set_repost(uuid,boolean) from public,anon,authenticated;
grant execute on function public.omni_set_repost(uuid,boolean) to authenticated;
create or replace function omni_private.omni_validate_article() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;lang text;attachments integer;
begin
 if jsonb_typeof(new.translations)<>'object' or not(new.translations ? new.original_locale) then raise exception 'Original translation required';end if;
 for lang,item in select key,value from jsonb_each(new.translations) loop
  if lang not in ('zh-CN','en','ja','es','zh-TW') or jsonb_typeof(item)<>'object' or coalesce(jsonb_typeof(item->'title'),'')<>'string' or length(item->>'title')>200 or coalesce(jsonb_typeof(item->'summary'),'')<>'string' or length(item->>'summary')>500 or coalesce(jsonb_typeof(item->'body'),'')<>'string' or length(item->>'body')>100000 then raise exception 'Invalid translation';end if;
  if new.content_type='news' and (length(trim(item->>'title'))<1 or length(trim(item->>'body'))<1) then raise exception 'News title and body required';end if;
  if new.content_type='post' and not new.has_quote and length(trim(item->>'body'))=0 and not jsonb_path_exists(item,'$.document.** ? (@.type == "image" && @.attrs.src starts with "https://media.nextchina.org/")') and not jsonb_path_exists(item,'$.document.** ? (@.type == "embed" && @.attrs.url starts with "https://")') then raise exception 'Post content required';end if;
  select count(*) into attachments from jsonb_path_query(item,'strict $.document.** ? (@.type == "image")','{}',true) n;
  if new.content_type='post' and attachments>4 then raise exception 'Maximum four images';end if;
 end loop;
 new.updated_at=clock_timestamp();if new.status='published' and new.published_at is null then new.published_at=now();end if;return new;
end;$$;
create function public.omni_discard_content_draft(target_article uuid,expected_draft_at timestamptz) returns void language sql security invoker set search_path='' as $$select omni_private.omni_clear_content_draft(target_article,expected_draft_at);$$;
revoke all on function public.omni_discard_content_draft(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.omni_discard_content_draft(uuid,timestamptz) to authenticated;
commit;
