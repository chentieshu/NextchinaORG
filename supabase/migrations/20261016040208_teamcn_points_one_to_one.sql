begin;
-- Explicitly retain every existing point balance and every historical journal.
-- This rollout has no withdrawals, merchant obligations or collateral to redenominate.
do $$begin if exists(select 1 from omni_private.wallet_withdrawals) or exists(select 1 from omni_private.wallet_accounts where bucket='collateral' and balance<>0) or exists(select 1 from omni_private.wallet_deposit_quotes where purpose='collateral') then raise exception 'Existing withdrawal or collateral obligations need a conversion snapshot';end if;end;$$;
create table omni_private.wallet_deposit_dust(user_id uuid primary key references public.omni_profiles(id),micro_remainder integer not null default 0 check(micro_remainder between 0 and 99));
alter table omni_private.wallet_deposit_dust enable row level security;
revoke all on omni_private.wallet_deposit_dust from public,anon,authenticated;
alter table omni_private.wallet_deposits add column points_per_usdt integer not null default 100 check(points_per_usdt in(1,100));
alter table omni_private.wallet_deposits alter column points_per_usdt set default 1;
alter table omni_private.wallet_deposit_quotes add column points_per_usdt integer not null default 100 check(points_per_usdt in(1,100));
alter table omni_private.wallet_deposit_quotes alter column points_per_usdt set default 1;
alter table omni_private.wallet_deposit_quotes drop constraint wallet_deposit_quotes_user_id_treasury_requested_micro_purp_key;
alter table omni_private.wallet_deposit_quotes add unique(user_id,treasury,requested_micro,purpose,points_per_usdt);
alter table omni_private.wallet_deposit_orders add column credited_units bigint not null default 0 check(credited_units>=0);
update omni_private.wallet_deposit_orders set credited_units=credited_micro;
alter table omni_private.wallet_journals drop constraint wallet_journals_units_check;
alter table omni_private.wallet_journals add constraint wallet_journals_units_check check(units between 1 and 10000000000000 or (kind='deposit' and units=0));
create or replace function omni_private.wallet_check_balance() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.kind='deposit' and new.units=0 and not exists(select 1 from omni_private.wallet_entries where journal_id=new.id) and exists(select 1 from omni_private.wallet_deposits where journal_id=new.id) then return null;end if;
 if (select count(*)<2 or coalesce(sum(amount),1)<>0 from omni_private.wallet_entries where journal_id=new.id) then raise exception 'Unbalanced wallet journal' using errcode='23514';end if;return null;end;$$;
