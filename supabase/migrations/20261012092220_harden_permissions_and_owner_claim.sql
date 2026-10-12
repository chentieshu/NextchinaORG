begin;

-- Only the three intentional API entry points stay in the exposed schema.
create schema omni_private;
revoke all on schema omni_private from public,anon,authenticated;
grant usage on schema omni_private to anon,authenticated;
alter function public.omni_role() set schema omni_private;
alter function public.omni_is_admin() set schema omni_private;
alter function public.omni_new_user() set schema omni_private;
alter function public.omni_validate_article() set schema omni_private;
alter function public.omni_comment_limit() set schema omni_private;
alter function public.omni_record_audit() set schema omni_private;
alter function public.omni_manage_user(uuid,text,boolean) set schema omni_private;
alter function public.omni_article_counts() set schema omni_private;
alter function public.omni_article_comments(uuid,integer) set schema omni_private;

create or replace function omni_private.omni_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(omni_private.omni_role() in ('editor','super_admin'),false);
$$;
create or replace function omni_private.omni_manage_user(target_user uuid,new_role text,new_disabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Forbidden' using errcode='42501'; end if;
 if new_role not in ('member','editor') or new_role is null or new_disabled is null then raise exception 'Invalid role'; end if;
 if target_user=auth.uid() then raise exception 'Cannot change own access'; end if;
 update public.omni_profiles set role=new_role,disabled=new_disabled where id=target_user and role<>'super_admin';
 if not found then raise exception 'User not found or protected owner'; end if;
end; $$;
create or replace function omni_private.omni_article_comments(target_article uuid,offset_rows integer default 0) returns table(id uuid,article_id uuid,user_id uuid,body text,created_at timestamptz,display_name text) language sql stable security definer set search_path='' as $$
 select c.id,c.article_id,c.user_id,c.body,c.created_at,p.display_name from public.omni_comments c join public.omni_profiles p on p.id=c.user_id join public.omni_articles a on a.id=c.article_id
 where c.article_id=target_article and (a.status='published' or omni_private.omni_is_admin()) order by c.created_at,c.id limit 50 offset greatest(0,least(offset_rows,100000));
$$;

create function public.omni_article_counts() returns table(article_id uuid,like_count bigint,comment_count bigint) language sql stable security invoker set search_path='' as $$
 select * from omni_private.omni_article_counts();
$$;
create function public.omni_article_comments(target_article uuid,offset_rows integer default 0) returns table(id uuid,article_id uuid,user_id uuid,body text,created_at timestamptz,display_name text) language sql stable security invoker set search_path='' as $$
 select * from omni_private.omni_article_comments(target_article,offset_rows);
$$;
create function public.omni_manage_user(target_user uuid,new_role text,new_disabled boolean) returns void language sql security invoker set search_path='' as $$
 select omni_private.omni_manage_user(target_user,new_role,new_disabled);
$$;
-- Revoke explicit Supabase default grants as well as PUBLIC grants.
revoke all on all functions in schema omni_private from public,anon,authenticated;
grant execute on function omni_private.omni_role(),omni_private.omni_is_admin(),omni_private.omni_article_counts(),omni_private.omni_article_comments(uuid,integer) to anon,authenticated;
grant execute on function omni_private.omni_manage_user(uuid,text,boolean) to authenticated;
revoke all on function public.omni_article_counts(),public.omni_article_comments(uuid,integer),public.omni_manage_user(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.omni_article_counts(),public.omni_article_comments(uuid,integer) to anon,authenticated;
grant execute on function public.omni_manage_user(uuid,text,boolean) to authenticated;

create index omni_articles_author on public.omni_articles(author_id);
create index omni_audit_actor on public.omni_audit(actor_id);
create index omni_submissions_user on public.omni_submissions(user_id);

-- A database operator reserves the owner's exact email out of band.
-- No email or secret is embedded in source. This claim can be consumed once.
create table omni_private.owner_claim (
 id boolean primary key default true check(id),
 email text not null unique check(email=lower(trim(email)))
);
alter table omni_private.owner_claim enable row level security;
revoke all on omni_private.owner_claim from public,anon,authenticated;
create function omni_private.claim_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare reserved_email text;
begin
 if new.email_confirmed_at is null or new.email is null then return new; end if;
 select email into reserved_email from omni_private.owner_claim where id for update;
 if reserved_email is null or lower(new.email)<>reserved_email then return new; end if;
 if exists(select 1 from public.omni_profiles where role='super_admin') then return new; end if;
 update public.omni_profiles set role='super_admin' where id=new.id and not disabled;
 if found then delete from omni_private.owner_claim where id; end if;
 return new;
end; $$;
revoke all on function omni_private.claim_owner() from public,anon,authenticated;
-- AFTER INSERT triggers run alphabetically; profile creation must run first.
create trigger zz_omni_claim_owner after insert or update of email,email_confirmed_at on auth.users for each row execute function omni_private.claim_owner();

commit;
