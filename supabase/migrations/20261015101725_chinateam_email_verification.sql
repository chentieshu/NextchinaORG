begin;

-- Email step-up uses Supabase's server-owned OTP authentication record, never
-- user_metadata or a client flag. It is deliberately not advertised as AAL2.
create function omni_private.email_verification_until() returns timestamptz
language sql stable security definer set search_path='' as $$
 select least(max(m.updated_at)+interval '10 minutes',coalesce(s.not_after,'infinity'::timestamptz))
 from auth.sessions s join auth.users u on u.id=s.user_id
 join auth.mfa_amr_claims m on m.session_id=s.id and m.authentication_method='otp'
 join public.omni_profiles p on p.id=u.id and not p.disabled
 where u.id=auth.uid() and s.id::text=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
 and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())
 and u.email_confirmed_at is not null and nullif(u.email,'') is not null
 and lower(u.email)=lower(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email')
 -- Auth's `otp` method also covers SMS. This email-only site must not accept a
 -- phone OTP as email proof, even if phone login is enabled in the future.
 and nullif(u.phone,'') is null
 and m.updated_at>now()-interval '10 minutes' and m.updated_at<=now()
 group by s.id,s.not_after;
$$;
revoke all on function omni_private.email_verification_until() from public,anon,authenticated;
grant execute on function omni_private.email_verification_until() to authenticated;

create function omni_private.email_verification_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('verified',omni_private.email_verification_until() is not null,
 'expires_at',omni_private.email_verification_until(),
 'available',exists(select 1 from auth.users u join public.omni_profiles p on p.id=u.id
 where u.id=auth.uid() and not p.disabled and u.email_confirmed_at is not null
 and nullif(u.email,'') is not null and nullif(u.phone,'') is null));
$$;
create function public.omni_email_verification_status() returns jsonb
language sql stable security invoker set search_path='' as $$select omni_private.email_verification_status();$$;
revoke all on function omni_private.email_verification_status(),public.omni_email_verification_status() from public,anon,authenticated;
grant execute on function omni_private.email_verification_status(),public.omni_email_verification_status() to authenticated;

create function omni_private.require_email_verification() returns void
language plpgsql stable set search_path='' as $$begin
 if omni_private.email_verification_until() is null then
  raise exception 'Recent email verification required' using errcode='PT401';
 end if;
end;$$;
revoke all on function omni_private.require_email_verification() from public,anon,authenticated;
-- Compatibility for every historical wallet entry point, including payout
-- verification in the Worker. Keep one authoritative gate during rolling deploys.
create or replace function omni_private.wallet_require_mfa() returns void
language plpgsql stable set search_path='' as $$begin
 perform omni_private.require_email_verification();
end;$$;

-- Retire the optional TOTP content gate. Roles, bans and ownership remain intact.
create or replace function omni_private.omni_role() returns text
language sql stable security definer set search_path='' as $$
 select role from public.omni_profiles where id=auth.uid() and not disabled;
$$;

create or replace function omni_private.wallet_admin_setup(addresses text[] default null,enable_payments boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;
 if addresses is not null then raise exception 'Shared receiver uses deposit orders' using errcode='PT400';end if;
 if enable_payments is not null then
  perform omni_private.require_email_verification();
  if enable_payments and not exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes') then raise exception 'Deposit listener unavailable' using errcode='PT503';end if;
  update omni_private.wallet_settings set deposits_enabled=enable_payments,tipping_enabled=enable_payments,withdrawals_enabled=enable_payments where id;
  insert into public.omni_audit(actor_id,action,target) values(actor,'wallet.setup',jsonb_build_object('mode','deposit_orders','enabled',enable_payments)::text);
 end if;
 return jsonb_build_object('mode','deposit_orders','treasury',(select treasury from omni_private.wallet_gateway where id),'heartbeat',(select last_heartbeat from omni_private.wallet_gateway where id),
 'configured',exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null),
 'healthy',exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes'),
 'email_verified',omni_private.email_verification_until() is not null,
 'assigned',(select count(*) from omni_private.wallet_deposit_orders),'unmatched',(select count(*) from omni_private.wallet_unmatched_transfers),'enabled',(select deposits_enabled from omni_private.wallet_settings where id));
end;$$;
commit;
