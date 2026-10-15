begin;
-- No minting: collateral and tradable points are independent, funded liabilities.
alter table omni_private.wallet_accounts drop constraint wallet_accounts_bucket_check;
alter table omni_private.wallet_accounts drop constraint wallet_accounts_check;
alter table omni_private.wallet_accounts add constraint wallet_accounts_bucket_check check(bucket in ('purchased','earned','held','reserve','fees','merchant','codes','issuance','collateral','escrow'));
alter table omni_private.wallet_accounts add constraint wallet_accounts_check check((user_id is null and bucket in ('reserve','fees','issuance')) or (user_id is not null and bucket in ('purchased','earned','held','merchant','codes','collateral','escrow') and balance between 0 and 10000000000000000));
alter table omni_private.wallet_journals drop constraint wallet_journals_kind_check;
alter table omni_private.wallet_journals add constraint wallet_journals_kind_check check(kind in ('deposit','tip','withdraw_hold','withdraw_cancel','withdraw_reject','withdraw_paid','merchant_issue','merchant_revoke','code_create','code_cancel','code_redeem','c2c_hold','c2c_release','c2c_cancel','collateral_refund','collateral_lock'));
create table omni_private.c2c_settings(id boolean primary key default true check(id),minimum_collateral bigint not null default 1000000000 check(minimum_collateral>=1000000000),fee_bps integer check(fee_bps between 0 and 2000),enabled boolean not null default false,updated_at timestamptz not null default clock_timestamp());
insert into omni_private.c2c_settings(id) values(true);
alter table omni_private.market_merchants add column status text not null default 'pending' check(status in ('pending','approved','rejected','suspended','exiting','exited'));
alter table omni_private.market_merchants add column review_note text not null default '' check(length(review_note)<=1000);
alter table omni_private.market_merchants add column refund_address text;
alter table omni_private.market_codes add column purchased_units bigint;
alter table omni_private.market_codes add column fee_units bigint not null default 0 check(fee_units>=0);
create table omni_private.c2c_offers(merchant_id uuid primary key references omni_private.market_merchants(user_id),currency text not null check(currency ~ '^[A-Z]{3,8}$'),price_micros bigint not null check(price_micros between 1 and 1000000000000),min_units bigint not null check(min_units>=10000 and min_units%10000=0),max_units bigint not null check(max_units>=min_units and max_units<=10000000000 and max_units%10000=0),payment_method text not null check(length(payment_method) between 1 and 80),payment_details text not null check(length(payment_details) between 1 and 1000),terms text not null default '' check(length(terms)<=1000),active boolean not null default false,updated_at timestamptz not null default clock_timestamp());
create table omni_private.c2c_orders(id uuid primary key,merchant_id uuid not null references omni_private.market_merchants(user_id),buyer_id uuid not null references public.omni_profiles(id),units bigint not null check(units between 10000 and 10000000000),fee_units bigint not null check(fee_units>=0),purchased_units bigint not null check(purchased_units>=0 and purchased_units<=units+fee_units),quote jsonb not null,status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','appealed','completed','cancelled','expired')),created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',updated_at timestamptz not null default clock_timestamp(),paid_at timestamptz,check(merchant_id<>buyer_id));
create index c2c_orders_merchant_page on omni_private.c2c_orders(merchant_id,created_at desc,id desc);
create index c2c_orders_buyer_page on omni_private.c2c_orders(buyer_id,created_at desc,id desc);
create index c2c_orders_expiry on omni_private.c2c_orders(expires_at) where status='awaiting_payment';
create index c2c_orders_review on omni_private.c2c_orders(status,created_at desc,id desc);
create table omni_private.c2c_messages(id uuid primary key default gen_random_uuid(),order_id uuid not null references omni_private.c2c_orders(id),actor_id uuid not null references public.omni_profiles(id),body text not null check(length(body) between 1 and 1000),created_at timestamptz not null default clock_timestamp());
create index c2c_messages_order_page on omni_private.c2c_messages(order_id,created_at,id);
create table omni_private.c2c_requests(actor_id uuid not null references public.omni_profiles(id),request_id uuid not null,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_id));
do $$declare t text;begin foreach t in array array['c2c_settings','c2c_offers','c2c_orders','c2c_messages','c2c_requests'] loop execute format('alter table omni_private.%I enable row level security',t);execute format('revoke all on omni_private.%I from public,anon,authenticated',t);end loop;end;$$;

create function omni_private.c2c_balance(target uuid,kind text) returns bigint language sql stable set search_path='' as $$select coalesce((select balance from omni_private.wallet_accounts where user_id=target and bucket=kind),0);$$;
create function omni_private.c2c_lock(target uuid) returns void language plpgsql set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||target::text,0));perform omni_private.wallet_ensure(target);
 insert into omni_private.wallet_accounts(user_id,bucket) values(target,'collateral'),(target,'escrow'),(target,'codes') on conflict do nothing;
