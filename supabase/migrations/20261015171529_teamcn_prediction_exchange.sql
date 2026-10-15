begin;
-- Whole outcome shares; prices are hundredths of one point. One complete set
-- always has 10,000 ledger units of collateral. Private tables never expose wallets.
alter table omni_private.wallet_accounts drop constraint wallet_accounts_bucket_check;
alter table omni_private.wallet_accounts drop constraint wallet_accounts_check;
alter table omni_private.wallet_accounts add constraint wallet_accounts_bucket_check check(bucket in('purchased','earned','held','reserve','fees','merchant','codes','issuance','collateral','escrow','inventory','prediction_hold','prediction_pool'));
alter table omni_private.wallet_accounts add constraint wallet_accounts_check check(
 (user_id is null and bucket in('reserve','fees','issuance')) or
 (user_id is null and bucket in('inventory','prediction_pool') and balance between 0 and 10000000000000000) or
 (user_id is not null and bucket in('purchased','earned','held','merchant','codes','collateral','escrow','prediction_hold') and balance between 0 and 10000000000000000));
insert into omni_private.wallet_accounts(bucket) values('prediction_pool');
alter table omni_private.wallet_journals drop constraint wallet_journals_kind_check;
alter table omni_private.wallet_journals add constraint wallet_journals_kind_check check(kind in('deposit','tip','withdraw_hold','withdraw_cancel','withdraw_reject','withdraw_paid','merchant_issue','merchant_revoke','code_create','code_cancel','code_redeem','c2c_hold','c2c_release','c2c_cancel','collateral_refund','collateral_lock','admin_adjust','points_issue','points_grant','prediction_hold','prediction_refund','prediction_trade','prediction_claim'));

create table omni_private.exchange_markets(
 id uuid primary key default gen_random_uuid(),proposal_id uuid unique references omni_private.prediction_proposals(id),creator_id uuid not null references public.omni_profiles(id),
 title text not null check(length(trim(title)) between 5 and 160),rules text not null check(length(trim(rules)) between 30 and 4000),source_url text not null check(source_url~'^https://[^[:space:]]+$' and length(source_url)<=500),
 category text not null default 'General' check(length(trim(category)) between 1 and 40),closes_at timestamptz not null,
 state text not null default 'draft' check(state in('draft','open','paused','resolving','resolved')),result text check(result in('yes','no','void')),
 resolution_note text not null default '',evidence_url text not null default '',resolve_after timestamptz,dispute_seconds integer not null default 3600 check(dispute_seconds between 300 and 604800),
 collateral bigint not null default 0 check(collateral>=0),volume bigint not null default 0 check(volume>=0),last_yes integer check(last_yes between 1 and 99),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),published_at timestamptz,
 check((state in('resolving','resolved'))=(result is not null)));
create index exchange_markets_public on omni_private.exchange_markets(created_at desc,id desc) where published_at is not null;
create index exchange_markets_closing on omni_private.exchange_markets(closes_at,id) where state='open';
create table omni_private.exchange_positions(market_id uuid references omni_private.exchange_markets(id),user_id uuid references public.omni_profiles(id),outcome text check(outcome in('yes','no')),quantity bigint not null default 0 check(quantity>=0),reserved bigint not null default 0 check(reserved>=0 and reserved<=quantity),claimed bigint not null default 0 check(claimed>=0),primary key(market_id,user_id,outcome));
create index exchange_positions_user on omni_private.exchange_positions(user_id,market_id);
create table omni_private.exchange_orders(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,market_id uuid not null references omni_private.exchange_markets(id),user_id uuid not null references public.omni_profiles(id),
 side text not null check(side in('buy','sell')),outcome text not null check(outcome in('yes','no')),price integer not null check(price between 1 and 99),quantity bigint not null check(quantity between 1 and 1000000),remaining bigint not null check(remaining>=0 and remaining<=quantity),filled bigint not null default 0 check(filled>=0 and filled<=quantity),
 purchased_hold bigint not null default 0 check(purchased_hold>=0),earned_hold bigint not null default 0 check(earned_hold>=0),state text not null default 'open' check(state in('open','filled','cancelled')),created_at timestamptz not null default clock_timestamp(),
 check((side='buy' and purchased_hold+earned_hold=remaining*price*100) or (side='sell' and purchased_hold+earned_hold=0)),check(remaining+filled<=quantity));
