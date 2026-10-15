begin;
create table omni_private.wallet_gateway (
 id boolean primary key default true check(id),secret_hash text check(secret_hash ~ '^[0-9a-f]{64}$'),
 treasury text not null default 'TPxCJN86sfZPPE6M4PMAgDuTruT9fPPB3Z' check(omni_private.wallet_tron_address(treasury)),
 last_heartbeat timestamptz
);
insert into omni_private.wallet_gateway(id) values(true);
create table omni_private.wallet_addresses (
 address text primary key check(omni_private.wallet_tron_address(address)),
 user_id uuid unique references public.omni_profiles(id) on delete restrict,
 assigned_at timestamptz,
 last_scanned_at timestamptz,
 fingerprint text check(length(fingerprint)<=2048),
 lease_token uuid,lease_until timestamptz,
 check((user_id is null)=(assigned_at is null))
);
create index wallet_addresses_scan on omni_private.wallet_addresses(lease_until,last_scanned_at) where user_id is not null;
alter table omni_private.wallet_gateway enable row level security;
alter table omni_private.wallet_addresses enable row level security;
revoke all on omni_private.wallet_gateway,omni_private.wallet_addresses from public,anon,authenticated;

create function omni_private.wallet_address_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or new.address<>old.address or (old.user_id is not null and (new.user_id is distinct from old.user_id or new.assigned_at is distinct from old.assigned_at)) then raise exception 'Deposit addresses cannot be reassigned';end if;return new;
end;$$;
create trigger wallet_address_permanent before update or delete on omni_private.wallet_addresses for each row execute function omni_private.wallet_address_guard();
create function omni_private.wallet_tron_hex(address text) returns text language plpgsql immutable set search_path='' as $$
declare alphabet constant text:='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; value numeric:=0;bytes bytea:=decode(repeat('00',25),'hex');i integer;
begin
 if not omni_private.wallet_tron_address(address) then raise exception 'Invalid TRON address';end if;
 for i in 1..34 loop value=value*58+strpos(alphabet,substr(address,i,1))-1;end loop;
 for i in reverse 24..0 loop bytes=set_byte(bytes,i,mod(value,256)::integer);value=div(value,256);end loop;
 return encode(substring(bytes from 2 for 20),'hex');
end;$$;
create function omni_private.wallet_gateway_auth() returns void language plpgsql stable set search_path='' as $$
declare supplied text:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-wallet-gateway-key';expected text;
begin
 select secret_hash into expected from omni_private.wallet_gateway where id;
 if expected is null or supplied is null or length(supplied)<>64 or encode(sha256(convert_to(supplied,'UTF8')),'hex')<>expected then raise exception 'Gateway authentication required' using errcode='PT403';end if;
end;$$;
create function omni_private.wallet_admin_setup(addresses text[] default null,enable_payments boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();addr text;begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;
 if addresses is not null or enable_payments is not null then
  perform omni_private.wallet_require_mfa();
  if coalesce(cardinality(addresses),0)>100 then raise exception 'Maximum 100 addresses' using errcode='PT400';end if;
  if addresses is not null then foreach addr in array addresses loop
   if addr is null or not omni_private.wallet_tron_address(addr) or addr in ((select treasury from omni_private.wallet_gateway where id),'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') then raise exception 'Invalid deposit address' using errcode='PT400';end if;
   insert into omni_private.wallet_addresses(address) values(addr) on conflict do nothing;
  end loop;end if;
  if enable_payments then
   if not exists(select 1 from omni_private.wallet_addresses where user_id is null) or not exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes') then raise exception 'Deposit pool or listener unavailable' using errcode='PT503';end if;
  end if;
  if enable_payments is not null then update omni_private.wallet_settings set deposits_enabled=enable_payments,tipping_enabled=enable_payments,withdrawals_enabled=enable_payments where id;end if;
  insert into public.omni_audit(actor_id,action,target) values(actor,'wallet.setup',jsonb_build_object('imported',coalesce(cardinality(addresses),0),'enabled',enable_payments)::text);
 end if;
 return jsonb_build_object('treasury',(select treasury from omni_private.wallet_gateway where id),'heartbeat',(select last_heartbeat from omni_private.wallet_gateway where id),
 'available',(select count(*) from omni_private.wallet_addresses where user_id is null),'assigned',(select count(*) from omni_private.wallet_addresses where user_id is not null),'enabled',(select deposits_enabled from omni_private.wallet_settings where id));
end;$$;
create function omni_private.wallet_deposit_address() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();row_value omni_private.wallet_addresses;begin
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||actor::text,0));
 if not (select deposits_enabled from omni_private.wallet_settings where id) or exists(select 1 from omni_private.wallet_users where user_id=actor and frozen)
 or not exists(select 1 from omni_private.wallet_gateway where id and last_heartbeat>now()-interval '5 minutes') then raise exception 'Wallet paused' using errcode='PT503';end if;
 select * into row_value from omni_private.wallet_addresses where user_id=actor;
 if not found then
  select * into row_value from omni_private.wallet_addresses where user_id is null order by address for update skip locked limit 1;
  if not found then raise exception 'Deposit pool empty' using errcode='PT503';end if;
  update omni_private.wallet_addresses set user_id=actor,assigned_at=clock_timestamp() where address=row_value.address returning * into row_value;
 end if;
 return jsonb_build_object('address',row_value.address,'assigned_at',row_value.assigned_at,'network','TRON','asset','USDT');