end;$$;
create function omni_private.c2c_capacity(target uuid,amount bigint) returns void language plpgsql set search_path='' as $$begin
 if not exists(select 1 from omni_private.market_merchants where user_id=target and status='approved' and enabled) or exists(select 1 from public.omni_profiles where id=target and disabled) or exists(select 1 from omni_private.wallet_users where user_id=target and frozen) then raise exception 'Merchant unavailable' using errcode='PT403';end if;
 if not exists(select 1 from omni_private.c2c_settings where id and enabled and fee_bps is not null) then raise exception 'C2C paused' using errcode='PT503';end if;
 if omni_private.c2c_balance(target,'collateral')<(select minimum_collateral from omni_private.c2c_settings where id) or omni_private.c2c_balance(target,'escrow')+omni_private.c2c_balance(target,'codes')+amount>omni_private.c2c_balance(target,'collateral') then raise exception 'Collateral limit' using errcode='PT402';end if;
 if omni_private.c2c_balance(target,'purchased')+omni_private.c2c_balance(target,'earned')<amount then raise exception 'Insufficient merchant points' using errcode='PT402';end if;
end;$$;
create function omni_private.c2c_settle(o omni_private.c2c_orders,release boolean,actor uuid,request uuid,final_status text) returns uuid language plpgsql set search_path='' as $$declare journal uuid;uid uuid;begin
 perform 1 from omni_private.market_merchants where user_id=o.merchant_id for update;
 for uid in select v from unnest(array[o.merchant_id,o.buyer_id]) v order by v loop perform omni_private.c2c_lock(uid);end loop;
 if release and exists(select 1 from omni_private.wallet_users where user_id in(o.merchant_id,o.buyer_id) and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 if release and exists(select 1 from public.omni_profiles where id in(o.merchant_id,o.buyer_id) and disabled) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,case when release then 'c2c_release' else 'c2c_cancel' end,jsonb_build_object('order',o.id),o.units+o.fee_units) returning id into journal;
 perform omni_private.wallet_entry(journal,o.merchant_id,'escrow',-(o.units+o.fee_units));
 if release then perform omni_private.wallet_entry(journal,o.buyer_id,'purchased',o.units);perform omni_private.wallet_entry(journal,null,'fees',o.fee_units);
 else perform omni_private.wallet_entry(journal,o.merchant_id,'purchased',o.purchased_units);perform omni_private.wallet_entry(journal,o.merchant_id,'earned',o.units+o.fee_units-o.purchased_units);end if;
 update omni_private.c2c_orders set status=final_status,updated_at=clock_timestamp() where id=o.id;
 return journal;
end;$$;

