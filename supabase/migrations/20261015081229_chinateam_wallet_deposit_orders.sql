begin;
-- A shared receiver cannot infer the sender's site account. Reserve an EXACT
-- amount permanently for one account; never recycle expired amounts to others.
create table omni_private.wallet_deposit_quotes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.omni_profiles(id),
 treasury text not null check(omni_private.wallet_tron_address(treasury)),
 requested_micro bigint not null check(requested_micro between 1000000 and 10000000000 and requested_micro%10000=0),
 actual_micro bigint not null check(actual_micro>requested_micro and actual_micro<requested_micro+10000),
 created_at timestamptz not null default clock_timestamp(),
 unique(treasury,actual_micro),unique(user_id,treasury,requested_micro)
);
create table omni_private.wallet_deposit_orders (
 id uuid primary key,
 user_id uuid not null references public.omni_profiles(id),
 quote_id uuid not null references omni_private.wallet_deposit_quotes(id),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 credited_micro bigint not null default 0 check(credited_micro>=0),
 receipt_count integer not null default 0 check(receipt_count>=0),
 last_credited_at timestamptz
);
create index wallet_deposit_orders_user on omni_private.wallet_deposit_orders(user_id,created_at desc);
create index wallet_deposit_orders_quote on omni_private.wallet_deposit_orders(quote_id,created_at desc);
alter table omni_private.wallet_deposit_quotes enable row level security;
alter table omni_private.wallet_deposit_orders enable row level security;
revoke all on omni_private.wallet_deposit_quotes,omni_private.wallet_deposit_orders from public,anon,authenticated;
create trigger wallet_quote_permanent before update or delete on omni_private.wallet_deposit_quotes for each row execute function omni_private.wallet_immutable();

create function omni_private.wallet_order_view(order_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',o.id,'address',q.treasury,'requested_micro',q.requested_micro::text,'actual_micro',q.actual_micro::text,
 'created_at',o.created_at,'expires_at',o.expires_at,'status',case when o.receipt_count>0 then 'paid' when o.expires_at<=now() then 'expired' else 'waiting' end,
 'credited_micro',o.credited_micro::text,'receipt_count',o.receipt_count,'last_credited_at',o.last_credited_at)
 from omni_private.wallet_deposit_orders o join omni_private.wallet_deposit_quotes q on q.id=o.quote_id where o.id=order_id;
$$;

create or replace function omni_private.wallet_deposit_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 return jsonb_build_object('enabled',(select deposits_enabled from omni_private.wallet_settings where id) and not coalesce((select frozen from omni_private.wallet_users where user_id=actor),false),
 'healthy',coalesce((select last_heartbeat>now()-interval '5 minutes' from omni_private.wallet_gateway where id),false),'server_time',clock_timestamp(),
 'order',(select omni_private.wallet_order_view(id) from omni_private.wallet_deposit_orders where user_id=actor order by created_at desc limit 1));
end;$$;

create function omni_private.wallet_create_deposit(request uuid,amount bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();q omni_private.wallet_deposit_quotes;o omni_private.wallet_deposit_orders;receiver text;offset_value integer;candidate bigint;begin
 if request is null or amount is null or amount not between 1000000 and 10000000000 or amount%10000<>0 then raise exception 'Invalid deposit amount' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended('deposit-user:'||actor::text,0));
 select * into o from omni_private.wallet_deposit_orders where id=request;
 if found then
  if o.user_id<>actor or not exists(select 1 from omni_private.wallet_deposit_quotes where id=o.quote_id and requested_micro=amount) then raise exception 'Deposit request changed' using errcode='PT409';end if;
  return omni_private.wallet_order_view(o.id);
 end if;
 if not (select deposits_enabled from omni_private.wallet_settings where id) then raise exception 'Wallet paused' using errcode='PT503';end if;
 if coalesce((select frozen from omni_private.wallet_users where user_id=actor),false) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 select treasury into receiver from omni_private.wallet_gateway where id and secret_hash is not null and last_heartbeat>now()-interval '5 minutes';
 if receiver is null then raise exception 'Deposit listener unavailable' using errcode='PT503';end if;
 select * into o from omni_private.wallet_deposit_orders where user_id=actor and receipt_count=0 and expires_at>now() order by created_at desc limit 1;
 if found then raise exception 'Deposit order already open' using errcode='PT409';end if;
 if exists(select 1 from omni_private.wallet_deposit_orders where user_id=actor and created_at>now()-interval '30 seconds')
 or (select count(*) from omni_private.wallet_deposit_orders where user_id=actor and created_at>now()-interval '1 day')>=30 then raise exception 'Deposit rate limit' using errcode='PT429';end if;
 perform pg_advisory_xact_lock(hashtextextended('deposit-band:'||receiver||':'||amount::text,0));
 select * into q from omni_private.wallet_deposit_quotes where user_id=actor and treasury=receiver and requested_micro=amount;
 if not found then
  if (select count(*) from omni_private.wallet_deposit_quotes where user_id=actor)>=20 then raise exception 'Deposit amount limit; reuse a previous amount' using errcode='PT429';end if;
  -- 9,999 permanent slots per 0.01 USDT band; <0.01 USDT extra is fully credited.
  offset_value:=('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint%9999;
  select amount+1+(i+offset_value)%9999 into candidate from generate_series(0,9998) i
   where not exists(select 1 from omni_private.wallet_deposit_quotes where treasury=receiver and actual_micro=amount+1+(i+offset_value)%9999) limit 1;
  if candidate is null then raise exception 'Deposit amount unavailable; choose another amount' using errcode='PT409';end if;
  insert into omni_private.wallet_deposit_quotes(user_id,treasury,requested_micro,actual_micro) values(actor,receiver,amount,candidate) returning * into q;
 end if;
 insert into omni_private.wallet_deposit_orders(id,user_id,quote_id) values(request,actor,q.id);
 return omni_private.wallet_order_view(request);
end;$$;

create or replace function omni_private.wallet_deposit_address() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform omni_private.wallet_actor();raise exception 'Create a deposit order' using errcode='PT409';end;$$;

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
 'assigned',(select count(*) from omni_private.wallet_deposit_orders),'unmatched',(select count(*) from omni_private.wallet_unmatched_transfers),'enabled',(select deposits_enabled from omni_private.wallet_settings where id));
