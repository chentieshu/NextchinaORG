begin;
-- Direct deposits to the operator wallet. Keep legacy allocated addresses readable
-- and monitored, but never allocate new ones after switching to this flow.
do $$begin
 if exists(select 1 from omni_private.wallet_withdrawals where status in ('pending','processing')) then
  raise exception 'Resolve outstanding payouts before changing the treasury';
 end if;
end;$$;
update omni_private.wallet_gateway set treasury='TA2hxtb3asN8LUCiDX9PUMsdYQNNY5SRNA',last_heartbeat=null where id;
alter table omni_private.wallet_gateway alter column treasury set default 'TA2hxtb3asN8LUCiDX9PUMsdYQNNY5SRNA';
update omni_private.wallet_settings set deposits_enabled=false,tipping_enabled=false,withdrawals_enabled=false where id;

create table omni_private.wallet_payers (
 address text primary key check(omni_private.wallet_tron_address(address)),
 address_hex text unique not null check(address_hex ~ '^[0-9a-f]{40}$'),
 user_id uuid not null references public.omni_profiles(id) on delete restrict,
 verified_at timestamptz not null default clock_timestamp()
);
create index wallet_payers_user on omni_private.wallet_payers(user_id,verified_at);
create table omni_private.wallet_challenges (
 user_id uuid primary key references public.omni_profiles(id) on delete cascade,
 id uuid unique not null,address text not null,message text not null,
 issued_at timestamptz not null,expires_at timestamptz not null,
 consumed_at timestamptz,completed_at timestamptz
);
create table omni_private.wallet_shared_scan (
 id boolean primary key default true check(id),started_at timestamptz not null default clock_timestamp(),
 fingerprint text check(length(fingerprint)<=2048),lease_token uuid,lease_until timestamptz,last_scanned_at timestamptz
);
insert into omni_private.wallet_shared_scan(id) values(true);
create table omni_private.wallet_checked_receipts (
 tx_hash text primary key check(tx_hash ~ '^[0-9a-f]{64}$'),block_ms bigint not null,checked_at timestamptz not null default now()
);
create table omni_private.wallet_unmatched_transfers (
 tx_hash text not null,event_index integer not null check(event_index>=0),
 sender_hex text not null check(sender_hex ~ '^[0-9a-f]{40}$'),units bigint not null check(units>0),block_ms bigint not null,
 primary key(tx_hash,event_index)
);
alter table omni_private.wallet_payers enable row level security;
alter table omni_private.wallet_challenges enable row level security;
alter table omni_private.wallet_shared_scan enable row level security;
alter table omni_private.wallet_checked_receipts enable row level security;
alter table omni_private.wallet_unmatched_transfers enable row level security;
revoke all on omni_private.wallet_payers,omni_private.wallet_challenges,omni_private.wallet_shared_scan,omni_private.wallet_checked_receipts,omni_private.wallet_unmatched_transfers from public,anon,authenticated;

create function omni_private.wallet_payer_guard() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Verified payer assignments are immutable';end;$$;
create trigger wallet_payer_permanent before update or delete on omni_private.wallet_payers for each row execute function omni_private.wallet_payer_guard();

create function omni_private.wallet_deposit_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 return jsonb_build_object('treasury',(select treasury from omni_private.wallet_gateway where id),'network','TRON','asset','USDT',
 'enabled',(select deposits_enabled from omni_private.wallet_settings where id) and not exists(select 1 from omni_private.wallet_users where user_id=actor and frozen),
 'healthy',exists(select 1 from omni_private.wallet_gateway where id and last_heartbeat>now()-interval '5 minutes'),
 'payers',coalesce((select jsonb_agg(jsonb_build_object('address',address,'verified_at',verified_at) order by verified_at desc) from omni_private.wallet_payers where user_id=actor),'[]'));
end;$$;