create function omni_private.c2c_action(request uuid,action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();owner boolean:=omni_private.omni_role()='super_admin';prior omni_private.c2c_requests;result jsonb:='{"ok":true}';target uuid;amount bigint;fee bigint;bought bigint;journal uuid;m omni_private.market_merchants;offer omni_private.c2c_offers;o omni_private.c2c_orders;cfg omni_private.c2c_settings;note text:=trim(coalesce(payload->>'note',''));begin
 if request is null or action is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>6000 then raise exception 'Invalid C2C request' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 select * into prior from omni_private.c2c_requests where actor_id=actor and request_id=request;
 if found then if prior.action<>action or prior.payload<>payload then raise exception 'Wallet request changed' using errcode='PT409';end if;return prior.result;end if;
 if action not in ('message','paid','appeal','cancel') then perform omni_private.require_email_verification();end if;
 if action in ('approve','reject','suspend','settings','exit_approve','exit_reject','resolve_release','resolve_cancel') and not owner then raise exception 'Market access denied' using errcode='PT403';end if;
 if action='settings' then
  if payload->>'fee_bps' is null or (payload->>'fee_bps')::integer not between 0 and 2000 or payload->>'enabled' is null then raise exception 'Invalid C2C settings' using errcode='PT400';end if;
  select * into cfg from omni_private.c2c_settings where id for update;
  if cfg.updated_at is distinct from (payload->>'expected')::timestamptz then raise exception 'C2C settings changed' using errcode='PT409';end if;
  update omni_private.c2c_settings set fee_bps=(payload->>'fee_bps')::integer,enabled=(payload->>'enabled')::boolean,updated_at=clock_timestamp() where id;
 elsif action='apply' then
  perform pg_advisory_xact_lock(hashtextextended('merchant:'||actor::text,0));
  select * into m from omni_private.market_merchants where user_id=actor for update;
  if found and m.status not in ('pending','rejected','exited') then raise exception 'Merchant changed' using errcode='PT409';end if;
  insert into omni_private.market_merchants(user_id,name,contact_url,description,enabled,status) values(actor,trim(payload->>'name'),payload->>'contact',coalesce(payload->>'description',''),false,'pending') on conflict(user_id) do update set name=excluded.name,contact_url=excluded.contact_url,description=excluded.description,status='pending',enabled=false,review_note='',updated_at=clock_timestamp();
 elsif action in ('approve','reject','suspend','exit_approve','exit_reject') then
  target=(payload->>'merchant')::uuid;select * into m from omni_private.market_merchants where user_id=target for update;
  if not found or length(note) not between 1 and 1000 then raise exception 'Invalid review' using errcode='PT400';end if;
  perform omni_private.c2c_lock(target);
  if action='approve' then
   if m.status not in ('pending','suspended') then raise exception 'Merchant changed' using errcode='PT409';end if;
   if omni_private.c2c_balance(target,'collateral')<(select minimum_collateral from omni_private.c2c_settings where id) or exists(select 1 from omni_private.wallet_users where user_id=target and frozen) then raise exception 'Collateral limit' using errcode='PT402';end if;
   update omni_private.market_merchants set status='approved',enabled=true,review_note=note,updated_at=clock_timestamp() where user_id=target;
  elsif action in ('exit_approve','exit_reject') then
   if m.status<>'exiting' then raise exception 'Merchant changed' using errcode='PT409';end if;
   if action='exit_approve' then
    if omni_private.c2c_balance(target,'escrow')+omni_private.c2c_balance(target,'codes')<>0 or exists(select 1 from omni_private.wallet_users where user_id=target and frozen) then raise exception 'Outstanding obligations' using errcode='PT409';end if;
    amount=omni_private.c2c_balance(target,'collateral');
    if amount>0 then
     insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'collateral_refund',jsonb_build_object('merchant',target),amount) returning id into journal;
     perform omni_private.wallet_entry(journal,target,'collateral',-amount);perform omni_private.wallet_entry(journal,target,'held',amount);
     insert into omni_private.wallet_withdrawals(id,user_id,units,fee_units,destination) values(journal,target,amount,0,m.refund_address);
    end if;
    update omni_private.market_merchants set status='exited',enabled=false,review_note=note,updated_at=clock_timestamp() where user_id=target;
   else update omni_private.market_merchants set status='suspended',enabled=false,review_note=note,updated_at=clock_timestamp() where user_id=target;end if;
  else
   if action='reject' and m.status<>'pending' or action='suspend' and m.status<>'approved' then raise exception 'Merchant changed' using errcode='PT409';end if;
   update omni_private.market_merchants set status=case action when 'reject' then 'rejected' else 'suspended' end,enabled=false,review_note=note,updated_at=clock_timestamp() where user_id=target;
  end if;
 elsif action='exit_request' then
  select * into m from omni_private.market_merchants where user_id=actor for update;
  if not found or m.status='exiting' or not omni_private.wallet_tron_address(payload->>'address') or payload->>'address'=(select treasury from omni_private.wallet_gateway where id) or exists(select 1 from omni_private.wallet_addresses where address=payload->>'address') then raise exception 'Invalid exit request' using errcode='PT400';end if;
  perform omni_private.c2c_lock(actor);
  if omni_private.c2c_balance(actor,'codes')+omni_private.c2c_balance(actor,'escrow')<>0 then raise exception 'Outstanding obligations' using errcode='PT409';end if;
  update omni_private.market_merchants set status='exiting',enabled=false,refund_address=payload->>'address',updated_at=clock_timestamp() where user_id=actor;
  update omni_private.c2c_offers set active=false where merchant_id=actor;
 elsif action='offer' then
  select * into m from omni_private.market_merchants where user_id=actor for update;
  if not found or m.status<>'approved' or not m.enabled then raise exception 'Merchant unavailable' using errcode='PT403';end if;
  select * into offer from omni_private.c2c_offers where merchant_id=actor;
  if offer.updated_at is distinct from (payload->>'expected')::timestamptz then raise exception 'Offer changed' using errcode='PT409';end if;
  insert into omni_private.c2c_offers(merchant_id,currency,price_micros,min_units,max_units,payment_method,payment_details,terms,active) values(actor,upper(payload->>'currency'),(payload->>'price_micros')::bigint,(payload->>'min_units')::bigint,(payload->>'max_units')::bigint,trim(payload->>'payment_method'),trim(payload->>'payment_details'),coalesce(payload->>'terms',''),(payload->>'active')::boolean) on conflict(merchant_id) do update set currency=excluded.currency,price_micros=excluded.price_micros,min_units=excluded.min_units,max_units=excluded.max_units,payment_method=excluded.payment_method,payment_details=excluded.payment_details,terms=excluded.terms,active=excluded.active,updated_at=clock_timestamp();
 elsif action='order_create' then
  target=(payload->>'merchant')::uuid;amount=(payload->>'units')::bigint;
  if target=actor or amount is null or amount%10000<>0 or amount not between 10000 and 10000000000 then raise exception 'Invalid order' using errcode='PT400';end if;
  perform 1 from omni_private.market_merchants where user_id=target for update;
  select * into offer from omni_private.c2c_offers where merchant_id=target and active;
  select * into cfg from omni_private.c2c_settings where id for share;
  if not found or offer.merchant_id is null or offer.updated_at is distinct from (payload->>'expected')::timestamptz or cfg.fee_bps is distinct from (payload->>'fee_bps')::integer then raise exception 'Offer changed' using errcode='PT409';end if;
  if amount not between offer.min_units and offer.max_units then raise exception 'Invalid order' using errcode='PT400';end if;
  -- Serialize each buyer's reservations too, including orders to different sellers.
  perform pg_advisory_xact_lock(hashtextextended('c2c-buyer:'||actor::text,0));
  if (select count(*) from omni_private.c2c_orders where buyer_id=actor and status in ('awaiting_payment','paid','appealed'))>=3 or (select count(*) from omni_private.c2c_orders where buyer_id=actor and created_at>now()-interval '1 day')>=30 then raise exception 'Order limit' using errcode='PT429';end if;
  if exists(select 1 from omni_private.wallet_users where user_id=actor and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
  perform omni_private.c2c_lock(target);fee=(amount*cfg.fee_bps+9999)/10000;
  perform omni_private.c2c_capacity(target,amount+fee);bought=least(amount+fee,omni_private.c2c_balance(target,'purchased'));
  insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'c2c_hold',jsonb_build_object('merchant',target),amount+fee) returning id into journal;
  perform omni_private.wallet_entry(journal,target,'purchased',-bought);perform omni_private.wallet_entry(journal,target,'earned',-(amount+fee-bought));perform omni_private.wallet_entry(journal,target,'escrow',amount+fee);
  insert into omni_private.c2c_orders(id,merchant_id,buyer_id,units,fee_units,purchased_units,quote) values(journal,target,actor,amount,fee,bought,jsonb_build_object('currency',offer.currency,'price_micros',offer.price_micros::text,'payment_micros',ceil(amount::numeric*offer.price_micros/10000)::text,'payment_method',offer.payment_method,'payment_details',offer.payment_details,'terms',offer.terms,'fee_bps',cfg.fee_bps));
  result=jsonb_build_object('ok',true,'id',journal);
 elsif action in ('paid','cancel','release','appeal','resolve_release','resolve_cancel','message') then
  select * into o from omni_private.c2c_orders where id=(payload->>'order')::uuid for update;
  if not found or (actor not in(o.merchant_id,o.buyer_id) and not owner) then raise exception 'Market access denied' using errcode='PT403';end if;
  if action='message' then
   if length(note) not between 1 and 1000 or (select count(*) from omni_private.c2c_messages where order_id=o.id)>=500 or exists(select 1 from omni_private.c2c_messages where actor_id=actor and order_id=o.id and created_at>now()-interval '2 seconds') then raise exception 'Message limit' using errcode='PT429';end if;
   insert into omni_private.c2c_messages(order_id,actor_id,body) values(o.id,actor,note);
  elsif action='paid' then
   if actor<>o.buyer_id or o.status<>'awaiting_payment' or o.expires_at<=now() then raise exception 'Order changed' using errcode='PT409';end if;
   update omni_private.c2c_orders set status='paid',paid_at=clock_timestamp(),updated_at=clock_timestamp() where id=o.id;
  elsif action='cancel' then
   if o.status<>'awaiting_payment' or (actor<>o.buyer_id and (actor<>o.merchant_id or o.expires_at>now())) then raise exception 'Order changed' using errcode='PT409';end if;
   perform omni_private.c2c_settle(o,false,actor,request,case when o.expires_at<=now() then 'expired' else 'cancelled' end);
  elsif action='release' then
   if actor<>o.merchant_id or o.status<>'paid' then raise exception 'Order changed' using errcode='PT409';end if;
   perform omni_private.c2c_settle(o,true,actor,request,'completed');
  elsif action='appeal' then
   if actor not in(o.merchant_id,o.buyer_id) or o.status not in ('paid','awaiting_payment') or length(note) not between 1 and 1000 then raise exception 'Order changed' using errcode='PT409';end if;
   update omni_private.c2c_orders set status='appealed',updated_at=clock_timestamp() where id=o.id;
   insert into omni_private.c2c_messages(order_id,actor_id,body) values(o.id,actor,note);
  else
   if o.status<>'appealed' or length(note) not between 1 and 1000 then raise exception 'Order changed' using errcode='PT409';end if;
   perform omni_private.c2c_settle(o,action='resolve_release',actor,request,case action when 'resolve_release' then 'completed' else 'cancelled' end);
   insert into omni_private.c2c_messages(order_id,actor_id,body) values(o.id,actor,note);
  end if;
 else raise exception 'Invalid C2C action' using errcode='PT400';end if;
 insert into omni_private.c2c_requests(actor_id,request_id,action,payload,result) values(actor,request,action,payload,result);
 insert into public.omni_audit(actor_id,action,target) values(actor,'c2c.'||action,coalesce(o.id::text,target::text,actor::text));
 return result;