end;$$;

create or replace function omni_private.wallet_ingest_tron(target_address text,tx text,block_ms bigint,transfers jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare q omni_private.wallet_deposit_quotes;o omni_private.wallet_deposit_orders;t jsonb;allocation uuid;counted integer:=0;sender text;units bigint;begin
 perform omni_private.wallet_gateway_auth();
 if target_address is distinct from (select treasury from omni_private.wallet_gateway where id) then return omni_private.wallet_ingest_allocated_tron(target_address,tx,block_ms,transfers);end if;
 if tx is null or tx !~ '^[0-9a-f]{64}$' or block_ms is null or block_ms<(select floor(extract(epoch from started_at)*1000) from omni_private.wallet_shared_scan where id) or block_ms>extract(epoch from clock_timestamp())*1000+30000 or jsonb_typeof(transfers) is distinct from 'array' or jsonb_array_length(transfers) not between 1 and 100 then raise exception 'Invalid shared transfer';end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-receipt:'||tx,0));
 if exists(select 1 from omni_private.wallet_checked_receipts where tx_hash=tx) then return 0;end if;
 if (select count(distinct (value->>'index')::integer) from jsonb_array_elements(transfers))<>jsonb_array_length(transfers) then raise exception 'Duplicate or missing transfer index';end if;
 for t in select value from jsonb_array_elements(transfers) loop
  if t->>'to' is distinct from omni_private.wallet_tron_hex(target_address) then raise exception 'Wrong deposit recipient';end if;
  sender=t->>'from';units=(t->>'amount')::bigint;
  if sender is null or sender !~ '^[0-9a-f]{40}$' or units is null or units not between 1 and 10000000000000 or t->>'index' is null or (t->>'index')::integer<0 then raise exception 'Invalid transfer';end if;
  if sender=omni_private.wallet_tron_hex(target_address) or exists(select 1 from omni_private.wallet_addresses where omni_private.wallet_tron_hex(address)=sender) then continue;end if;
  -- Never identify a user by a submitted hash, sender address, or rounded amount.
  select * into q from omni_private.wallet_deposit_quotes where treasury=target_address and actual_micro=units and floor(extract(epoch from created_at)*1000)<=block_ms;
  o:=null;
  if found then select * into o from omni_private.wallet_deposit_orders where quote_id=q.id and floor(extract(epoch from created_at)*1000)<=block_ms order by created_at desc limit 1 for update;end if;
  if o.id is null then
   insert into omni_private.wallet_unmatched_transfers(tx_hash,event_index,sender_hex,units,block_ms) values(tx,(t->>'index')::integer,sender,units,block_ms) on conflict do nothing;continue;
  end if;
  allocation=(substr(encode(sha256(convert_to('tron:'||tx||':'||(t->>'index'),'UTF8')),'hex'),1,32))::uuid;
  perform omni_private.wallet_credit_verified(q.user_id,allocation,tx,(t->>'index')::integer,units,'tron-solidified-order-v1',true);
  update omni_private.wallet_deposit_orders set credited_micro=credited_micro+units,receipt_count=receipt_count+1,last_credited_at=to_timestamp(block_ms/1000.0) where id=o.id;
  counted=counted+1;
 end loop;
 insert into omni_private.wallet_checked_receipts(tx_hash,block_ms) values(tx,block_ms);
 return counted;
end;$$;

create function public.omni_wallet_create_deposit(request uuid,amount bigint) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_create_deposit(request,amount);$$;
revoke all on function omni_private.wallet_order_view(uuid),omni_private.wallet_create_deposit(uuid,bigint),public.omni_wallet_create_deposit(uuid,bigint) from public,anon,authenticated;
grant execute on function omni_private.wallet_create_deposit(uuid,bigint),public.omni_wallet_create_deposit(uuid,bigint) to authenticated;
-- Retire wallet binding endpoints. Historical tables remain private and intact.
revoke all on function public.omni_wallet_deposit_challenge(text),omni_private.wallet_deposit_challenge(text),public.omni_wallet_consume_challenge(uuid),omni_private.wallet_consume_challenge(uuid),public.omni_wallet_confirm_payer(uuid,text),omni_private.wallet_confirm_payer(uuid,text) from public,anon,authenticated;
commit;