update omni_private.wallet_settings set withdrawal_min_units=10000;
alter table omni_private.wallet_settings alter column withdrawal_min_units set default 10000;
alter table omni_private.c2c_settings drop constraint c2c_settings_minimum_collateral_check;
update omni_private.c2c_settings set minimum_collateral=minimum_collateral/100,updated_at=clock_timestamp();
alter table omni_private.c2c_settings alter column minimum_collateral set default 10000000;
alter table omni_private.c2c_settings add check(minimum_collateral>=10000000);
create or replace function omni_private.wallet_credit_converted(beneficiary uuid,allocation uuid,tx text,event_no integer,micro_usdt bigint,proof text,accept_assigned boolean,points_rate integer) returns uuid language plpgsql set search_path='' as $$
declare journal uuid; prior record; amount bigint;remainder bigint;
begin
 if points_rate is null or points_rate not in(1,100) then raise exception 'Invalid conversion';end if;
 if beneficiary is null or allocation is null or tx is null or tx !~ '^[0-9a-f]{64}$' or event_no is null or event_no<0 or micro_usdt is null or micro_usdt<=0 or micro_usdt>10000000000000 or proof is null or length(proof) not between 1 and 300 then raise exception 'Invalid verified receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended('receipt:'||tx||':'||event_no::text,0));
 if exists(select 1 from omni_private.wallet_withdrawals where tx_hash=tx and event_index=event_no) then raise exception 'Receipt already used';end if;
 select d.*,j.actor_id into prior from omni_private.wallet_deposits d join omni_private.wallet_journals j on j.id=d.journal_id where d.tx_hash=tx and d.event_index=event_no;
 if found then
  if prior.actor_id<>beneficiary or prior.allocation_id<>allocation or prior.amount_micro_usdt<>micro_usdt or prior.points_per_usdt<>points_rate then raise exception 'Deposit already allocated' using errcode='PT409';end if;return prior.journal_id;
 end if;
 if not accept_assigned and not (select deposits_enabled from omni_private.wallet_settings where id) then raise exception 'Wallet paused' using errcode='PT503';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||beneficiary::text,0));perform omni_private.wallet_ensure(beneficiary);insert into omni_private.wallet_deposit_dust(user_id) values(beneficiary) on conflict do nothing;
 select micro_remainder into remainder from omni_private.wallet_deposit_dust where user_id=beneficiary;
 amount=(micro_usdt*points_rate+remainder)/100;
 update omni_private.wallet_deposit_dust set micro_remainder=(micro_usdt*points_rate+remainder)%100 where user_id=beneficiary;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(beneficiary,allocation,'deposit',jsonb_build_object('tx',tx,'event',event_no,'points_per_usdt',points_rate,'credited_units',amount,'carry_micro',remainder),amount) returning id into journal;
 insert into omni_private.wallet_deposits(journal_id,allocation_id,tx_hash,event_index,amount_micro_usdt,proof_reference,points_per_usdt) values(journal,allocation,tx,event_no,micro_usdt,proof,points_rate);
 perform omni_private.wallet_entry(journal,beneficiary,'purchased',amount);perform omni_private.wallet_entry(journal,null,'reserve',-amount);
 return journal;
end;$$;

revoke all on function omni_private.wallet_credit_converted(uuid,uuid,text,integer,bigint,text,boolean,integer) from public,anon,authenticated;
create or replace function omni_private.wallet_credit_verified(beneficiary uuid,allocation uuid,tx text,event_no integer,micro_usdt bigint,proof text,accept_assigned boolean default false) returns uuid language sql set search_path='' as $$select omni_private.wallet_credit_converted(beneficiary,allocation,tx,event_no,micro_usdt,proof,accept_assigned,1);$$;

create or replace function omni_private.wallet_settle_verified(withdrawal uuid,tx text,event_no integer,net_micro_usdt bigint) returns void language plpgsql set search_path='' as $$
declare w omni_private.wallet_withdrawals; journal uuid;begin
 select * into w from omni_private.wallet_withdrawals where id=withdrawal for update;
 if not found or tx is null or tx !~ '^[0-9a-f]{64}$' or event_no is null or event_no<0 or net_micro_usdt is distinct from ((w.units-w.fee_units)*100) then raise exception 'Invalid settlement';end if;
 if w.status='paid' and w.tx_hash=tx and w.event_index=event_no then return;end if;
 if w.status<>'processing' then raise exception 'Withdrawal changed' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('receipt:'||tx||':'||event_no::text,0));
 if exists(select 1 from omni_private.wallet_deposits where tx_hash=tx and event_index=event_no) then raise exception 'Receipt already used';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||w.user_id::text,0));
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(w.user_id,gen_random_uuid(),'withdraw_paid',jsonb_build_object('withdrawal',withdrawal,'tx',tx,'event',event_no),w.units) returning id into journal;
 perform omni_private.wallet_entry(journal,w.user_id,'held',-w.units);
 perform omni_private.wallet_entry(journal,null,'reserve',w.units-w.fee_units);perform omni_private.wallet_entry(journal,null,'fees',w.fee_units);
 update omni_private.wallet_withdrawals set status='paid',tx_hash=tx,event_index=event_no,updated_at=clock_timestamp() where id=withdrawal;
end;$$;