end;$$;

-- Retire discretionary issuance and direct merchant creation, retaining history.
create or replace function omni_private.market_allocate(request uuid,merchant uuid,amount bigint,action text,note text) returns uuid language plpgsql security definer set search_path='' as $$begin perform omni_private.market_owner();raise exception 'Issuance retired; merchants sell their own points' using errcode='PT409';end;$$;
create or replace function omni_private.market_merchant_save(handle text,shop_name text,contact text,details text,active boolean,expected timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$begin perform omni_private.market_owner();raise exception 'Use merchant application review' using errcode='PT409';end;$$;

create or replace function omni_private.market_code_create(request uuid,amount bigint,digest text,ending text,valid_days integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();prior omni_private.wallet_journals;stamp jsonb;journal uuid;fee bigint;bought bigint;begin
 if request is null or amount is null or amount not between 10000 and 10000000000 or amount%10000<>0 or digest is null or digest !~ '^[0-9a-f]{64}$' or ending is null or ending !~ '^[A-F0-9]{4}$' or valid_days is null or valid_days not in(7,30,90,365) then raise exception 'Invalid code request' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));stamp=jsonb_build_object('kind','code_create','amount',amount::text,'digest',digest,'ending',ending,'days',valid_days);
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return jsonb_build_object('id',prior.id);end if;
 perform omni_private.require_email_verification();perform 1 from omni_private.market_merchants where user_id=actor for update;perform omni_private.c2c_lock(actor);
 fee=(amount*(select fee_bps from omni_private.c2c_settings where id)+9999)/10000;
 if fee is null then raise exception 'C2C paused' using errcode='PT503';end if;
 perform omni_private.c2c_capacity(actor,amount+fee);
 if (select count(*) from omni_private.market_codes where merchant_id=actor and status='active')>=1000 then raise exception 'Too many active codes' using errcode='PT429';end if;
 bought=least(amount+fee,omni_private.c2c_balance(actor,'purchased'));
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'code_create',stamp,amount+fee) returning id into journal;
 insert into omni_private.market_codes(id,merchant_id,code_hash,suffix,units,fee_units,purchased_units,expires_at) values(journal,actor,digest,ending,amount,fee,bought,clock_timestamp()+make_interval(days=>valid_days));
 perform omni_private.wallet_entry(journal,actor,'purchased',-bought);perform omni_private.wallet_entry(journal,actor,'earned',-(amount+fee-bought));perform omni_private.wallet_entry(journal,actor,'codes',amount+fee);
 return jsonb_build_object('id',journal);
