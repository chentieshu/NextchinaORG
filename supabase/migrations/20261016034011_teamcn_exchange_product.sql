begin;
-- This rollout is before the first production trade. Never silently invent historical cost basis.
do $$begin if exists(select 1 from omni_private.exchange_trades) then raise exception 'Historical executions need a cost-basis backfill before this migration';end if;end;$$;
alter table omni_private.exchange_positions add column cost_units bigint not null default 0 check(cost_units>=0),add column realized_units bigint not null default 0;
alter table omni_private.exchange_orders add column tif text not null default 'gtc' check(tif in('gtc','ioc','fok')),add column post_only boolean not null default false;
create index exchange_markets_volume on omni_private.exchange_markets(volume desc,id desc) where published_at is not null;
create table omni_private.exchange_watchlist(user_id uuid references public.omni_profiles(id) on delete cascade,market_id uuid references omni_private.exchange_markets(id) on delete cascade,created_at timestamptz not null default clock_timestamp(),primary key(user_id,market_id));
create index exchange_watchlist_market on omni_private.exchange_watchlist(market_id);
alter table omni_private.exchange_watchlist enable row level security;
create table omni_private.exchange_events(id bigint generated always as identity primary key,market_id uuid not null references omni_private.exchange_markets(id),event text not null,result text,note text not null default '',evidence_url text not null default '',created_at timestamptz not null default clock_timestamp());
create index exchange_events_market on omni_private.exchange_events(market_id,created_at desc,id desc);
alter table omni_private.exchange_events enable row level security;
revoke all on omni_private.exchange_watchlist,omni_private.exchange_events from public,anon,authenticated;

-- Both sides use the actual execution price. Cost is average cost, rounded down
-- only when allocating a partial sale; selling the last share removes all cost.
create function omni_private.exchange_record_cost() returns trigger language plpgsql set search_path='' as $$
declare o omni_private.exchange_orders;p omni_private.exchange_positions;unit_price integer;removed bigint;
begin
 for o in select * from omni_private.exchange_orders where id in(new.maker_id,new.taker_id) loop
  unit_price=case when o.outcome='yes' then new.yes_price else 100-new.yes_price end;
  if o.side='buy' then update omni_private.exchange_positions set cost_units=cost_units+new.quantity*unit_price*100 where market_id=new.market_id and user_id=o.user_id and outcome=o.outcome;
  else
   select * into strict p from omni_private.exchange_positions where market_id=new.market_id and user_id=o.user_id and outcome=o.outcome;
   removed=case when p.quantity=0 then p.cost_units else floor(p.cost_units::numeric*new.quantity/(p.quantity+new.quantity))::bigint end;
   update omni_private.exchange_positions set cost_units=cost_units-removed,realized_units=realized_units+new.quantity*unit_price*100-removed where market_id=new.market_id and user_id=o.user_id and outcome=o.outcome;
  end if;
 end loop;return new;