end;$$;

create function omni_private.wallet_scan_targets() returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 perform omni_private.wallet_gateway_auth();update omni_private.wallet_gateway set last_heartbeat=clock_timestamp() where id;
 return query with targets as (select address from omni_private.wallet_addresses where user_id is not null and coalesce(lease_until,'epoch')<now() and coalesce(last_scanned_at,'epoch')<now()-interval '45 seconds' order by last_scanned_at nulls first,address for update skip locked limit 5),
 leased as (update omni_private.wallet_addresses a set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from targets t where a.address=t.address returning a.*)
 select jsonb_build_object('address',address,'hex',omni_private.wallet_tron_hex(address),'assigned_ms',floor(extract(epoch from assigned_at)*1000)::bigint,'fingerprint',fingerprint,'lease_token',lease_token) from leased;
end;$$;
create function omni_private.wallet_seen_transactions(target_address text,hashes text[]) returns text[] language plpgsql stable security definer set search_path='' as $$
begin
 perform omni_private.wallet_gateway_auth();if cardinality(hashes)>200 then raise exception 'Too many transactions';end if;
 return array(select distinct d.tx_hash from omni_private.wallet_deposits d join omni_private.wallet_journals j on j.id=d.journal_id join omni_private.wallet_addresses a on a.user_id=j.actor_id where a.address=target_address and d.tx_hash=any(hashes));