end;$$;
create or replace function omni_private.market_code_cancel(request uuid,code_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();c omni_private.market_codes;prior omni_private.wallet_journals;journal uuid;stamp jsonb;begin
 if request is null or code_id is null then raise exception 'Invalid code request' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));stamp=jsonb_build_object('kind','code_cancel','code',code_id);
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return prior.id;end if;
 select * into c from omni_private.market_codes where id=code_id for update;
 if not found or (c.merchant_id<>actor and omni_private.omni_role() is distinct from 'super_admin') then raise exception 'Market access denied' using errcode='PT403';end if;
 if c.status<>'active' then raise exception 'Code changed' using errcode='PT409';end if;
 perform omni_private.require_email_verification();perform 1 from omni_private.market_merchants where user_id=c.merchant_id for update;perform omni_private.c2c_lock(c.merchant_id);
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'code_cancel',stamp,c.units+c.fee_units) returning id into journal;
 perform omni_private.wallet_entry(journal,c.merchant_id,'codes',-(c.units+c.fee_units));
 if c.purchased_units is null then perform omni_private.wallet_entry(journal,c.merchant_id,'merchant',c.units);
 else perform omni_private.wallet_entry(journal,c.merchant_id,'purchased',c.purchased_units);perform omni_private.wallet_entry(journal,c.merchant_id,'earned',c.units+c.fee_units-c.purchased_units);end if;
 update omni_private.market_codes set status='cancelled' where id=c.id;
 insert into public.omni_audit(actor_id,action,target) values(actor,'market.code.cancel',c.id::text);return journal;
end;$$;

