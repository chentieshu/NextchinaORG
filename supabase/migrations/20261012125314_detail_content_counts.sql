begin;
-- Targeted aggregate reads keep detail counts fresh without enumerating all content or identities.
create function public.omni_content_counts(target_article uuid)
returns table(like_count bigint,comment_count bigint)
language sql stable security invoker set search_path='' as $$
 select * from omni_private.omni_content_counts(target_article);
$$;
revoke all on function public.omni_content_counts(uuid) from public,anon,authenticated;
grant execute on function public.omni_content_counts(uuid) to anon,authenticated;
commit;