create function omni_private.wallet_deposit_challenge(payer_address text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();challenge uuid:=gen_random_uuid();issued timestamptz:=clock_timestamp();message_value text;begin
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||actor::text,0));
 if payer_address is null or not omni_private.wallet_tron_address(payer_address) or payer_address in ((select treasury from omni_private.wallet_gateway where id),'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') or exists(select 1 from omni_private.wallet_addresses where address=payer_address) then raise exception 'Invalid payer address' using errcode='PT400';end if;
 if exists(select 1 from omni_private.wallet_payers where address=payer_address and user_id<>actor) then raise exception 'Payer address unavailable' using errcode='PT409';end if;
 if (select count(*) from omni_private.wallet_payers where user_id=actor)>=5 and not exists(select 1 from omni_private.wallet_payers where user_id=actor and address=payer_address) then raise exception 'Maximum five verified addresses' using errcode='PT409';end if;
 if exists(select 1 from omni_private.wallet_users where user_id=actor and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 if exists(select 1 from omni_private.wallet_challenges where user_id=actor and issued_at>issued-interval '20 seconds') then raise exception 'Wait before retrying' using errcode='PT429';end if;
 message_value:='chinateam.org requests verification of your TRON payer address:'||chr(10)||payer_address||chr(10)||chr(10)||
 'Link this address to your ChinaTeam account for deposit attribution. This is not a transfer or spending approval. No network fee.'||chr(10)||
 'URI: https://chinateam.org'||chr(10)||'Chain ID: 0x2b6653dc'||chr(10)||'Account: '||actor::text||chr(10)||
 'Recipient: '||(select treasury from omni_private.wallet_gateway where id)||chr(10)||'Nonce: '||challenge::text||chr(10)||
 'Issued At: '||to_char(issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||chr(10)||
 'Expiration Time: '||to_char((issued+interval '5 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 insert into omni_private.wallet_challenges(user_id,id,address,message,issued_at,expires_at) values(actor,challenge,payer_address,message_value,issued,issued+interval '5 minutes')
 on conflict(user_id) do update set id=excluded.id,address=excluded.address,message=excluded.message,issued_at=excluded.issued_at,expires_at=excluded.expires_at,consumed_at=null,completed_at=null;
 return jsonb_build_object('id',challenge,'address',payer_address,'message',message_value,'expires_at',issued+interval '5 minutes');
end;$$;

-- Consuming and returning the challenge is a committed, user-authenticated RPC.
-- Verification failures never roll back consumption, and cannot replay a nonce.
create function omni_private.wallet_consume_challenge(challenge uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();c omni_private.wallet_challenges;begin
 update omni_private.wallet_challenges set consumed_at=clock_timestamp() where id=challenge and user_id=actor and consumed_at is null and expires_at>clock_timestamp() returning * into c;
 if not found then raise exception 'Challenge expired or already used' using errcode='PT409';end if;
 return jsonb_build_object('id',c.id,'address',c.address,'message',c.message);
end;$$;
create function omni_private.wallet_confirm_payer(challenge uuid,verified_address text) returns void language plpgsql security definer set search_path='' as $$
declare c omni_private.wallet_challenges;account_id uuid;begin
 perform omni_private.wallet_gateway_auth();
 select user_id into account_id from omni_private.wallet_challenges where id=challenge;
 if account_id is null then raise exception 'Invalid challenge';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||account_id::text,0));
 select * into c from omni_private.wallet_challenges where id=challenge for update;
 if not found or c.address is distinct from verified_address or c.consumed_at is null or c.expires_at<=clock_timestamp() then raise exception 'Invalid challenge';end if;
 if exists(select 1 from public.omni_profiles where id=c.user_id and disabled) or exists(select 1 from omni_private.wallet_users where user_id=c.user_id and frozen) then raise exception 'Wallet unavailable';end if;
 insert into omni_private.wallet_payers(address,address_hex,user_id) values(c.address,omni_private.wallet_tron_hex(c.address),c.user_id) on conflict(address) do nothing;
 if not exists(select 1 from omni_private.wallet_payers where address=c.address and user_id=c.user_id) then raise exception 'Payer address unavailable';end if;
 update omni_private.wallet_challenges set completed_at=clock_timestamp() where id=challenge;
end;$$;

create or replace function omni_private.wallet_deposit_address() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform omni_private.wallet_actor();raise exception 'Use TronLink payer verification before depositing' using errcode='PT409';end;$$;

create or replace function omni_private.wallet_admin_setup(addresses text[] default null,enable_payments boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;
 if addresses is not null then raise exception 'Address pools are replaced by verified TronLink payers' using errcode='PT400';end if;
 if enable_payments is not null then
  perform omni_private.wallet_require_mfa();
  if enable_payments and not exists(select 1 from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes') then raise exception 'Deposit listener unavailable' using errcode='PT503';end if;
  update omni_private.wallet_settings set deposits_enabled=enable_payments,tipping_enabled=enable_payments,withdrawals_enabled=enable_payments where id;
  insert into public.omni_audit(actor_id,action,target) values(actor,'wallet.setup',jsonb_build_object('mode','verified_payer','enabled',enable_payments)::text);
 end if;
 return jsonb_build_object('mode','verified_payer','treasury',(select treasury from omni_private.wallet_gateway where id),'heartbeat',(select last_heartbeat from omni_private.wallet_gateway where id),
 'assigned',(select count(*) from omni_private.wallet_payers),'unmatched',(select count(*) from omni_private.wallet_unmatched_transfers),'enabled',(select deposits_enabled from omni_private.wallet_settings where id));
end;$$;

create or replace function omni_private.wallet_scan_targets() returns setof jsonb language plpgsql security definer set search_path='' as $$
declare s omni_private.wallet_shared_scan;treasury_address text;begin
 perform omni_private.wallet_gateway_auth();
 select treasury into treasury_address from omni_private.wallet_gateway where id;
 update omni_private.wallet_shared_scan set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id and coalesce(lease_until,'epoch')<now() and coalesce(last_scanned_at,'epoch')<now()-interval '45 seconds' returning * into s;
 if found then return next jsonb_build_object('address',treasury_address,'hex',omni_private.wallet_tron_hex(treasury_address),'assigned_ms',floor(extract(epoch from s.started_at)*1000)::bigint,'fingerprint',s.fingerprint,'lease_token',s.lease_token);end if;
 return query with targets as (select address from omni_private.wallet_addresses where user_id is not null and coalesce(lease_until,'epoch')<now() and coalesce(last_scanned_at,'epoch')<now()-interval '45 seconds' order by last_scanned_at nulls first,address for update skip locked limit 4),
 leased as (update omni_private.wallet_addresses a set lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from targets t where a.address=t.address returning a.*)
 select jsonb_build_object('address',address,'hex',omni_private.wallet_tron_hex(address),'assigned_ms',floor(extract(epoch from assigned_at)*1000)::bigint,'fingerprint',fingerprint,'lease_token',lease_token) from leased;
end;$$;
create or replace function omni_private.wallet_seen_transactions(target_address text,hashes text[]) returns text[] language plpgsql stable security definer set search_path='' as $$
begin
 perform omni_private.wallet_gateway_auth();if cardinality(hashes)>200 then raise exception 'Too many transactions';end if;
 if target_address=(select treasury from omni_private.wallet_gateway where id) then return array(select tx_hash from omni_private.wallet_checked_receipts where tx_hash=any(hashes));end if;
 return array(select distinct d.tx_hash from omni_private.wallet_deposits d join omni_private.wallet_journals j on j.id=d.journal_id join omni_private.wallet_addresses a on a.user_id=j.actor_id where a.address=target_address and d.tx_hash=any(hashes));
end;$$;
create or replace function omni_private.wallet_scan_finish(target_address text,lease uuid,next_fingerprint text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform omni_private.wallet_gateway_auth();
 if target_address=(select treasury from omni_private.wallet_gateway where id) then
  update omni_private.wallet_shared_scan set fingerprint=next_fingerprint,last_scanned_at=clock_timestamp(),lease_until=null,lease_token=null where id and lease_token=lease;
  if found then update omni_private.wallet_gateway set last_heartbeat=clock_timestamp() where id;end if;
 else
  update omni_private.wallet_addresses set fingerprint=next_fingerprint,last_scanned_at=clock_timestamp(),lease_until=null,lease_token=null where address=target_address and lease_token=lease;
 end if;
end;$$;
alter function omni_private.wallet_ingest_tron(text,text,bigint,jsonb) rename to wallet_ingest_allocated_tron;
create function omni_private.wallet_ingest_tron(target_address text,tx text,block_ms bigint,transfers jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare payer omni_private.wallet_payers;t jsonb;allocation uuid;counted integer:=0;sender text;begin
 perform omni_private.wallet_gateway_auth();
 if target_address is distinct from (select treasury from omni_private.wallet_gateway where id) then return omni_private.wallet_ingest_allocated_tron(target_address,tx,block_ms,transfers);end if;
 if tx is null or tx !~ '^[0-9a-f]{64}$' or block_ms is null or block_ms<(select floor(extract(epoch from started_at)*1000) from omni_private.wallet_shared_scan where id) or block_ms>extract(epoch from clock_timestamp())*1000+30000 or jsonb_typeof(transfers) is distinct from 'array' or jsonb_array_length(transfers) not between 1 and 100 then raise exception 'Invalid shared transfer';end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-receipt:'||tx,0));
 if exists(select 1 from omni_private.wallet_checked_receipts where tx_hash=tx) then return 0;end if;
 for t in select value from jsonb_array_elements(transfers) loop
  if t->>'to' is distinct from omni_private.wallet_tron_hex(target_address) then raise exception 'Wrong deposit recipient';end if;
  sender=t->>'from';
  if sender is null or sender !~ '^[0-9a-f]{40}$' or t->>'amount' is null or (t->>'amount')::bigint not between 1 and 10000000000000 or t->>'index' is null or (t->>'index')::integer<0 then raise exception 'Invalid transfer';end if;
  if sender=omni_private.wallet_tron_hex(target_address) or exists(select 1 from omni_private.wallet_addresses where omni_private.wallet_tron_hex(address)=sender) then continue;end if;
  select * into payer from omni_private.wallet_payers where address_hex=sender and floor(extract(epoch from verified_at)*1000)<=block_ms;
  if not found then
   insert into omni_private.wallet_unmatched_transfers(tx_hash,event_index,sender_hex,units,block_ms) values(tx,(t->>'index')::integer,sender,(t->>'amount')::bigint,block_ms) on conflict do nothing;continue;
  end if;
  allocation=(substr(encode(sha256(convert_to('tron:'||tx||':'||(t->>'index'),'UTF8')),'hex'),1,32))::uuid;
  perform omni_private.wallet_credit_verified(payer.user_id,allocation,tx,(t->>'index')::integer,(t->>'amount')::bigint,'tron-solidified-payer-v1',true);counted=counted+1;
 end loop;
 insert into omni_private.wallet_checked_receipts(tx_hash,block_ms) values(tx,block_ms);
 return counted;
end;$$;

create function public.omni_wallet_deposit_status() returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_deposit_status();$$;
create function public.omni_wallet_deposit_challenge(payer_address text) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_deposit_challenge(payer_address);$$;
create function public.omni_wallet_consume_challenge(challenge uuid) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_consume_challenge(challenge);$$;
create function public.omni_wallet_confirm_payer(challenge uuid,verified_address text) returns void language sql security invoker set search_path='' as $$select omni_private.wallet_confirm_payer(challenge,verified_address);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','omni_private') and p.proname in ('wallet_deposit_status','omni_wallet_deposit_status','wallet_deposit_challenge','omni_wallet_deposit_challenge','wallet_consume_challenge','omni_wallet_consume_challenge','wallet_confirm_payer','omni_wallet_confirm_payer','wallet_ingest_tron','wallet_ingest_allocated_tron','wallet_payer_guard') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname like '%confirm_payer' or f.proname='wallet_ingest_tron' then execute format('grant execute on function %s to anon',f.signature);
  elsif f.proname like '%deposit_status' or f.proname like '%deposit_challenge' or f.proname like '%consume_challenge' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
commit;