create function omni_private.c2c_read(view_kind text default 'market',before_id uuid default null,order_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();owner boolean:=omni_private.omni_role()='super_admin';o omni_private.c2c_orders;rows jsonb;begin
 if view_kind not in('market','orders','merchants','review','order','desk') or view_kind is null then raise exception 'Invalid C2C view' using errcode='PT400';end if;
 if view_kind in('merchants','review') and not owner then raise exception 'Market access denied' using errcode='PT403';end if;
 if view_kind='order' then
  select * into o from omni_private.c2c_orders where id=order_id;
  if not found or (actor not in(o.buyer_id,o.merchant_id) and not owner) then raise exception 'Market access denied' using errcode='PT403';end if;
  select coalesce(jsonb_agg(r),'[]') into rows from (select x.id,x.actor_id,x.body,x.created_at,p.display_name,p.handle from omni_private.c2c_messages x join public.omni_profiles p on p.id=x.actor_id where x.order_id=o.id and (before_id is null or (x.created_at,x.id)<(select y.created_at,y.id from omni_private.c2c_messages y where y.id=before_id and y.order_id=o.id)) order by x.created_at desc,x.id desc limit 51) r;
  return jsonb_build_object('order',to_jsonb(o)||jsonb_build_object('units',o.units::text,'fee_units',o.fee_units::text),'rows',rows,'server_time',clock_timestamp());
 elsif view_kind in('orders','review') then
  select coalesce(jsonb_agg(r),'[]') into rows from (select o.id,o.merchant_id,o.buyer_id,o.units::text,o.fee_units::text,o.status,o.quote,o.created_at,o.expires_at,m.name,p.handle buyer_handle from omni_private.c2c_orders o join omni_private.market_merchants m on m.user_id=o.merchant_id join public.omni_profiles p on p.id=o.buyer_id where (view_kind='review' or actor in(o.merchant_id,o.buyer_id)) and (before_id is null or (o.created_at,o.id)<(select b.created_at,b.id from omni_private.c2c_orders b where b.id=before_id and (view_kind='review' or actor in(b.merchant_id,b.buyer_id)))) order by o.created_at desc,o.id desc limit 21) r;
 elsif view_kind='merchants' then
  select coalesce(jsonb_agg(r),'[]') into rows from (select m.*,m.user_id id,p.handle,p.avatar_key,p.display_name,omni_private.c2c_balance(m.user_id,'collateral')::text collateral,(omni_private.c2c_balance(m.user_id,'codes')+omni_private.c2c_balance(m.user_id,'escrow'))::text reserved from omni_private.market_merchants m join public.omni_profiles p on p.id=m.user_id where before_id is null or m.user_id>before_id order by m.user_id limit 21) r;
 elsif view_kind='market' then
  select coalesce(jsonb_agg(r),'[]') into rows from (select m.user_id id,m.user_id,m.name,m.description,p.handle,p.display_name,p.avatar_key,f.currency,f.price_micros::text,f.min_units::text,f.max_units::text,f.payment_method,f.terms,f.updated_at,least(omni_private.c2c_balance(m.user_id,'purchased')+omni_private.c2c_balance(m.user_id,'earned'),greatest(0,omni_private.c2c_balance(m.user_id,'collateral')-omni_private.c2c_balance(m.user_id,'codes')-omni_private.c2c_balance(m.user_id,'escrow')))::text available,(select count(*) from omni_private.c2c_orders where merchant_id=m.user_id and status='completed') completed from omni_private.market_merchants m join public.omni_profiles p on p.id=m.user_id join omni_private.c2c_offers f on f.merchant_id=m.user_id where m.status='approved' and m.enabled and f.active and not p.disabled and not coalesce((select frozen from omni_private.wallet_users where user_id=m.user_id),false) and omni_private.c2c_balance(m.user_id,'collateral')>=(select minimum_collateral from omni_private.c2c_settings where id) and (before_id is null or m.user_id>before_id) order by m.user_id limit 21) r;
 else rows='[]';end if;
 return jsonb_build_object('rows',rows,'config',(select to_jsonb(s)||jsonb_build_object('minimum_collateral',s.minimum_collateral::text) from omni_private.c2c_settings s where id),
 'merchant',(select to_jsonb(m)||jsonb_build_object('collateral',omni_private.c2c_balance(actor,'collateral')::text,'reserved',(omni_private.c2c_balance(actor,'codes')+omni_private.c2c_balance(actor,'escrow'))::text,'available',(omni_private.c2c_balance(actor,'purchased')+omni_private.c2c_balance(actor,'earned'))::text) from omni_private.market_merchants m where user_id=actor),
 'offer',(select to_jsonb(f)||jsonb_build_object('price_micros',f.price_micros::text,'min_units',f.min_units::text,'max_units',f.max_units::text) from omni_private.c2c_offers f where merchant_id=actor),'server_time',clock_timestamp());
end;$$;

create function omni_private.c2c_expire() returns integer language plpgsql security definer set search_path='' as $$declare o omni_private.c2c_orders;n integer:=0;begin
 perform omni_private.wallet_gateway_auth();
 for o in select * from omni_private.c2c_orders where status='awaiting_payment' and expires_at<now() order by expires_at for update skip locked limit 20 loop
  perform omni_private.c2c_settle(o,false,o.buyer_id,gen_random_uuid(),'expired');n=n+1;
 end loop;return n;
end;$$;
create function public.omni_c2c_action(request uuid,action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select omni_private.c2c_action(request,action,payload);$$;
create function public.omni_c2c_read(view_kind text default 'market',before_id uuid default null,order_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select omni_private.c2c_read(view_kind,before_id,order_id);$$;
create function public.omni_wallet_c2c_expire() returns integer language sql security invoker set search_path='' as $$select omni_private.c2c_expire();$$;
revoke all on function omni_private.c2c_balance(uuid,text),omni_private.c2c_lock(uuid),omni_private.c2c_capacity(uuid,bigint),omni_private.c2c_settle(omni_private.c2c_orders,boolean,uuid,uuid,text),omni_private.c2c_action(uuid,text,jsonb),omni_private.c2c_read(text,uuid,uuid),omni_private.c2c_expire(),public.omni_c2c_action(uuid,text,jsonb),public.omni_c2c_read(text,uuid,uuid),public.omni_wallet_c2c_expire() from public,anon,authenticated;
grant execute on function omni_private.c2c_action(uuid,text,jsonb),omni_private.c2c_read(text,uuid,uuid),public.omni_c2c_action(uuid,text,jsonb),public.omni_c2c_read(text,uuid,uuid) to authenticated;
grant execute on function omni_private.c2c_expire(),public.omni_wallet_c2c_expire() to anon;

-- Separate verified USDT collateral deposits; never accept a client-supplied receipt.
alter table omni_private.wallet_deposit_quotes add column purpose text not null default 'points' check(purpose in ('points','collateral'));
alter table omni_private.wallet_deposit_quotes drop constraint wallet_deposit_quotes_user_id_treasury_requested_micro_key;
alter table omni_private.wallet_deposit_quotes add unique(user_id,treasury,requested_micro,purpose);
create function omni_private.wallet_create_deposit_kind(request uuid,amount bigint,deposit_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 select * into q from omni_private.wallet_deposit_quotes where user_id=actor and treasury=receiver and requested_micro=amount and purpose=deposit_kind;
 if not found then
  if (select count(*) from omni_private.wallet_deposit_quotes where user_id=actor)>=20 then raise exception 'Deposit amount limit; reuse a previous amount' using errcode='PT429';end if;
  -- 9,999 permanent slots per 0.01 USDT band; <0.01 USDT extra is fully credited.
  offset_value:=('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint%9999;
  select amount+1+(i+offset_value)%9999 into candidate from generate_series(0,9998) i
   where not exists(select 1 from omni_private.wallet_deposit_quotes where treasury=receiver and actual_micro=amount+1+(i+offset_value)%9999) limit 1;
  if candidate is null then raise exception 'Deposit amount unavailable; choose another amount' using errcode='PT409';end if;
  insert into omni_private.wallet_deposit_quotes(user_id,treasury,requested_micro,actual_micro,purpose) values(actor,receiver,amount,candidate,deposit_kind) returning * into q;
 end if;
 insert into omni_private.wallet_deposit_orders(id,user_id,quote_id) values(request,actor,q.id);
 return omni_private.wallet_order_view(request);
end;$$;


create or replace function omni_private.wallet_create_deposit(request uuid,amount bigint) returns jsonb language sql security definer set search_path='' as $$select omni_private.wallet_create_deposit_kind(request,amount,'points');$$;
create function omni_private.c2c_create_deposit(request uuid,amount bigint) returns jsonb language plpgsql security definer set search_path='' as $$begin perform omni_private.wallet_actor();perform omni_private.require_email_verification();return omni_private.wallet_create_deposit_kind(request,amount,'collateral');end;$$;
create function omni_private.c2c_deposit_lock(target uuid,allocation uuid,amount bigint) returns void language plpgsql set search_path='' as $$declare j uuid;begin
 perform omni_private.c2c_lock(target);
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(target,gen_random_uuid(),'collateral_lock',jsonb_build_object('collateral_deposit',allocation),amount) returning id into j;
 perform omni_private.wallet_entry(j,target,'purchased',-amount);perform omni_private.wallet_entry(j,target,'collateral',amount);
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
  if q.purpose='collateral' then perform omni_private.c2c_deposit_lock(q.user_id,allocation,units);end if;
  update omni_private.wallet_deposit_orders set credited_micro=credited_micro+units,receipt_count=receipt_count+1,last_credited_at=to_timestamp(block_ms/1000.0) where id=o.id;
  counted=counted+1;
 end loop;
 insert into omni_private.wallet_checked_receipts(tx_hash,block_ms) values(tx,block_ms);
 return counted;
end;$$;


create or replace function omni_private.market_redeem(digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); c omni_private.market_codes; journal uuid; tries integer; uid uuid;
begin
 -- Return failures, rather than raising, so failed attempts remain rate limited after commit.
 insert into omni_private.market_attempts(user_id,window_at,attempts) values(actor,clock_timestamp(),1)
 on conflict(user_id) do update set attempts=case when market_attempts.window_at<clock_timestamp()-interval '10 minutes' then 1 else least(market_attempts.attempts+1,11) end,
 window_at=case when market_attempts.window_at<clock_timestamp()-interval '10 minutes' then clock_timestamp() else market_attempts.window_at end returning attempts into tries;
 if tries>10 then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 if digest is null or digest !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'error','invalid_code');end if;
 select * into c from omni_private.market_codes where code_hash=digest for update;
 if not found then return jsonb_build_object('ok',false,'error','invalid_code');end if;
 if c.status='redeemed' and c.redeemed_by=actor then return jsonb_build_object('ok',true,'units',c.units::text,'id',c.id,'already_redeemed',true);end if;
 if c.status<>'active' or c.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','invalid_code');end if;
 -- Delisting stops new sales. Previously issued codes remain redeemable unless individually cancelled.
 perform 1 from omni_private.market_merchants where user_id=c.merchant_id for update;
 if c.merchant_id=actor then return jsonb_build_object('ok',false,'error','own_code');end if;
 for uid in select v from unnest(array[actor,c.merchant_id]) v order by v loop
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||uid::text,0));perform omni_private.wallet_ensure(uid);
 end loop;
 if exists(select 1 from omni_private.wallet_users where user_id in (actor,c.merchant_id) and frozen)
 or exists(select 1 from public.omni_profiles where id=c.merchant_id and disabled) then return jsonb_build_object('ok',false,'error','restricted');end if;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,c.id,'code_redeem',jsonb_build_object('code',c.id,'merchant',c.merchant_id),c.units) returning id into journal;
 perform omni_private.wallet_entry(journal,c.merchant_id,'codes',-(c.units+c.fee_units));perform omni_private.wallet_entry(journal,actor,'purchased',c.units);perform omni_private.wallet_entry(journal,null,'fees',c.fee_units);
 update omni_private.market_codes set status='redeemed',redeemed_by=actor,redeemed_at=clock_timestamp() where id=c.id;
 return jsonb_build_object('ok',true,'units',c.units::text,'id',c.id,'already_redeemed',false);
end;$$;


create function public.omni_c2c_create_deposit(request uuid,amount bigint) returns jsonb language sql security invoker set search_path='' as $$select omni_private.c2c_create_deposit(request,amount);$$;
revoke all on function omni_private.wallet_create_deposit_kind(uuid,bigint,text),omni_private.c2c_deposit_lock(uuid,uuid,bigint),omni_private.c2c_create_deposit(uuid,bigint),public.omni_c2c_create_deposit(uuid,bigint) from public,anon,authenticated;
grant execute on function omni_private.c2c_create_deposit(uuid,bigint),public.omni_c2c_create_deposit(uuid,bigint) to authenticated;
create or replace function omni_private.wallet_review(withdrawal uuid,action text,expected text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); row_value omni_private.wallet_withdrawals; journal uuid; next_status text; kind text;
begin
 if action is null or action not in ('cancel','reject','process') or expected is distinct from 'pending' then raise exception 'Invalid transition' using errcode='PT400';end if;
 select * into row_value from omni_private.wallet_withdrawals where id=withdrawal for update;
 if not found or (action='cancel' and row_value.user_id<>actor) or (action<>'cancel' and omni_private.omni_role() is distinct from 'super_admin') then raise exception 'Wallet access denied' using errcode='PT403';end if;
 next_status=case action when 'cancel' then 'cancelled' when 'reject' then 'rejected' else 'processing' end;
 if row_value.status=next_status then return to_jsonb(row_value);end if;
 if row_value.status<>expected then raise exception 'Withdrawal changed' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||row_value.user_id::text,0));
 if action='process' then
  perform omni_private.wallet_require_mfa();
  if not (select withdrawals_enabled from omni_private.wallet_settings where id) or (select frozen from omni_private.wallet_users where user_id=row_value.user_id)
  or not exists(select 1 from public.omni_profiles where id=row_value.user_id and not disabled) then raise exception 'Wallet paused' using errcode='PT503';end if;
 else
  kind=case action when 'cancel' then 'withdraw_cancel' else 'withdraw_reject' end;
  insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,gen_random_uuid(),kind,jsonb_build_object('withdrawal',withdrawal),row_value.units) returning id into journal;
  perform omni_private.wallet_entry(journal,row_value.user_id,'held',-row_value.units);perform omni_private.wallet_entry(journal,row_value.user_id,case when exists(select 1 from omni_private.wallet_journals j where j.id=withdrawal and j.kind='collateral_refund') then 'collateral' else 'earned' end,row_value.units);
 end if;
 update omni_private.wallet_withdrawals set status=next_status,updated_at=clock_timestamp() where id=withdrawal returning * into row_value;
 insert into public.omni_audit(actor_id,action,target) values(actor,'wallet.withdraw.'||action,withdrawal::text);
 return to_jsonb(row_value);
