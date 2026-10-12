begin;

create table public.omni_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80),
 role text not null default 'member' check(role in ('member','editor','super_admin')),
 disabled boolean not null default false,
 created_at timestamptz not null default now()
);
create function public.omni_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.omni_profiles where id=(select auth.uid()) and not disabled;
$$;
create function public.omni_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.omni_role() in ('editor','super_admin'),false);
$$;
create function public.omni_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.omni_profiles(id,display_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'name',''),nullif(new.raw_user_meta_data->>'user_name',''),'Explorer'),80));
 return new;
end; $$;
create trigger omni_user_created after insert on auth.users for each row execute function public.omni_new_user();
insert into public.omni_profiles(id,display_name) select id,left(coalesce(nullif(raw_user_meta_data->>'name',''),'Explorer'),80) from auth.users on conflict(id) do nothing;

create table public.omni_articles (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique default gen_random_uuid()::text,
 category text not null check(category in ('ai','opensource','hardware','design','frontier')),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 original_locale text not null check(original_locale in ('zh-CN','en','ja','es','zh-TW')),
 translations jsonb not null default '{}',
 source_url text check(source_url is null or (source_url ~ '^https://' and length(source_url)<2048)),
 cover_style smallint not null default 0 check(cover_style between 0 and 5),
 featured boolean not null default false,
 author_id uuid references public.omni_profiles(id) on delete set null,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index omni_articles_published on public.omni_articles(status,published_at desc);
create table public.omni_likes (
 article_id uuid not null references public.omni_articles(id) on delete cascade,
 user_id uuid not null references public.omni_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(article_id,user_id)
);
create table public.omni_bookmarks (
 article_id uuid not null references public.omni_articles(id) on delete cascade,
 user_id uuid not null references public.omni_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(article_id,user_id)
);
create index omni_bookmarks_user on public.omni_bookmarks(user_id);
create index omni_likes_user on public.omni_likes(user_id);
create table public.omni_comments (
 id uuid primary key default gen_random_uuid(),
 article_id uuid not null references public.omni_articles(id) on delete cascade,
 user_id uuid not null references public.omni_profiles(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index omni_comments_article on public.omni_comments(article_id,created_at);
create index omni_comments_user_time on public.omni_comments(user_id,created_at desc);
create table public.omni_settings (
 id boolean primary key default true check(id),
 notice text not null default '' check(length(notice)<=500),
 comments_enabled boolean not null default true,
 ugc_enabled boolean not null default false check(not ugc_enabled)
);
insert into public.omni_settings(id) values(true);
create table public.omni_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references public.omni_profiles(id) on delete set null,
 action text not null, target text not null, created_at timestamptz not null default now()
);
-- Future UGC requires a new migration and reviewed policies before writes can open.
create table public.omni_submissions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.omni_profiles(id) on delete cascade,
 content jsonb not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now()
);

alter table public.omni_profiles enable row level security;
alter table public.omni_articles enable row level security;
alter table public.omni_likes enable row level security;
alter table public.omni_bookmarks enable row level security;
alter table public.omni_comments enable row level security;
alter table public.omni_settings enable row level security;
alter table public.omni_audit enable row level security;
alter table public.omni_submissions enable row level security;

create policy profiles_read on public.omni_profiles for select to authenticated using(id=(select auth.uid()) or (select public.omni_is_admin()));
-- Profile and role writes are only possible through the guarded owner RPC below.
create policy articles_read on public.omni_articles for select to anon,authenticated using(status='published' or (select public.omni_is_admin()));
create policy articles_insert on public.omni_articles for insert to authenticated with check((select public.omni_is_admin()) and author_id=(select auth.uid()));
create policy articles_update on public.omni_articles for update to authenticated using((select public.omni_is_admin())) with check((select public.omni_is_admin()));
create policy articles_delete on public.omni_articles for delete to authenticated using((select public.omni_is_admin()));
create policy likes_read on public.omni_likes for select to authenticated using(user_id=(select auth.uid()));
create policy likes_add on public.omni_likes for insert to authenticated with check(user_id=(select auth.uid()) and (select public.omni_role()) is not null and exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published'));
create policy likes_remove on public.omni_likes for delete to authenticated using(user_id=(select auth.uid()) and (select public.omni_role()) is not null);
create policy bookmarks_read on public.omni_bookmarks for select to authenticated using(user_id=(select auth.uid()));
create policy bookmarks_add on public.omni_bookmarks for insert to authenticated with check(user_id=(select auth.uid()) and (select public.omni_role()) is not null and exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published'));
create policy bookmarks_remove on public.omni_bookmarks for delete to authenticated using(user_id=(select auth.uid()) and (select public.omni_role()) is not null);
create policy comments_read on public.omni_comments for select to anon,authenticated using(exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published') or (select public.omni_is_admin()));
create policy comments_add on public.omni_comments for insert to authenticated with check(user_id=(select auth.uid()) and (select public.omni_role()) is not null and (select comments_enabled from public.omni_settings where id) and exists(select 1 from public.omni_articles a where a.id=article_id and a.status='published'));
create policy comments_remove on public.omni_comments for delete to authenticated using((user_id=(select auth.uid()) and (select public.omni_role()) is not null) or (select public.omni_is_admin()));
create policy settings_read on public.omni_settings for select to anon,authenticated using(true);
create policy settings_update on public.omni_settings for update to authenticated using((select public.omni_role())='super_admin') with check((select public.omni_role())='super_admin');
create policy audit_read on public.omni_audit for select to authenticated using((select public.omni_role())='super_admin');
create policy submissions_read on public.omni_submissions for select to authenticated using(user_id=(select auth.uid()) or (select public.omni_is_admin()));

create function public.omni_validate_article() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; lang text;
begin
 if jsonb_typeof(new.translations)<>'object' or not(new.translations ? new.original_locale) then raise exception 'Original translation required'; end if;
 for lang,item in select key,value from jsonb_each(new.translations) loop
  if lang not in ('zh-CN','en','ja','es','zh-TW') or jsonb_typeof(item)<>'object'
    or coalesce(jsonb_typeof(item->'title'),'')<>'string' or length(trim(item->>'title')) not between 1 and 200
    or coalesce(jsonb_typeof(item->'summary'),'')<>'string' or length(trim(item->>'summary')) not between 1 and 500
    or coalesce(jsonb_typeof(item->'body'),'')<>'string' or length(trim(item->>'body')) not between 1 and 100000
  then raise exception 'Invalid translation'; end if;
 end loop;
 new.updated_at=now();
 if new.status='published' and new.published_at is null then new.published_at=now(); end if;
 return new;
end; $$;
create trigger omni_article_validate before insert or update on public.omni_articles for each row execute function public.omni_validate_article();

create function public.omni_comment_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext(new.user_id::text));
 if exists(select 1 from public.omni_comments where user_id=new.user_id and created_at>now()-interval '10 seconds') then raise exception 'Please wait before commenting again'; end if;
 new.created_at=now(); return new;
end; $$;
create trigger omni_comment_throttle before insert on public.omni_comments for each row execute function public.omni_comment_limit();

create function public.omni_record_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.omni_audit(actor_id,action,target) values(auth.uid(),tg_op || ':' || tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id','settings'));
 return coalesce(new,old);
end; $$;
create trigger omni_article_audit after insert or update or delete on public.omni_articles for each row execute function public.omni_record_audit();
create trigger omni_settings_audit after update on public.omni_settings for each row execute function public.omni_record_audit();
create trigger omni_profile_audit after update on public.omni_profiles for each row execute function public.omni_record_audit();
create trigger omni_comment_audit after delete on public.omni_comments for each row execute function public.omni_record_audit();

create function public.omni_manage_user(target_user uuid,new_role text,new_disabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.omni_role() is distinct from 'super_admin' then raise exception 'Forbidden' using errcode='42501'; end if;
 if new_role not in ('member','editor') or new_role is null or new_disabled is null then raise exception 'Invalid role'; end if;
 if target_user=auth.uid() then raise exception 'Cannot change own access'; end if;
 update public.omni_profiles set role=new_role,disabled=new_disabled where id=target_user and role<>'super_admin';
 if not found then raise exception 'User not found or protected owner'; end if;
end; $$;

create function public.omni_article_counts() returns table(article_id uuid,like_count bigint,comment_count bigint) language sql stable security definer set search_path='' as $$
 select a.id,(select count(*) from public.omni_likes l where l.article_id=a.id),(select count(*) from public.omni_comments c where c.article_id=a.id)
 from public.omni_articles a where a.status='published';
$$;
create function public.omni_article_comments(target_article uuid,offset_rows integer default 0) returns table(id uuid,article_id uuid,user_id uuid,body text,created_at timestamptz,display_name text) language sql stable security definer set search_path='' as $$
 select c.id,c.article_id,c.user_id,c.body,c.created_at,p.display_name from public.omni_comments c join public.omni_profiles p on p.id=c.user_id join public.omni_articles a on a.id=c.article_id
 where c.article_id=target_article and (a.status='published' or public.omni_is_admin()) order by c.created_at,c.id limit 50 offset greatest(0,least(offset_rows,100000));
$$;

revoke all on public.omni_profiles,public.omni_articles,public.omni_likes,public.omni_bookmarks,public.omni_comments,public.omni_settings,public.omni_audit,public.omni_submissions from anon,authenticated;
grant select on public.omni_articles,public.omni_comments,public.omni_settings to anon;
grant select on public.omni_profiles,public.omni_articles,public.omni_likes,public.omni_bookmarks,public.omni_comments,public.omni_settings,public.omni_audit,public.omni_submissions to authenticated;
grant insert,update,delete on public.omni_articles to authenticated;
grant insert,delete on public.omni_likes,public.omni_bookmarks,public.omni_comments to authenticated;
grant update(notice,comments_enabled) on public.omni_settings to authenticated;
revoke all on function public.omni_new_user(),public.omni_validate_article(),public.omni_comment_limit(),public.omni_record_audit() from public,anon,authenticated;
revoke all on function public.omni_role(),public.omni_is_admin(),public.omni_manage_user(uuid,text,boolean),public.omni_article_counts(),public.omni_article_comments(uuid,integer) from public;
grant execute on function public.omni_role(),public.omni_is_admin(),public.omni_article_counts(),public.omni_article_comments(uuid,integer) to anon,authenticated;
grant execute on function public.omni_manage_user(uuid,text,boolean) to authenticated;
commit;