create index exchange_orders_book on omni_private.exchange_orders(market_id,side,outcome,price,sequence) where state='open';
create index exchange_orders_user on omni_private.exchange_orders(user_id,sequence desc);
create index exchange_orders_rate on omni_private.exchange_orders(user_id,created_at desc);
create table omni_private.exchange_trades(id uuid primary key default gen_random_uuid(),market_id uuid not null references omni_private.exchange_markets(id),maker_id uuid not null references omni_private.exchange_orders(id),taker_id uuid not null references omni_private.exchange_orders(id),yes_price integer not null check(yes_price between 1 and 99),quantity bigint not null check(quantity>0),created_at timestamptz not null default clock_timestamp());
create index exchange_trades_market on omni_private.exchange_trades(market_id,created_at desc,id);
create table omni_private.exchange_requests(user_id uuid references public.omni_profiles(id),request_id uuid,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(user_id,request_id));
create table omni_private.exchange_shares(id uuid primary key default gen_random_uuid(),order_id uuid not null references omni_private.exchange_orders(id),user_id uuid not null references public.omni_profiles(id),show_amount boolean not null,snapshot jsonb not null,active boolean not null default true,created_at timestamptz not null default clock_timestamp());
create index exchange_shares_user on omni_private.exchange_shares(user_id,created_at desc);
create table omni_private.exchange_disputes(id uuid primary key default gen_random_uuid(),market_id uuid not null references omni_private.exchange_markets(id),user_id uuid not null references public.omni_profiles(id),body text not null check(length(trim(body)) between 10 and 1000),created_at timestamptz not null default clock_timestamp(),handled boolean not null default false,unique(market_id,user_id,created_at));
create index exchange_disputes_pending on omni_private.exchange_disputes(market_id) where not handled;
do $$declare t text;begin foreach t in array array['exchange_markets','exchange_positions','exchange_orders','exchange_trades','exchange_requests','exchange_shares','exchange_disputes'] loop execute format('alter table omni_private.%I enable row level security',t);execute format('revoke all on omni_private.%I from public,anon,authenticated',t);end loop;end;$$;
insert into omni_private.exchange_markets(proposal_id,creator_id,title,rules,source_url,closes_at) select id,author_id,title,rules,source_url,closes_at from omni_private.prediction_proposals where status='approved';

create function omni_private.exchange_journal(actor uuid,kind text,units bigint,detail jsonb) returns uuid language plpgsql set search_path='' as $$declare j uuid;begin
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,gen_random_uuid(),kind,detail,units) returning id into j;return j;end;$$;
-- Caller owns market and canonical wallet locks. Consuming a reservation records
-- its original purchased/earned provenance; only the unused portion is refunded.
create function omni_private.exchange_consume(order_id uuid,count_shares bigint,cost bigint,j uuid) returns void language plpgsql set search_path='' as $$declare o omni_private.exchange_orders;released bigint;bought bigint;refund_b bigint;refund_e bigint;begin
 select * into strict o from omni_private.exchange_orders where id=order_id;
 released=count_shares*o.price*100;if count_shares>o.remaining or cost<0 or cost>released then raise exception 'Invalid fill';end if;
 bought=least(o.purchased_hold,released);refund_b=greatest(bought-cost,0);refund_e=released-cost-refund_b;
 perform omni_private.wallet_entry(j,o.user_id,'prediction_hold',-released);
 perform omni_private.wallet_entry(j,o.user_id,'purchased',refund_b);perform omni_private.wallet_entry(j,o.user_id,'earned',refund_e);
 update omni_private.exchange_orders set remaining=remaining-count_shares,filled=filled+count_shares,purchased_hold=purchased_hold-bought,earned_hold=earned_hold-(released-bought),state=case when remaining=count_shares then 'filled' else 'open' end where id=order_id;
end;$$;
create function omni_private.exchange_cancel(order_id uuid,actor uuid) returns void language plpgsql set search_path='' as $$declare o omni_private.exchange_orders;j uuid;begin
 select * into strict o from omni_private.exchange_orders where id=order_id;if o.state<>'open' then return;end if;
 if o.side='buy' then
  j=omni_private.exchange_journal(actor,'prediction_refund',o.purchased_hold+o.earned_hold,jsonb_build_object('order',o.id,'market',o.market_id));
  perform omni_private.wallet_entry(j,o.user_id,'prediction_hold',-o.purchased_hold-o.earned_hold);perform omni_private.wallet_entry(j,o.user_id,'purchased',o.purchased_hold);perform omni_private.wallet_entry(j,o.user_id,'earned',o.earned_hold);
 else update omni_private.exchange_positions set reserved=reserved-o.remaining where market_id=o.market_id and user_id=o.user_id and outcome=o.outcome;end if;
 update omni_private.exchange_orders set remaining=0,purchased_hold=0,earned_hold=0,state='cancelled' where id=o.id;