end;$$;
create trigger exchange_trade_cost after insert on omni_private.exchange_trades for each row execute function omni_private.exchange_record_cost();
revoke all on function omni_private.exchange_record_cost() from public,anon,authenticated;
create function omni_private.exchange_watch(target uuid,watching boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 if watching is null or not exists(select 1 from omni_private.exchange_markets where id=target and published_at is not null) then raise exception 'Market unavailable' using errcode='PT404';end if;
 perform pg_advisory_xact_lock(hashtextextended('exchange-watch:'||actor::text,0));
 if watching then
  if not exists(select 1 from omni_private.exchange_watchlist where user_id=actor and market_id=target) and (select count(*) from omni_private.exchange_watchlist where user_id=actor)>=500 then raise exception 'Watchlist full' using errcode='PT429';end if;
  insert into omni_private.exchange_watchlist(user_id,market_id) values(actor,target) on conflict do nothing;
 else delete from omni_private.exchange_watchlist where user_id=actor and market_id=target;end if;
 return jsonb_build_object('ok',true,'watching',watching);end;$$;
create function public.omni_exchange_watch(target uuid,watching boolean) returns jsonb language sql security invoker set search_path='' as $$select omni_private.exchange_watch(target,watching);$$;
revoke all on function omni_private.exchange_watch(uuid,boolean),public.omni_exchange_watch(uuid,boolean) from public,anon,authenticated;
grant execute on function omni_private.exchange_watch(uuid,boolean),public.omni_exchange_watch(uuid,boolean) to authenticated;
create or replace function omni_private.exchange_action(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if coalesce(payload->>'quantity','')!~'^[0-9]{1,7}$' or coalesce(payload->>'price','')!~'^[0-9]{1,2}$' or side_value is null or side_value not in('buy','sell') or outcome_value is null or outcome_value not in('yes','no') or tif not in('gtc','ioc','fok') or (coalesce((payload->>'post_only')::boolean,false) and tif<>'gtc') then raise exception 'Invalid order' using errcode='PT400';end if;
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
  insert into omni_private.exchange_orders(market_id,user_id,side,outcome,price,quantity,remaining,purchased_hold,earned_hold,tif,post_only) values(target,actor,side_value,outcome_value,limit_price,shares,shares,bought,held-bought,tif,coalesce((payload->>'post_only')::boolean,false)) returning id into order_key;
  -- Price/time priority across direct transfers and complementary BUYs. An
  -- opposite-outcome bid acts as an ask at 1 minus its price, fully collateralized.
  for k in select e.* from omni_private.exchange_orders e join public.omni_profiles u on u.id=e.user_id join omni_private.wallet_users w on w.user_id=e.user_id
   where e.market_id=target and e.state='open' and e.user_id<>actor and not u.disabled and not w.frozen and
    ((side_value='buy' and ((e.side='sell' and e.outcome=outcome_value and e.price<=limit_price) or (e.side='buy' and e.outcome<>outcome_value and 100-e.price<=limit_price))) or
     (side_value='sell' and e.side='buy' and e.outcome=outcome_value and e.price>=limit_price))
   order by case when side_value='buy' then case when e.side='sell' then e.price else 100-e.price end else -e.price end,e.sequence
  loop
   select * into strict o from omni_private.exchange_orders where id=order_key;exit when o.remaining=0;
   if coalesce((payload->>'post_only')::boolean,false) then raise exception 'Post-only order would execute' using errcode='PT412';end if;
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
  if tif='fok' and exists(select 1 from omni_private.exchange_orders where id=order_key and remaining>0) then raise exception 'Insufficient depth for full fill' using errcode='PT412';end if;
  if tif='ioc' then perform omni_private.exchange_cancel(order_key,actor);end if;
  select jsonb_build_object('ok',true,'id',id,'filled',filled::text,'remaining',remaining::text,'state',state) into result_value from omni_private.exchange_orders where id=order_key;
 elsif action='cancel' then perform omni_private.exchange_cancel((payload->>'order')::uuid,actor);
 elsif action='claim' then
  if m.state<>'resolved' then raise exception 'Result not final' using errcode='PT409';end if;
  for o in select * from omni_private.exchange_orders where market_id=target and user_id=actor and state='open' loop perform omni_private.exchange_cancel(o.id,actor);end loop;
  for p in select * from omni_private.exchange_positions where market_id=target and user_id=actor loop
   pay=pay+p.quantity*case when m.result='void' then 5000 when m.result=p.outcome then 10000 else 0 end;
  end loop;
  if pay>m.collateral then raise exception 'Collateral mismatch';end if;
  if pay>0 then j=omni_private.exchange_journal(actor,'prediction_claim',pay,jsonb_build_object('market',target,'result',m.result));perform omni_private.wallet_entry(j,null,'prediction_pool',-pay);perform omni_private.wallet_entry(j,actor,'purchased',pay);end if;
  update omni_private.exchange_positions set realized_units=realized_units+quantity*case when m.result='void' then 5000 when m.result=outcome then 10000 else 0 end-cost_units,cost_units=0,claimed=claimed+quantity,quantity=0,reserved=0 where market_id=target and user_id=actor;
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

create or replace function omni_private.exchange_admin(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner();old omni_private.exchange_requests;m omni_private.exchange_markets;p omni_private.prediction_proposals;target uuid;order_user uuid;note text:=trim(payload->>'note');result_value jsonb:='{"ok":true}';begin
 perform omni_private.require_email_verification();
 if request is null or payload is null or jsonb_typeof(payload)<>'object' or action is null or action not in('edit','create','publish','pause','resume','result','finalize','review_disputes','cancel_order') or note is null or length(note) not between 3 and 1000 then raise exception 'Reason required' using errcode='PT400';end if;
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
  if action='edit' then
   if m.state<>'draft' or m.published_at is not null then raise exception 'Published rules are immutable' using errcode='PT409';end if;
   if (payload->>'closes_at')::timestamptz is null or (payload->>'closes_at')::timestamptz<clock_timestamp()+interval '5 minutes' or (payload->>'closes_at')::timestamptz>clock_timestamp()+interval '2 years' then raise exception 'Invalid closing time' using errcode='PT400';end if;
   update omni_private.exchange_markets set title=trim(payload->>'title'),rules=trim(payload->>'rules'),source_url=payload->>'source_url',category=trim(payload->>'category'),closes_at=(payload->>'closes_at')::timestamptz,dispute_seconds=(payload->>'dispute_seconds')::integer where id=target;
  elsif action='cancel_order' then
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
   -- Release all open orders atomically when settlement becomes final.
   for order_user in select distinct user_id from omni_private.exchange_orders where market_id=target and state='open' order by user_id loop perform omni_private.c2c_lock(order_user);end loop;
   for order_user in select id from omni_private.exchange_orders where market_id=target and state='open' order by sequence loop perform omni_private.exchange_cancel(order_user,actor);end loop;
   update omni_private.exchange_markets set state='resolved' where id=target;
  end if;
  update omni_private.exchange_markets set updated_at=clock_timestamp() where id=target;
 end if;
 if action in('publish','pause','resume','result','review_disputes','finalize') then
  insert into omni_private.exchange_events(market_id,event,result,note,evidence_url) values(target,action,case when action='result' then payload->>'result' when action='finalize' then m.result else null end,case when action in('result','review_disputes') then note else '' end,case when action='result' then payload->>'evidence_url' else '' end);
 end if;
 result_value=jsonb_build_object('ok',true,'id',target);
 insert into public.omni_audit(actor_id,action,target) values(actor,'exchange:'||action,jsonb_build_object('market',target,'reason',note,'request',request,'change',payload)::text);
 insert into omni_private.exchange_requests values(actor,request,'admin:'||action,payload,result_value,clock_timestamp());return result_value;
end;$$;

create function omni_private.exchange_prices(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('best_yes_bid',max(o.price)filter(where o.side='buy' and o.outcome='yes'),'best_yes_ask',min(case when o.side='sell' and o.outcome='yes' then o.price when o.side='buy' and o.outcome='no' then 100-o.price end))
 from omni_private.exchange_orders o join public.omni_profiles p on p.id=o.user_id join omni_private.wallet_users w on w.user_id=o.user_id
 where o.market_id=target and o.state='open' and not p.disabled and not w.frozen;
$$;
revoke all on function omni_private.exchange_prices(uuid) from public,anon,authenticated;
create or replace function omni_private.exchange_market_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'title',m.title,'rules',m.rules,'source_url',m.source_url,'category',m.category,'closes_at',m.closes_at,'state',m.state,'result',m.result,'resolution_note',m.resolution_note,'evidence_url',m.evidence_url,'resolve_after',m.resolve_after,'dispute_seconds',m.dispute_seconds,'volume',m.volume::text,'last_yes',m.last_yes,'created_at',m.created_at,'updated_at',m.updated_at,'creator_id',m.creator_id,'creator_name',p.display_name,'creator_handle',p.handle,'published_at',m.published_at,'collateral',m.collateral::text,'watching',exists(select 1 from omni_private.exchange_watchlist w where w.market_id=m.id and w.user_id=auth.uid()))||omni_private.exchange_prices(m.id) from omni_private.exchange_markets m join public.omni_profiles p on p.id=m.creator_id where m.id=target;
$$;


create or replace function omni_private.exchange_order_json(target uuid) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('id',o.id,'sequence',o.sequence::text,'market_id',o.market_id,'title',m.title,'side',o.side,'outcome',o.outcome,'price',o.price,'tif',o.tif,'post_only',o.post_only,'quantity',o.quantity::text,'remaining',o.remaining::text,'filled',o.filled::text,'state',o.state,'created_at',o.created_at,'held',(o.purchased_hold+o.earned_hold)::text) from omni_private.exchange_orders o join omni_private.exchange_markets m on m.id=o.market_id where o.id=target;$$;



create or replace function omni_private.exchange_read(view_kind text default 'public',market_id uuid default null,query text default '',category text default '',state_filter text default '',before_id uuid default null,sort_by text default 'new',before_order bigint default null,before_share uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();is_owner boolean:=false;rows jsonb;cursor_value omni_private.exchange_markets;m omni_private.exchange_markets;result_value jsonb;begin
 if view_kind is null or view_kind not in('public','portfolio','watchlist','admin') or length(coalesce(query,''))>160 or length(coalesce(category,''))>40 or sort_by not in('new','closing','volume') or sort_by is null or before_order<=0 then raise exception 'Invalid view' using errcode='PT400';end if;
 if view_kind='admin' then perform omni_private.market_owner();is_owner=true;elsif view_kind in('portfolio','watchlist') then perform omni_private.wallet_actor();end if;
 if market_id is not null then
  select * into m from omni_private.exchange_markets e where e.id=market_id and (is_owner or e.published_at is not null);if not found then raise exception 'Market unavailable' using errcode='PT404';end if;
 end if;
 if before_id is not null then select * into cursor_value from omni_private.exchange_markets e where e.id=before_id and (is_owner or e.published_at is not null);if not found then raise exception 'Invalid cursor' using errcode='PT400';end if;end if;
 select coalesce(jsonb_agg(value),'[]') into rows from (select omni_private.exchange_market_json(e.id) value from omni_private.exchange_markets e
  where (is_owner or e.published_at is not null) and (market_id is null or e.id=market_id)
  and (view_kind<>'watchlist' or exists(select 1 from omni_private.exchange_watchlist w where w.user_id=actor and w.market_id=e.id))
  and (view_kind<>'portfolio' or exists(select 1 from omni_private.exchange_positions p where p.market_id=e.id and p.user_id=actor and (p.quantity>0 or p.claimed>0)) or exists(select 1 from omni_private.exchange_orders o where o.market_id=e.id and o.user_id=actor))
  and (coalesce(query,'')='' or strpos(lower(e.title),lower(query))>0) and (coalesce(category,'')='' or e.category=category)
  and (coalesce(state_filter,'')='' or e.state=state_filter and (state_filter<>'open' or e.closes_at>now()) or state_filter='closed' and e.state in('open','paused') and e.closes_at<=now())
  and (before_id is null or (sort_by='new' and (e.created_at,e.id)<(cursor_value.created_at,cursor_value.id)) or (sort_by='volume' and (e.volume,e.id)<(cursor_value.volume,cursor_value.id)) or (sort_by='closing' and (e.closes_at,e.id)>(cursor_value.closes_at,cursor_value.id)))
  order by case when sort_by='volume' then e.volume end desc,case when sort_by='volume' then e.id end desc,case when sort_by='new' then e.created_at end desc,case when sort_by='closing' then e.closes_at end asc,case when sort_by='new' then e.id end desc,case when sort_by='closing' then e.id end asc limit 31) q;
 result_value=jsonb_build_object('rows',rows,'server_time',clock_timestamp(),'categories',(select coalesce(jsonb_agg(c),'[]') from(select distinct e.category c from omni_private.exchange_markets e where is_owner or e.published_at is not null order by c limit 100) z));
 if market_id is not null then
  result_value=result_value||jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(ev)),'[]') from(select event,result,note,evidence_url,created_at from omni_private.exchange_events where exchange_events.market_id=exchange_read.market_id order by created_at desc,id desc limit 50)ev),'book',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from(select o.side,o.outcome,o.price,sum(o.remaining)::text quantity from omni_private.exchange_orders o join public.omni_profiles u on u.id=o.user_id join omni_private.wallet_users w on w.user_id=o.user_id where o.market_id=market_id and o.state='open' and not u.disabled and not w.frozen group by o.side,o.outcome,o.price order by o.outcome,o.side,o.price limit 396)b),
   'trades',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select id,yes_price,quantity::text,created_at from omni_private.exchange_trades e where e.market_id=market_id order by created_at desc,id desc limit 90)t));
 end if;
 if actor is not null and (view_kind='portfolio' or (view_kind='public' and market_id is not null)) then
  result_value=result_value||jsonb_build_object('orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id) v from omni_private.exchange_orders o where o.user_id=actor and (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),
   'positions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from(select e.market_id,e.outcome,e.quantity::text,e.reserved::text,e.claimed::text,e.cost_units::text,e.realized_units::text from omni_private.exchange_positions e where e.user_id=actor and (market_id is null or e.market_id=market_id) and (market_id is not null or e.market_id in(select (value->>'id')::uuid from jsonb_array_elements(rows))) order by e.market_id,e.outcome limit 62)p),
   'shares',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select s.id,s.order_id,o.market_id,s.show_amount,s.active,s.created_at from omni_private.exchange_shares s join omni_private.exchange_orders o on o.id=s.order_id where s.user_id=actor and s.active and (market_id is null or o.market_id=market_id) and (before_share is null or (s.created_at,s.id)<(select x.created_at,x.id from omni_private.exchange_shares x where x.id=before_share and x.user_id=actor)) order by s.created_at desc,s.id desc limit 51)s),
   'balance',jsonb_build_object('purchased',omni_private.c2c_balance(actor,'purchased')::text,'earned',omni_private.c2c_balance(actor,'earned')::text,'held',omni_private.c2c_balance(actor,'prediction_hold')::text));
 end if;
 if is_owner then result_value=result_value||jsonb_build_object('admin_orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id)||jsonb_build_object('user_id',o.user_id,'handle',p.handle) v from omni_private.exchange_orders o join public.omni_profiles p on p.id=o.user_id where (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),'disputes',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select d.id,d.market_id,d.body,d.handled,d.created_at,p.handle from omni_private.exchange_disputes d join public.omni_profiles p on p.id=d.user_id where market_id is null or d.market_id=market_id order by d.handled,d.created_at desc limit 100)d),
 'totals',(select jsonb_build_object('markets',count(*),'open',count(*)filter(where state='open' and closes_at>now()),'resolving',count(*)filter(where state='resolving'),'collateral',coalesce(sum(collateral),0)::text,'volume',coalesce(sum(volume),0)::text) from omni_private.exchange_markets));end if;
 return result_value;
