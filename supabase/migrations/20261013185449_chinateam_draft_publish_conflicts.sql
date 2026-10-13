begin;
-- An editor opened before another device saved a cloud draft must not publish
-- without acknowledging that draft, including when its expected version is null.
create or replace function omni_private.omni_clear_content_draft(target_article uuid,expected_draft_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare actual_updated_at timestamptz;
begin
 if auth.uid() is null or omni_private.omni_role() is null then raise exception 'Forbidden' using errcode='PT403';end if;
 select updated_at into actual_updated_at from public.omni_content_drafts where article_id=target_article and user_id=auth.uid() for update;
 if actual_updated_at is distinct from expected_draft_at then raise exception 'Draft changed' using errcode='PT409';end if;
 delete from public.omni_content_drafts where article_id=target_article and user_id=auth.uid() and updated_at=expected_draft_at;
end;$$;
commit;