end;$$;
create function omni_private.exchange_action(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();old omni_private.exchange_requests;m omni_private.exchange_markets;o omni_private.exchange_orders;k omni_private.exchange_orders;target uuid;uid uuid;order_key uuid;shares bigint;limit_price integer;side_value text;outcome_value text;tif text;cost bigint;held bigint;bought bigint;j uuid;fill bigint;effective integer;price_yes integer;rounds integer:=0;result_value jsonb:='{"ok":true}';p omni_private.exchange_positions;pay bigint:=0;share_key uuid;
begin
 if request is null or payload is null or jsonb_typeof(payload)<>'object' or action is null or action not in('order','cancel','claim','share','unshare','dispute') then raise exception 'Invalid request' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended('exchange-request:'||actor::text||request::text,0));
 select * into old from omni_private.exchange_requests where user_id=actor and request_id=request;
 if found then if old.action<>action or old.payload<>payload then raise exception 'Request changed' using errcode='PT409';end if;return old.result;end if;
 target=(payload->>'market')::uuid;
 if action in('cancel','share') then select market_id into target from omni_private.exchange_orders where id=(payload->>'order')::uuid and user_id=actor;
 elsif action='unshare' then select eo.market_id into target from omni_private.exchange_shares s join omni_private.exchange_orders eo on eo.id=s.order_id where s.id=(payload->>'share')::uuid and s.user_id=actor;end if;
 if target is null then raise exception 'Not found' using errcode='PT404';end if;
 perform pg_advisory_xact_lock(hashtextextended('exchange-market:'||target::text,0));
 select * into m from omni_private.exchange_markets where id=target for update;if not found or m.published_at is null then raise exception 'Market unavailable' using errcode='PT404';end if;
 -- All participating wallets are locked in the same order used by C2C and tips.
 for uid in select distinct v from (select actor v union all select user_id from omni_private.exchange_orders where market_id=target and state='open' and action='order') q order by v loop
  perform omni_private.c2c_lock(uid);insert into omni_private.wallet_accounts(user_id,bucket) values(uid,'prediction_hold') on conflict do nothing;
 end loop;
 if action='order' then
  perform omni_private.require_email_verification();
  if m.state<>'open' or m.closes_at<=clock_timestamp() then raise exception 'Market closed' using errcode='PT409';end if;
  if exists(select 1 from omni_private.wallet_users where user_id=actor and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
  side_value=payload->>'side';outcome_value=payload->>'outcome';tif=coalesce(payload->>'tif','gtc');
  if coalesce(payload->>'quantity','')!~'^[0-9]{1,7}$' or coalesce(payload->>'price','')!~'^[0-9]{1,2}$' or side_value is null or side_value not in('buy','sell') or outcome_value is null or outcome_value not in('yes','no') or tif not in('gtc','ioc') then raise exception 'Invalid order' using errcode='PT400';end if;
  shares=(payload->>'quantity')::bigint;limit_price=(payload->>'price')::integer;
  if shares not between 1 and 1000000 or limit_price not between 1 and 99 then raise exception 'Invalid order' using errcode='PT400';end if;
  if (select count(*) from omni_private.exchange_orders where user_id=actor and state='open')>=100 then raise exception 'Open order limit' using errcode='PT429';end if;
  if (select count(*) from omni_private.exchange_orders where user_id=actor and created_at>statement_timestamp()-interval '1 minute')>=30 then raise exception 'Order rate limit' using errcode='PT429';end if;
  if (select count(*) from omni_private.exchange_orders where market_id=target and state='open')>=1000 then raise exception 'Market order capacity reached' using errcode='PT429';end if;
  insert into omni_private.exchange_positions(market_id,user_id,outcome) values(target,actor,outcome_value) on conflict do nothing;
  held=case when side_value='buy' then shares*limit_price*100 else 0 end;bought=0;
  if side_value='buy' then
   bought=least(held,omni_private.c2c_balance(actor,'purchased'));
   if held-bought>omni_private.c2c_balance(actor,'earned') then raise exception 'Insufficient points' using errcode='PT402';end if;
   j=omni_private.exchange_journal(actor,'prediction_hold',held,jsonb_build_object('market',target,'request',request));
   perform omni_private.wallet_entry(j,actor,'purchased',-bought);perform omni_private.wallet_entry(j,actor,'earned',-(held-bought));perform omni_private.wallet_entry(j,actor,'prediction_hold',held);
  else
   update omni_private.exchange_positions set reserved=reserved+shares where market_id=target and user_id=actor and outcome=outcome_value and quantity-reserved>=shares;
   if not found then raise exception 'Insufficient shares' using errcode='PT402';end if;
  end if;
  insert into omni_private.exchange_orders(market_id,user_id,side,outcome,price,quantity,remaining,purchased_hold,earned_hold) values(target,actor,side_value,outcome_value,limit_price,shares,shares,bought,held-bought) returning id into order_key;
  -- Price/time priority across direct transfers and complementary BUYs. An
  -- opposite-outcome bid acts as an ask at 1 minus its price, fully collateralized.
  for k in select e.* from omni_private.exchange_orders e join public.omni_profiles u on u.id=e.user_id join omni_private.wallet_users w on w.user_id=e.user_id
   where e.market_id=target and e.state='open' and e.user_id<>actor and not u.disabled and not w.frozen and
    ((side_value='buy' and ((e.side='sell' and e.outcome=outcome_value and e.price<=limit_price) or (e.side='buy' and e.outcome<>outcome_value and 100-e.price<=limit_price))) or
     (side_value='sell' and e.side='buy' and e.outcome=outcome_value and e.price>=limit_price))
   order by case when side_value='buy' then case when e.side='sell' then e.price else 100-e.price end else -e.price end,e.sequence
  loop
   select * into strict o from omni_private.exchange_orders where id=order_key;exit when o.remaining=0;
   rounds=rounds+1;if rounds>100 then raise exception 'Order crosses too many levels; use smaller quantity' using errcode='PT429';end if;
   fill=least(o.remaining,k.remaining);effective=case when o.side='buy' and k.side='buy' then 100-k.price else k.price end;
   price_yes=case when o.outcome='yes' then effective else 100-effective end;
   j=omni_private.exchange_journal(actor,'prediction_trade',case when o.side='buy' and k.side='buy' then fill*10000 else fill*effective*100 end,jsonb_build_object('market',target,'maker',k.id,'taker',o.id,'shares',fill,'yes_price',price_yes));
   if o.side='buy' and k.side='buy' then
    perform omni_private.exchange_consume(o.id,fill,fill*effective*100,j);perform omni_private.exchange_consume(k.id,fill,fill*k.price*100,j);
    perform omni_private.wallet_entry(j,null,'prediction_pool',fill*10000);
    insert into omni_private.exchange_positions(market_id,user_id,outcome,quantity) values(target,actor,o.outcome,fill),(target,k.user_id,k.outcome,fill) on conflict(market_id,user_id,outcome) do update set quantity=omni_private.exchange_positions.quantity+excluded.quantity;
    update omni_private.exchange_markets set collateral=collateral+fill*10000 where id=target;
   elsif o.side='buy' then
    perform omni_private.exchange_consume(o.id,fill,fill*effective*100,j);perform omni_private.wallet_entry(j,k.user_id,'purchased',fill*effective*100);
    update omni_private.exchange_positions set quantity=quantity-fill,reserved=reserved-fill where market_id=target and user_id=k.user_id and outcome=k.outcome;
    update omni_private.exchange_positions set quantity=quantity+fill where market_id=target and user_id=actor and outcome=o.outcome;
    update omni_private.exchange_orders set remaining=remaining-fill,filled=filled+fill,state=case when remaining=fill then 'filled' else 'open' end where id=k.id;
   else
    perform omni_private.exchange_consume(k.id,fill,fill*effective*100,j);perform omni_private.wallet_entry(j,actor,'purchased',fill*effective*100);
    update omni_private.exchange_positions set quantity=quantity-fill,reserved=reserved-fill where market_id=target and user_id=actor and outcome=o.outcome;
    insert into omni_private.exchange_positions(market_id,user_id,outcome,quantity) values(target,k.user_id,k.outcome,fill) on conflict(market_id,user_id,outcome) do update set quantity=omni_private.exchange_positions.quantity+excluded.quantity;
    update omni_private.exchange_orders set remaining=remaining-fill,filled=filled+fill,state=case when remaining=fill then 'filled' else 'open' end where id=o.id;
   end if;
   insert into omni_private.exchange_trades(market_id,maker_id,taker_id,yes_price,quantity) values(target,k.id,o.id,price_yes,fill);
   update omni_private.exchange_markets set volume=volume+case when o.side='buy' and k.side='buy' then fill*10000 else fill*effective*100 end,last_yes=price_yes where id=target;
  end loop;
  if tif='ioc' then perform omni_private.exchange_cancel(order_key,actor);end if;
  result_value=jsonb_build_object('ok',true,'id',order_key);
 elsif action='cancel' then perform omni_private.exchange_cancel((payload->>'order')::uuid,actor);
 elsif action='claim' then
  if m.state<>'resolved' then raise exception 'Result not final' using errcode='PT409';end if;
  for o in select * from omni_private.exchange_orders where market_id=target and user_id=actor and state='open' loop perform omni_private.exchange_cancel(o.id,actor);end loop;
  for p in select * from omni_private.exchange_positions where market_id=target and user_id=actor loop
   pay=pay+p.quantity*case when m.result='void' then 5000 when m.result=p.outcome then 10000 else 0 end;
  end loop;
  if pay>m.collateral then raise exception 'Collateral mismatch';end if;
  if pay>0 then j=omni_private.exchange_journal(actor,'prediction_claim',pay,jsonb_build_object('market',target,'result',m.result));perform omni_private.wallet_entry(j,null,'prediction_pool',-pay);perform omni_private.wallet_entry(j,actor,'purchased',pay);end if;
  update omni_private.exchange_positions set claimed=claimed+quantity,quantity=0,reserved=0 where market_id=target and user_id=actor;
  update omni_private.exchange_markets set collateral=collateral-pay where id=target;result_value=jsonb_build_object('ok',true,'units',pay::text);
 elsif action='share' then
  if (select count(*) from omni_private.exchange_shares where user_id=actor and created_at>statement_timestamp()-interval '1 day')>=60 then raise exception 'Share rate limit' using errcode='PT429';end if;
  select * into strict o from omni_private.exchange_orders where id=(payload->>'order')::uuid and user_id=actor;
  if o.filled=0 then raise exception 'Only executed orders can be shared' using errcode='PT400';end if;
  insert into omni_private.exchange_shares(order_id,user_id,show_amount,snapshot) values(o.id,actor,coalesce((payload->>'show_amount')::boolean,false),jsonb_build_object('side',o.side,'outcome',o.outcome,'price',o.price,'filled',o.filled::text,'state',o.state,'order_created_at',o.created_at)) returning id into share_key;
  result_value=jsonb_build_object('ok',true,'id',share_key);
 elsif action='unshare' then update omni_private.exchange_shares set active=false where id=(payload->>'share')::uuid and user_id=actor;
 elsif action='dispute' then
  if m.state<>'resolving' or clock_timestamp()>=m.resolve_after then raise exception 'Dispute window closed' using errcode='PT409';end if;
  if not exists(select 1 from omni_private.exchange_positions where market_id=target and user_id=actor and quantity>0) then raise exception 'Position required' using errcode='PT403';end if;
  if exists(select 1 from omni_private.exchange_disputes where market_id=target and user_id=actor and not handled) then raise exception 'Dispute already submitted' using errcode='PT409';end if;
  insert into omni_private.exchange_disputes(market_id,user_id,body) values(target,actor,trim(payload->>'note'));
 end if;
 insert into omni_private.exchange_requests values(actor,request,action,payload,result_value,clock_timestamp());return result_value;
end;$$;
create function public.omni_exchange_action(request uuid,action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select omni_private.exchange_action(request,action,payload);$$;

create function omni_private.exchange_admin(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner();old omni_private.exchange_requests;m omni_private.exchange_markets;p omni_private.prediction_proposals;target uuid;order_user uuid;note text:=trim(payload->>'note');result_value jsonb:='{"ok":true}';begin
 perform omni_private.require_email_verification();
 if request is null or payload is null or jsonb_typeof(payload)<>'object' or action is null or action not in('create','publish','pause','resume','result','finalize','review_disputes','cancel_order') or note is null or length(note) not between 3 and 1000 then raise exception 'Reason required' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended('exchange-request:'||actor::text||request::text,0));
 select * into old from omni_private.exchange_requests where user_id=actor and request_id=request;
 if found then if old.action<>'admin:'||action or old.payload<>payload then raise exception 'Request changed' using errcode='PT409';end if;return old.result;end if;
 if action='create' then
  if (payload->>'closes_at')::timestamptz is null or (payload->>'closes_at')::timestamptz<clock_timestamp()+interval '5 minutes' or (payload->>'closes_at')::timestamptz>clock_timestamp()+interval '2 years' then raise exception 'Invalid closing time' using errcode='PT400';end if;
  insert into omni_private.exchange_markets(creator_id,title,rules,source_url,category,closes_at,dispute_seconds) values(actor,trim(payload->>'title'),trim(payload->>'rules'),payload->>'source_url',trim(payload->>'category'),(payload->>'closes_at')::timestamptz,coalesce((payload->>'dispute_seconds')::integer,3600)) returning id into target;
 else
  target=(payload->>'market')::uuid;perform pg_advisory_xact_lock(hashtextextended('exchange-market:'||target::text,0));
  select * into m from omni_private.exchange_markets where id=target for update;
  if not found or m.updated_at is distinct from (payload->>'expected')::timestamptz then raise exception 'Market changed' using errcode='PT409';end if;
  if action='cancel_order' then
   select user_id into order_user from omni_private.exchange_orders where id=(payload->>'order')::uuid and market_id=target;
   if not found then raise exception 'Order not found' using errcode='PT404';end if;
   perform omni_private.c2c_lock(order_user);perform omni_private.exchange_cancel((payload->>'order')::uuid,actor);
  elsif action='publish' then
   if m.state<>'draft' or m.closes_at<=clock_timestamp()+interval '1 minute' then raise exception 'Cannot publish' using errcode='PT409';end if;
   update omni_private.exchange_markets set state='open',published_at=clock_timestamp() where id=target;
  elsif action='pause' then
   if m.state<>'open' then raise exception 'Not open' using errcode='PT409';end if;update omni_private.exchange_markets set state='paused' where id=target;
  elsif action='resume' then
   if m.state<>'paused' or m.closes_at<=clock_timestamp() then raise exception 'Cannot resume' using errcode='PT409';end if;update omni_private.exchange_markets set state='open' where id=target;
  elsif action='result' then
   if m.state not in('open','paused','resolving') or m.closes_at>clock_timestamp() then raise exception 'Market not closed' using errcode='PT409';end if;
   if payload->>'result' is null or payload->>'result' not in('yes','no','void') or coalesce(payload->>'evidence_url','')!~'^https://[^[:space:]]+$' or length(payload->>'evidence_url')>500 then raise exception 'Evidence required' using errcode='PT400';end if;
   update omni_private.exchange_markets set state='resolving',result=payload->>'result',resolution_note=note,evidence_url=payload->>'evidence_url',resolve_after=clock_timestamp()+make_interval(secs=>dispute_seconds) where id=target;
  elsif action='review_disputes' then
   if m.state<>'resolving' then raise exception 'No proposed result' using errcode='PT409';end if;
   update omni_private.exchange_disputes set handled=true where market_id=target and not handled;
   update omni_private.exchange_markets set resolution_note=note,resolve_after=clock_timestamp()+make_interval(secs=>dispute_seconds) where id=target;
  elsif action='finalize' then
   if m.state<>'resolving' or m.resolve_after>clock_timestamp() or exists(select 1 from omni_private.exchange_disputes where market_id=target and not handled) then raise exception 'Resolution pending or disputed' using errcode='PT409';end if;
   update omni_private.exchange_markets set state='resolved' where id=target;
  end if;
  update omni_private.exchange_markets set updated_at=clock_timestamp() where id=target;
 end if;
 result_value=jsonb_build_object('ok',true,'id',target);
 insert into public.omni_audit(actor_id,action,target) values(actor,'exchange:'||action,jsonb_build_object('market',target,'reason',note,'request',request,'change',payload)::text);
 insert into omni_private.exchange_requests values(actor,request,'admin:'||action,payload,result_value,clock_timestamp());return result_value;
end;$$;
create function public.omni_exchange_admin(request uuid,action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select omni_private.exchange_admin(request,action,payload);$$;

-- The old proposal API remains compatible. Approval creates a draft market;
-- publishing requires a separate review and cannot silently open trading.
create or replace function omni_private.prediction_review(target uuid,decision text,note text,expected timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=omni_private.market_owner();p omni_private.prediction_proposals;begin
 perform omni_private.require_email_verification();if decision not in('approved','rejected') or decision is null or length(trim(note)) not between 3 and 1000 or note is null then raise exception 'Review reason required' using errcode='PT400';end if;
 select * into p from omni_private.prediction_proposals where id=target for update;if not found or p.updated_at is distinct from expected or p.status<>'pending' then raise exception 'Market changed' using errcode='PT409';end if;
 if decision='approved' and p.closes_at<=clock_timestamp() then raise exception 'Market expired' using errcode='PT400';end if;
 update omni_private.prediction_proposals set status=decision,review_note=note,updated_at=clock_timestamp() where id=target;
 if decision='approved' then insert into omni_private.exchange_markets(proposal_id,creator_id,title,rules,source_url,closes_at) values(p.id,p.author_id,p.title,p.rules,p.source_url,p.closes_at);end if;
 insert into public.omni_audit(actor_id,action,target) values(actor,'prediction:'||decision,jsonb_build_object('id',target,'reason',note)::text);return jsonb_build_object('ok',true);
end;$$;

create function omni_private.exchange_market_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'title',m.title,'rules',m.rules,'source_url',m.source_url,'category',m.category,'closes_at',m.closes_at,'state',m.state,'result',m.result,'resolution_note',m.resolution_note,'evidence_url',m.evidence_url,'resolve_after',m.resolve_after,'dispute_seconds',m.dispute_seconds,'volume',m.volume::text,'last_yes',m.last_yes,'created_at',m.created_at,'updated_at',m.updated_at,'creator_id',m.creator_id,'creator_name',p.display_name,'creator_handle',p.handle,'published_at',m.published_at,'collateral',m.collateral::text) from omni_private.exchange_markets m join public.omni_profiles p on p.id=m.creator_id where m.id=target;
$$;
create function omni_private.exchange_order_json(target uuid) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('id',o.id,'sequence',o.sequence::text,'market_id',o.market_id,'title',m.title,'side',o.side,'outcome',o.outcome,'price',o.price,'quantity',o.quantity::text,'remaining',o.remaining::text,'filled',o.filled::text,'state',o.state,'created_at',o.created_at,'held',(o.purchased_hold+o.earned_hold)::text) from omni_private.exchange_orders o join omni_private.exchange_markets m on m.id=o.market_id where o.id=target;$$;

create function omni_private.exchange_read(view_kind text default 'public',market_id uuid default null,query text default '',category text default '',state_filter text default '',before_id uuid default null,sort_by text default 'new',before_order bigint default null,before_share uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();is_owner boolean:=false;rows jsonb;cursor_value omni_private.exchange_markets;m omni_private.exchange_markets;result_value jsonb;begin
 if view_kind is null or view_kind not in('public','portfolio','admin') or length(coalesce(query,''))>160 or length(coalesce(category,''))>40 or sort_by not in('new','closing') or sort_by is null or before_order<=0 then raise exception 'Invalid view' using errcode='PT400';end if;
 if view_kind='admin' then perform omni_private.market_owner();is_owner=true;elsif view_kind='portfolio' then perform omni_private.wallet_actor();end if;
 if market_id is not null then
  select * into m from omni_private.exchange_markets e where e.id=market_id and (is_owner or e.published_at is not null);if not found then raise exception 'Market unavailable' using errcode='PT404';end if;
 end if;
 if before_id is not null then select * into cursor_value from omni_private.exchange_markets e where e.id=before_id and (is_owner or e.published_at is not null);if not found then raise exception 'Invalid cursor' using errcode='PT400';end if;end if;
 select coalesce(jsonb_agg(value),'[]') into rows from (select omni_private.exchange_market_json(e.id) value from omni_private.exchange_markets e
  where (is_owner or e.published_at is not null) and (market_id is null or e.id=market_id)
  and (view_kind<>'portfolio' or exists(select 1 from omni_private.exchange_positions p where p.market_id=e.id and p.user_id=actor and (p.quantity>0 or p.claimed>0)) or exists(select 1 from omni_private.exchange_orders o where o.market_id=e.id and o.user_id=actor))
  and (coalesce(query,'')='' or strpos(lower(e.title),lower(query))>0) and (coalesce(category,'')='' or e.category=category)
  and (coalesce(state_filter,'')='' or e.state=state_filter and (state_filter<>'open' or e.closes_at>now()) or state_filter='closed' and e.state in('open','paused') and e.closes_at<=now())
  and (before_id is null or (sort_by='new' and (e.created_at,e.id)<(cursor_value.created_at,cursor_value.id)) or (sort_by='closing' and (e.closes_at,e.id)>(cursor_value.closes_at,cursor_value.id)))
  order by case when sort_by='new' then e.created_at end desc,case when sort_by='closing' then e.closes_at end asc,case when sort_by='new' then e.id end desc,case when sort_by='closing' then e.id end asc limit 31) q;
 result_value=jsonb_build_object('rows',rows,'server_time',clock_timestamp(),'categories',(select coalesce(jsonb_agg(c),'[]') from(select distinct e.category c from omni_private.exchange_markets e where is_owner or e.published_at is not null order by c limit 100) z));
 if market_id is not null then
  result_value=result_value||jsonb_build_object('book',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from(select o.side,o.outcome,o.price,sum(o.remaining)::text quantity from omni_private.exchange_orders o join public.omni_profiles u on u.id=o.user_id join omni_private.wallet_users w on w.user_id=o.user_id where o.market_id=market_id and o.state='open' and not u.disabled and not w.frozen group by o.side,o.outcome,o.price order by o.outcome,o.side,o.price limit 396)b),
   'trades',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select id,yes_price,quantity::text,created_at from omni_private.exchange_trades e where e.market_id=market_id order by created_at desc,id desc limit 90)t));
 end if;
 if actor is not null then
  result_value=result_value||jsonb_build_object('orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id) v from omni_private.exchange_orders o where o.user_id=actor and (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),
   'positions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from(select e.market_id,e.outcome,e.quantity::text,e.reserved::text,e.claimed::text from omni_private.exchange_positions e where e.user_id=actor and (market_id is null or e.market_id=market_id) order by e.market_id,e.outcome limit 1000)p),
   'shares',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select s.id,s.order_id,o.market_id,s.show_amount,s.active,s.created_at from omni_private.exchange_shares s join omni_private.exchange_orders o on o.id=s.order_id where s.user_id=actor and s.active and (market_id is null or o.market_id=market_id) and (before_share is null or (s.created_at,s.id)<(select x.created_at,x.id from omni_private.exchange_shares x where x.id=before_share and x.user_id=actor)) order by s.created_at desc,s.id desc limit 51)s),
   'balance',jsonb_build_object('purchased',omni_private.c2c_balance(actor,'purchased')::text,'earned',omni_private.c2c_balance(actor,'earned')::text,'held',omni_private.c2c_balance(actor,'prediction_hold')::text));
 end if;
 if is_owner then result_value=result_value||jsonb_build_object('admin_orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id)||jsonb_build_object('user_id',o.user_id,'handle',p.handle) v from omni_private.exchange_orders o join public.omni_profiles p on p.id=o.user_id where (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),'disputes',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select d.id,d.market_id,d.body,d.handled,d.created_at,p.handle from omni_private.exchange_disputes d join public.omni_profiles p on p.id=d.user_id where market_id is null or d.market_id=market_id order by d.handled,d.created_at desc limit 100)d),
 'totals',(select jsonb_build_object('markets',count(*),'open',count(*)filter(where state='open' and closes_at>now()),'resolving',count(*)filter(where state='resolving'),'collateral',coalesce(sum(collateral),0)::text,'volume',coalesce(sum(volume),0)::text) from omni_private.exchange_markets));end if;
 return result_value;
