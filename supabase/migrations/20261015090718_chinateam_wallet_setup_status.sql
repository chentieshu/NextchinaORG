-- Expose readiness from server time and the authenticated session; no secrets or payment state changes.
create or replace function omni_private.wallet_admin_setup(addresses text[] default null,enable_payments boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;
 if addresses is not null then raise exception 'Shared receiver uses deposit orders' using errcode='PT400';end if;
 if enable_payments is not null then
  perform omni_private.wallet_require_mfa();
  if enable_payments and not exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes') then raise exception 'Deposit listener unavailable' using errcode='PT503';end if;
  update omni_private.wallet_settings set deposits_enabled=enable_payments,tipping_enabled=enable_payments,withdrawals_enabled=enable_payments where id;
  insert into public.omni_audit(actor_id,action,target) values(actor,'wallet.setup',jsonb_build_object('mode','deposit_orders','enabled',enable_payments)::text);
 end if;
 return jsonb_build_object('mode','deposit_orders','treasury',(select treasury from omni_private.wallet_gateway where id),'heartbeat',(select last_heartbeat from omni_private.wallet_gateway where id),
 'configured',exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null),
 'healthy',exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes'),
 'mfa_verified',coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2',
 'assigned',(select count(*) from omni_private.wallet_deposit_orders),'unmatched',(select count(*) from omni_private.wallet_unmatched_transfers),'enabled',(select deposits_enabled from omni_private.wallet_settings where id));
end;$$;