end;$$;
-- Read-only quote follows exactly the matching price/time priority, excluding self orders.
create function omni_private.exchange_quote(target uuid,side_value text,outcome_value text,limit_price integer,shares bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();k record;fill bigint;remaining bigint:=shares;units bigint:=0;worst integer;rounds integer:=0;begin
 if target is null or side_value is null or side_value not in('buy','sell') or outcome_value is null or outcome_value not in('yes','no') or limit_price is null or limit_price not between 1 and 99 or shares is null or shares not between 1 and 1000000 then raise exception 'Invalid quote' using errcode='PT400';end if;
 if not exists(select 1 from omni_private.exchange_markets where id=target and published_at is not null and state='open' and closes_at>now()) then raise exception 'Market closed' using errcode='PT409';end if;
 for k in select e.remaining,case when side_value='buy' and e.side='buy' then 100-e.price else e.price end price from omni_private.exchange_orders e join public.omni_profiles u on u.id=e.user_id join omni_private.wallet_users w on w.user_id=e.user_id
 where e.market_id=target and e.state='open' and e.user_id is distinct from actor and not u.disabled and not w.frozen and
 ((side_value='buy' and ((e.side='sell' and e.outcome=outcome_value and e.price<=limit_price) or (e.side='buy' and e.outcome<>outcome_value and 100-e.price<=limit_price))) or (side_value='sell' and e.side='buy' and e.outcome=outcome_value and e.price>=limit_price))
 order by case when side_value='buy' then case when e.side='sell' then e.price else 100-e.price end else -e.price end,e.sequence limit 101 loop
  exit when remaining=0;rounds=rounds+1;exit when rounds>100;
  fill=least(remaining,k.remaining);units=units+fill*k.price*100;remaining=remaining-fill;worst=k.price;
 end loop;
 return jsonb_build_object('filled',(shares-remaining)::text,'unfilled',remaining::text,'units',units::text,'worst',worst,'limited',rounds>100,'server_time',clock_timestamp());end;$$;
create function public.omni_exchange_quote(target uuid,side_value text,outcome_value text,limit_price integer,shares bigint) returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.exchange_quote(target,side_value,outcome_value,limit_price,shares);$$;
revoke all on function omni_private.exchange_quote(uuid,text,text,integer,bigint),public.omni_exchange_quote(uuid,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function omni_private.exchange_quote(uuid,text,text,integer,bigint),public.omni_exchange_quote(uuid,text,text,integer,bigint) to anon,authenticated;
commit;