end;$$;
create function public.omni_exchange_read(view_kind text default 'public',market_id uuid default null,query text default '',category text default '',state_filter text default '',before_id uuid default null,sort_by text default 'new',before_order bigint default null,before_share uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.exchange_read(view_kind,market_id,query,category,state_filter,before_id,sort_by,before_order,before_share);$$;
create function omni_private.exchange_card(target uuid,kind text default 'market') returns jsonb language plpgsql stable security definer set search_path='' as $$declare s omni_private.exchange_shares;o omni_private.exchange_orders;m uuid;result_value jsonb;begin
 if kind='market' then m=target;
 elsif kind='order' then select * into s from omni_private.exchange_shares where id=target and active;if not found then return null;end if;select * into o from omni_private.exchange_orders where id=s.order_id;m=o.market_id;
 else return null;end if;
 if not exists(select 1 from omni_private.exchange_markets where id=m and published_at is not null) then return null;end if;
 result_value=jsonb_build_object('market',omni_private.exchange_market_json(m));
 if kind='order' then
  if exists(select 1 from public.omni_profiles where id=s.user_id and disabled) then return null;end if;
  result_value=result_value||jsonb_build_object('order',s.snapshot-'filled'||case when s.show_amount then jsonb_build_object('filled',s.snapshot->>'filled') else '{}'::jsonb end,'shared_at',s.created_at,'trader',(select jsonb_build_object('id',id,'name',display_name,'handle',handle,'avatar_key',avatar_key) from public.omni_profiles where id=s.user_id));
 end if;return result_value;
end;$$;
create function public.omni_exchange_card(target uuid,kind text default 'market') returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.exchange_card(target,kind);$$;
-- Immutable executions and snapshots make shared trade data verifiable.
create trigger exchange_trades_immutable before update or delete on omni_private.exchange_trades for each row execute function omni_private.wallet_immutable();
revoke all on function omni_private.exchange_journal(uuid,text,bigint,jsonb),omni_private.exchange_consume(uuid,bigint,bigint,uuid),omni_private.exchange_cancel(uuid,uuid),omni_private.exchange_market_json(uuid),omni_private.exchange_order_json(uuid) from public,anon,authenticated;
revoke all on function omni_private.exchange_action(uuid,text,jsonb),public.omni_exchange_action(uuid,text,jsonb),omni_private.exchange_admin(uuid,text,jsonb),public.omni_exchange_admin(uuid,text,jsonb),omni_private.exchange_read(text,uuid,text,text,text,uuid,text,bigint,uuid),public.omni_exchange_read(text,uuid,text,text,text,uuid,text,bigint,uuid),omni_private.exchange_card(uuid,text),public.omni_exchange_card(uuid,text) from public,anon,authenticated;
grant execute on function omni_private.exchange_action(uuid,text,jsonb),public.omni_exchange_action(uuid,text,jsonb),omni_private.exchange_admin(uuid,text,jsonb),public.omni_exchange_admin(uuid,text,jsonb) to authenticated;
grant execute on function omni_private.exchange_read(text,uuid,text,text,text,uuid,text,bigint,uuid),public.omni_exchange_read(text,uuid,text,text,text,uuid,text,bigint,uuid),omni_private.exchange_card(uuid,text),public.omni_exchange_card(uuid,text) to anon,authenticated;
create or replace function omni_private.wallet_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();result jsonb;begin
 select jsonb_build_object('purchased',coalesce(max(a.balance) filter(where a.bucket='purchased'),0)::text,'earned',coalesce(max(a.balance) filter(where a.bucket='earned'),0)::text,'held',coalesce(max(a.balance) filter(where a.bucket='held'),0)::text,'prediction_held',coalesce(max(a.balance) filter(where a.bucket='prediction_hold'),0)::text) into result from omni_private.wallet_accounts a where a.user_id=actor;
 return result||(select jsonb_build_object('deposits_enabled',s.deposits_enabled,'tipping_enabled',s.tipping_enabled,'withdrawals_enabled',s.withdrawals_enabled,'withdrawal_min_units',s.withdrawal_min_units::text,'withdrawal_fee_bps',s.withdrawal_fee_bps::text,'frozen',coalesce((select frozen from omni_private.wallet_users where user_id=actor),false)) from omni_private.wallet_settings s where id);
end;$$;
create or replace function omni_private.identity_value(target uuid,private_view boolean default false) returns jsonb language sql stable set search_path='' as $$
 with stats as(select p.id,coalesce(m.hide_level,false) hide_level,coalesce(m.hide_title,false) hide_title,m.level_override,m.title_override,m.updated_at,
 case r.tip_basis when 'sent' then coalesce(s.sent,0) when 'both' then coalesce(s.received,0)+coalesce(s.sent,0) else coalesce(s.received,0) end xp,
 coalesce((select sum(balance) from omni_private.wallet_accounts where user_id=p.id and bucket in('purchased','earned','held','codes','escrow','prediction_hold')),0) wealth
 from public.omni_profiles p cross join omni_private.identity_rules r left join omni_private.identity_members m on m.user_id=p.id left join omni_private.identity_tip_totals s on s.user_id=p.id where p.id=target and (private_view or not p.disabled)),
 v as(select s.*,coalesce(level_override,(select max(level) from omni_private.identity_levels where minimum<=xp),1) level,coalesce(title_override,(select id from omni_private.identity_titles where minimum<=wealth order by minimum desc limit 1)) title from stats s)
 select jsonb_build_object('id',id,'level',case when private_view or not hide_level then level end,'title',case when private_view or not hide_title then (select labels from omni_private.identity_titles where id=v.title) end)
 ||case when private_view then jsonb_build_object('hide_level',hide_level,'hide_title',hide_title,'level_override',level_override,'title_override',title_override,'updated_at',updated_at,'xp',xp::text,'wealth',wealth::text,'next',(select minimum::text from omni_private.identity_levels where level=v.level+1)) else '{}'::jsonb end from v;
$$;
commit;