end;$$;


create function omni_private.c2c_deposit_status() returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=omni_private.wallet_actor();begin return jsonb_build_object('enabled',(select deposits_enabled from omni_private.wallet_settings where id) and not coalesce((select frozen from omni_private.wallet_users where user_id=actor),false),'healthy',coalesce((select last_heartbeat>now()-interval '5 minutes' from omni_private.wallet_gateway where id),false),'server_time',clock_timestamp(),'order',(select omni_private.wallet_order_view(o.id) from omni_private.wallet_deposit_orders o join omni_private.wallet_deposit_quotes q on q.id=o.quote_id where o.user_id=actor and q.purpose='collateral' order by o.created_at desc limit 1));end;$$;
create function public.omni_c2c_deposit_status() returns jsonb language sql security invoker set search_path='' as $$select omni_private.c2c_deposit_status();$$;
revoke all on function omni_private.c2c_deposit_status(),public.omni_c2c_deposit_status() from public,anon,authenticated;grant execute on function omni_private.c2c_deposit_status(),public.omni_c2c_deposit_status() to authenticated;
create or replace function omni_private.wallet_deposit_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 return jsonb_build_object('enabled',(select deposits_enabled from omni_private.wallet_settings where id) and not coalesce((select frozen from omni_private.wallet_users where user_id=actor),false),
 'healthy',coalesce((select last_heartbeat>now()-interval '5 minutes' from omni_private.wallet_gateway where id),false),'server_time',clock_timestamp(),
 'order',(select omni_private.wallet_order_view(id) from omni_private.wallet_deposit_orders where user_id=actor and quote_id in (select id from omni_private.wallet_deposit_quotes where purpose='points') order by created_at desc limit 1));
