begin;
alter table public.omni_articles
 add column content_type text not null default 'news' check(content_type in ('news','post')),
 add column locked boolean not null default false,
 add column moderated boolean not null default false,
 add column author_name text not null default 'Explorer';
update public.omni_articles a set author_name=p.display_name from public.omni_profiles p where a.author_id=p.id;
create index omni_articles_type_feed on public.omni_articles(content_type,status,published_at desc);
create index omni_articles_author_created on public.omni_articles(author_id,created_at desc);
alter table public.omni_settings drop constraint omni_settings_ugc_enabled_check;
alter table public.omni_settings alter column ugc_enabled set default true;
update public.omni_settings set ugc_enabled=true where id;
grant update(ugc_enabled) on public.omni_settings to authenticated;

drop policy articles_read on public.omni_articles;
create policy articles_read on public.omni_articles for select to anon,authenticated using(
 status='published' or (select omni_private.omni_is_admin()) or
 (content_type='post' and author_id=(select auth.uid()) and (select omni_private.omni_role()) is not null));
drop policy articles_insert on public.omni_articles;
create policy articles_insert on public.omni_articles for insert to authenticated with check(
 author_id=(select auth.uid()) and ((select omni_private.omni_is_admin()) or
 (content_type='post' and (select omni_private.omni_role()) is not null and not featured and not locked and not moderated
 and status in ('draft','published') and (select ugc_enabled from public.omni_settings where id))));
drop policy articles_update on public.omni_articles;
create policy articles_update on public.omni_articles for update to authenticated using(
 (select omni_private.omni_is_admin()) or (content_type='post' and author_id=(select auth.uid()) and not moderated and not locked
 and (select omni_private.omni_role()) is not null and (select ugc_enabled from public.omni_settings where id)))
 with check((select omni_private.omni_is_admin()) or (content_type='post' and author_id=(select auth.uid()) and not moderated and not locked
 and (select omni_private.omni_role()) is not null and (select ugc_enabled from public.omni_settings where id)));
drop policy articles_delete on public.omni_articles;
create policy articles_delete on public.omni_articles for delete to authenticated using(
 (select omni_private.omni_is_admin()) or (content_type='post' and author_id=(select auth.uid()) and (select omni_private.omni_role()) is not null));

-- Invoker guard supplements RLS: ownership and moderation flags are never user-controlled.
create function omni_private.omni_guard_content() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.slug is distinct from old.slug or new.author_id is distinct from old.author_id
   or new.content_type is distinct from old.content_type or new.created_at is distinct from old.created_at
   or new.published_at is distinct from old.published_at then
   raise exception 'Content identity and timestamps are immutable' using errcode='42501';
  end if;
  if not omni_private.omni_is_admin() and (new.featured is distinct from old.featured or new.locked is distinct from old.locked
    or new.moderated is distinct from old.moderated) then raise exception 'Only administrators can moderate' using errcode='42501'; end if;
  new.author_name=old.author_name;
 else
  new.created_at=now(); new.published_at=null;
  new.author_name=coalesce((select display_name from public.omni_profiles where id=new.author_id),'Explorer');
 end if;
 if new.moderated and new.status='published' then raise exception 'Restore moderation before publishing'; end if;
 if octet_length(new.translations::text)>1000000 then raise exception 'Content too large'; end if;
 return new;
end; $$;
-- Alphabetic ordering runs the immutable-field guard before the existing validator stamps publication time.
create trigger omni_article_guard before insert or update on public.omni_articles for each row execute function omni_private.omni_guard_content();
create function omni_private.omni_post_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.content_type<>'post' or omni_private.omni_is_admin() then return new; end if;
 if new.author_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('post:'||auth.uid()::text));
 if exists(select 1 from public.omni_articles where author_id=auth.uid() and content_type='post' and created_at>now()-interval '30 seconds')
 then raise exception 'Please wait 30 seconds before creating another post'; end if;
 return new;
end; $$;
create trigger omni_post_throttle before insert on public.omni_articles for each row execute function omni_private.omni_post_limit();
revoke all on function omni_private.omni_guard_content(),omni_private.omni_post_limit() from public,anon,authenticated;

drop policy comments_add on public.omni_comments;
create policy comments_add on public.omni_comments for insert to authenticated with check(
 user_id=(select auth.uid()) and (select omni_private.omni_role()) is not null
 and (select comments_enabled from public.omni_settings where id)
 and exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published' and not a.locked));
grant update(body) on public.omni_comments to authenticated;
create policy comments_update on public.omni_comments for update to authenticated
 using((select omni_private.omni_is_admin()) or (user_id=(select auth.uid()) and (select omni_private.omni_role()) is not null
 and exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published' and not a.locked)))
 with check((select omni_private.omni_is_admin()) or (user_id=(select auth.uid()) and (select omni_private.omni_role()) is not null
 and exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published' and not a.locked)));
drop trigger omni_comment_audit on public.omni_comments;
create trigger omni_comment_audit after update or delete on public.omni_comments for each row execute function omni_private.omni_record_audit();
commit;