end;$$;
create function omni_private.wallet_scan_finish(target_address text,lease uuid,next_fingerprint text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform omni_private.wallet_gateway_auth();update omni_private.wallet_addresses set fingerprint=next_fingerprint,last_scanned_at=clock_timestamp(),lease_until=null,lease_token=null where address=target_address and lease_token=lease;
end;$$;
create function omni_private.wallet_ingest_tron(target_address text,tx text,block_ms bigint,transfers jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare a omni_private.wallet_addresses;t jsonb;allocation uuid;counted integer:=0;sender text;begin
 perform omni_private.wallet_gateway_auth();select * into a from omni_private.wallet_addresses where address=target_address and user_id is not null;
 if not found or block_ms is null or block_ms<floor(extract(epoch from a.assigned_at)*1000) or block_ms>extract(epoch from clock_timestamp())*1000+30000
 or jsonb_typeof(transfers) is distinct from 'array' or jsonb_array_length(transfers) not between 1 and 100 then raise exception 'Invalid allocated transfer';end if;
 for t in select value from jsonb_array_elements(transfers) loop
  if t->>'to' is distinct from omni_private.wallet_tron_hex(target_address) then raise exception 'Wrong deposit recipient';end if;
  sender=t->>'from';
  if sender is null or sender !~ '^[0-9a-f]{40}$' then raise exception 'Invalid transfer sender';end if;
  -- Sweeps and treasury transfers must never mint user points or block other deposits.
  if sender=(select omni_private.wallet_tron_hex(treasury) from omni_private.wallet_gateway where id) or exists(select 1 from omni_private.wallet_addresses where omni_private.wallet_tron_hex(address)=sender) then continue;end if;
  allocation=(substr(encode(sha256(convert_to('tron:'||tx||':'||(t->>'index'),'UTF8')),'hex'),1,32))::uuid;
  perform omni_private.wallet_credit_verified(a.user_id,allocation,tx,(t->>'index')::integer,(t->>'amount')::bigint,'tron-solidified-v1',true);counted=counted+1;
 end loop;return counted;
end;$$;

create function omni_private.wallet_payout_target(withdrawal uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w omni_private.wallet_withdrawals;begin
 perform omni_private.wallet_actor();if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;perform omni_private.wallet_require_mfa();
 select * into w from omni_private.wallet_withdrawals where id=withdrawal and status in ('processing','paid');if not found then raise exception 'Withdrawal unavailable' using errcode='PT409';end if;
 return jsonb_build_object('id',w.id,'to',omni_private.wallet_tron_hex(w.destination),'from',(select omni_private.wallet_tron_hex(treasury) from omni_private.wallet_gateway where id),'amount',(w.units-w.fee_units)::text,'created_ms',floor(extract(epoch from w.created_at)*1000)::bigint);
end;$$;
create function omni_private.wallet_confirm_payout(withdrawal uuid,tx text,block_ms bigint,transfer jsonb) returns void language plpgsql security definer set search_path='' as $$
declare w omni_private.wallet_withdrawals;begin
 perform omni_private.wallet_gateway_auth();select * into w from omni_private.wallet_withdrawals where id=withdrawal;
 if not found or block_ms is null or block_ms<floor(extract(epoch from w.created_at)*1000) or block_ms>extract(epoch from clock_timestamp())*1000+30000 or transfer->>'to' is distinct from omni_private.wallet_tron_hex(w.destination)
 or transfer->>'from' is distinct from (select omni_private.wallet_tron_hex(treasury) from omni_private.wallet_gateway where id) then raise exception 'Wrong payout receipt';end if;
 perform omni_private.wallet_settle_verified(withdrawal,tx,(transfer->>'index')::integer,(transfer->>'amount')::bigint);
end;$$;

-- Block withdrawals to any platform-controlled address, avoiding circular credits.
create function omni_private.wallet_payout_destination() returns trigger language plpgsql set search_path='' as $$
begin
 if new.destination=(select treasury from omni_private.wallet_gateway where id) or exists(select 1 from omni_private.wallet_addresses where address=new.destination) then raise exception 'Platform deposit address is not a withdrawal destination' using errcode='PT400';end if;return new;
end;$$;
create trigger wallet_withdrawal_destination before insert on omni_private.wallet_withdrawals for each row execute function omni_private.wallet_payout_destination();

create function public.omni_wallet_admin_setup(addresses text[] default null,enable_payments boolean default null) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_admin_setup(addresses,enable_payments);$$;
create function public.omni_wallet_deposit_address() returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_deposit_address();$$;
create function public.omni_wallet_payout_target(withdrawal uuid) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_payout_target(withdrawal);$$;
create function public.omni_wallet_scan_targets() returns setof jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_scan_targets();$$;
create function public.omni_wallet_seen_transactions(target_address text,hashes text[]) returns text[] language sql security invoker set search_path='' as $$select omni_private.wallet_seen_transactions(target_address,hashes);$$;
create function public.omni_wallet_scan_finish(target_address text,lease uuid,next_fingerprint text) returns void language sql security invoker set search_path='' as $$select omni_private.wallet_scan_finish(target_address,lease,next_fingerprint);$$;
create function public.omni_wallet_ingest_tron(target_address text,tx text,block_ms bigint,transfers jsonb) returns integer language sql security invoker set search_path='' as $$select omni_private.wallet_ingest_tron(target_address,tx,block_ms,transfers);$$;
create function public.omni_wallet_confirm_payout(withdrawal uuid,tx text,block_ms bigint,transfer jsonb) returns void language sql security invoker set search_path='' as $$select omni_private.wallet_confirm_payout(withdrawal,tx,block_ms,transfer);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='omni_private' and p.proname like 'wallet_%') or (n.nspname='public' and p.proname like 'omni_wallet_%') loop
  if f.proname like '%scan_targets' or f.proname like '%seen_transactions' or f.proname like '%scan_finish' or f.proname like '%ingest_tron' or f.proname like '%confirm_payout' then
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to anon',f.signature);
  elsif f.proname like '%admin_setup' or f.proname like '%deposit_address' or f.proname like '%payout_target' then
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to authenticated',f.signature);
  elsif f.proname in ('wallet_address_guard','wallet_tron_hex','wallet_gateway_auth','wallet_payout_destination') then
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end if;
 end loop;
end;$$;
commit;