end;$$;


create function omni_private.c2c_code_create(request uuid,amount bigint,digest text,ending text,valid_days integer,expected_fee_bps integer) returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=omni_private.wallet_actor();prior omni_private.wallet_journals;fee integer;begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if not found then select fee_bps into fee from omni_private.c2c_settings where id for share;if fee is distinct from expected_fee_bps or fee is null then raise exception 'Fee changed' using errcode='PT409';end if;end if;
 return omni_private.market_code_create(request,amount,digest,ending,valid_days);end;$$;
create function public.omni_c2c_code_create(request uuid,amount bigint,digest text,ending text,valid_days integer,expected_fee_bps integer) returns jsonb language sql security invoker set search_path='' as $$select omni_private.c2c_code_create(request,amount,digest,ending,valid_days,expected_fee_bps);$$;
revoke all on function omni_private.c2c_code_create(uuid,bigint,text,text,integer,integer),public.omni_c2c_code_create(uuid,bigint,text,text,integer,integer) from public,anon,authenticated;
grant execute on function omni_private.c2c_code_create(uuid,bigint,text,text,integer,integer),public.omni_c2c_code_create(uuid,bigint,text,text,integer,integer) to authenticated;
revoke execute on function public.omni_market_code_create(uuid,bigint,text,text,integer),omni_private.market_code_create(uuid,bigint,text,text,integer) from authenticated;
commit;