create or replace function omni_private.wallet_payout_target(withdrawal uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w omni_private.wallet_withdrawals;begin
 perform omni_private.wallet_actor();if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;perform omni_private.wallet_require_mfa();
 select * into w from omni_private.wallet_withdrawals where id=withdrawal and status in ('processing','paid');if not found then raise exception 'Withdrawal unavailable' using errcode='PT409';end if;
 return jsonb_build_object('id',w.id,'to',omni_private.wallet_tron_hex(w.destination),'from',(select omni_private.wallet_tron_hex(treasury) from omni_private.wallet_gateway where id),'amount',((w.units-w.fee_units)*100)::text,'created_ms',floor(extract(epoch from w.created_at)*1000)::bigint);
end;$$;

create or replace function omni_private.wallet_create_deposit_kind(request uuid,amount bigint,deposit_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();q omni_private.wallet_deposit_quotes;o omni_private.wallet_deposit_orders;receiver text;offset_value integer;candidate bigint;begin
 if deposit_kind not in ('points','collateral') or deposit_kind is null then raise exception 'Invalid deposit kind';end if;
 if deposit_kind='collateral' and not exists(select 1 from omni_private.market_merchants where user_id=actor and status in ('pending','approved','suspended')) then raise exception 'Merchant unavailable' using errcode='PT403';end if;
 if request is null or amount is null or amount not between 1000000 and 10000000000 or amount%10000<>0 then raise exception 'Invalid deposit amount' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended('deposit-user:'||actor::text,0));
 select * into o from omni_private.wallet_deposit_orders where id=request;
 if found then
  if o.user_id<>actor or not exists(select 1 from omni_private.wallet_deposit_quotes where id=o.quote_id and requested_micro=amount and purpose=deposit_kind) then raise exception 'Deposit request changed' using errcode='PT409';end if;
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
 select * into q from omni_private.wallet_deposit_quotes where user_id=actor and treasury=receiver and requested_micro=amount and purpose=deposit_kind and points_per_usdt=1;
 if not found then
  if (select count(*) from omni_private.wallet_deposit_quotes where user_id=actor)>=20 then raise exception 'Deposit amount limit; reuse a previous amount' using errcode='PT429';end if;
  -- 99 permanent slots per 0.01 USDT band; four-decimal points stay exact; <0.01 USDT extra is fully credited.
  offset_value:=('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint%99;
  select amount+100*(1+(i+offset_value)%99) into candidate from generate_series(0,98) i
   where not exists(select 1 from omni_private.wallet_deposit_quotes where treasury=receiver and actual_micro=amount+100*(1+(i+offset_value)%99)) limit 1;
  if candidate is null then raise exception 'Deposit amount unavailable; choose another amount' using errcode='PT409';end if;
  insert into omni_private.wallet_deposit_quotes(user_id,treasury,requested_micro,actual_micro,purpose) values(actor,receiver,amount,candidate,deposit_kind) returning * into q;
 end if;
 insert into omni_private.wallet_deposit_orders(id,user_id,quote_id) values(request,actor,q.id);
 return omni_private.wallet_order_view(request);
end;$$;

create or replace function omni_private.wallet_ingest_tron(target_address text,tx text,block_ms bigint,transfers jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare q omni_private.wallet_deposit_quotes;o omni_private.wallet_deposit_orders;t jsonb;allocation uuid;counted integer:=0;sender text;units bigint;credited bigint;journal uuid;begin
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
  -- A legacy quote honors only its first payment. Repeated transfers must never
  -- turn the permanently assigned identifying amount into a perpetual old rate.
  journal=omni_private.wallet_credit_converted(q.user_id,allocation,tx,(t->>'index')::integer,units,'tron-solidified-order-v2',true,case when o.receipt_count=0 then q.points_per_usdt else 1 end);
  select j.units into credited from omni_private.wallet_journals j where j.id=journal;
  if q.purpose='collateral' then perform omni_private.c2c_deposit_lock(q.user_id,allocation,credited);end if;
  update omni_private.wallet_deposit_orders set credited_micro=credited_micro+units,credited_units=credited_units+credited,receipt_count=receipt_count+1,last_credited_at=to_timestamp(block_ms/1000.0) where id=o.id;
  counted=counted+1;
 end loop;
 insert into omni_private.wallet_checked_receipts(tx_hash,block_ms) values(tx,block_ms);
 return counted;
end;$$;

create or replace function omni_private.wallet_order_view(order_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',o.id,'address',q.treasury,'requested_micro',q.requested_micro::text,'actual_micro',q.actual_micro::text,
 'created_at',o.created_at,'expires_at',o.expires_at,'status',case when o.receipt_count>0 then 'paid' when o.expires_at<=now() then 'expired' else 'waiting' end,
 'points_per_usdt',q.points_per_usdt,'expected_units',(q.actual_micro*q.points_per_usdt/100)::text,'credited_units',o.credited_units::text,'credited_micro',o.credited_micro::text,'receipt_count',o.receipt_count,'last_credited_at',o.last_credited_at)
 from omni_private.wallet_deposit_orders o join omni_private.wallet_deposit_quotes q on q.id=o.quote_id where o.id=order_id;
$$;



create or replace function omni_private.wallet_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();result jsonb;begin
 select jsonb_build_object('points_per_usdt',1,'deposit_remainder_micro',coalesce((select micro_remainder from omni_private.wallet_deposit_dust where user_id=actor),0),'purchased',coalesce(max(a.balance) filter(where a.bucket='purchased'),0)::text,'earned',coalesce(max(a.balance) filter(where a.bucket='earned'),0)::text,'held',coalesce(max(a.balance) filter(where a.bucket='held'),0)::text,'prediction_held',coalesce(max(a.balance) filter(where a.bucket='prediction_hold'),0)::text) into result from omni_private.wallet_accounts a where a.user_id=actor;
 return result||(select jsonb_build_object('deposits_enabled',s.deposits_enabled,'tipping_enabled',s.tipping_enabled,'withdrawals_enabled',s.withdrawals_enabled,'withdrawal_min_units',s.withdrawal_min_units::text,'withdrawal_fee_bps',s.withdrawal_fee_bps::text,'frozen',coalesce((select frozen from omni_private.wallet_users where user_id=actor),false)) from omni_private.wallet_settings s where id);
end;$$;
-- Require new financial clients to explicitly use the new conversion contract.
-- An old open browser tab must not submit a withdrawal after reviewing a 100:1 quote.
create function public.omni_wallet_withdraw_v2(request uuid,amount bigint,address text) returns uuid language sql security invoker set search_path='' as $$select omni_private.wallet_withdraw(request,amount,address);$$;
create function public.omni_wallet_create_deposit_v2(request uuid,amount bigint) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_create_deposit(request,amount);$$;
create function public.omni_c2c_create_deposit_v2(request uuid,amount bigint) returns jsonb language sql security invoker set search_path='' as $$select omni_private.c2c_create_deposit(request,amount);$$;
revoke all on function public.omni_wallet_withdraw_v2(uuid,bigint,text),public.omni_wallet_create_deposit_v2(uuid,bigint),public.omni_c2c_create_deposit_v2(uuid,bigint) from public,anon,authenticated;
grant execute on function public.omni_wallet_withdraw_v2(uuid,bigint,text),public.omni_wallet_create_deposit_v2(uuid,bigint),public.omni_c2c_create_deposit_v2(uuid,bigint) to authenticated;
create or replace function public.omni_wallet_withdraw(request uuid,amount bigint,address text) returns uuid language plpgsql security invoker set search_path='' as $$begin raise exception 'Conversion changed; refresh your browser' using errcode='PT409';end;$$;
create or replace function public.omni_wallet_create_deposit(request uuid,amount bigint) returns jsonb language plpgsql security invoker set search_path='' as $$begin raise exception 'Conversion changed; refresh your browser' using errcode='PT409';end;$$;
create or replace function public.omni_c2c_create_deposit(request uuid,amount bigint) returns jsonb language plpgsql security invoker set search_path='' as $$begin raise exception 'Conversion changed; refresh your browser' using errcode='PT409';end;$$;
commit;
