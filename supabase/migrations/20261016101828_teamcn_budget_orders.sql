begin;
-- Budget orders consume actual spend; normal limit orders retain their invariant.
alter table omni_private.exchange_orders add column budget_units bigint,add column executed_units bigint not null default 0 check(executed_units>=0);
do $$declare constraint_name text;begin
 select conname into strict constraint_name from pg_constraint where conrelid='omni_private.exchange_orders'::regclass and contype='c' and pg_get_constraintdef(oid) like '%purchased_hold%' and pg_get_constraintdef(oid) like '%remaining%';
 execute format('alter table omni_private.exchange_orders drop constraint %I',constraint_name);
end;$$;
alter table omni_private.exchange_orders add constraint exchange_order_hold_check check(
 (budget_units is null and ((side='buy' and purchased_hold+earned_hold=remaining*price*100) or (side='sell' and purchased_hold+earned_hold=0))) or
 (budget_units is not null and side='buy' and tif='ioc' and not post_only and budget_units between 100 and 9900000000 and purchased_hold+earned_hold+executed_units<=budget_units and (state='open' or purchased_hold+earned_hold=0)));
-- Actual execution costs, backfilled once from both sides of each trade.
update omni_private.exchange_orders o set executed_units=q.units from (
 select o2.id,sum(t.quantity*(case when o2.outcome='yes' then t.yes_price else 100-t.yes_price end)*100)::bigint units
 from omni_private.exchange_orders o2 join omni_private.exchange_trades t on o2.id=t.maker_id or o2.id=t.taker_id group by o2.id) q where o.id=q.id;
create or replace function omni_private.exchange_consume(order_id uuid,count_shares bigint,cost bigint,j uuid) returns void language plpgsql set search_path='' as $$declare o omni_private.exchange_orders;released bigint;bought bigint;refund_b bigint;refund_e bigint;begin
 select * into strict o from omni_private.exchange_orders where id=order_id;
 if o.budget_units is not null then
  if count_shares<=0 or count_shares>o.remaining or cost<0 or cost>count_shares*o.price*100 or cost>o.purchased_hold+o.earned_hold then raise exception 'Invalid budget fill';end if;
  bought=least(o.purchased_hold,cost);
  refund_b=case when count_shares=o.remaining then o.purchased_hold-bought else 0 end;
  refund_e=case when count_shares=o.remaining then o.earned_hold-(cost-bought) else 0 end;
  perform omni_private.wallet_entry(j,o.user_id,'prediction_hold',-cost-refund_b-refund_e);
  perform omni_private.wallet_entry(j,o.user_id,'purchased',refund_b);
  perform omni_private.wallet_entry(j,o.user_id,'earned',refund_e);
  update omni_private.exchange_orders set remaining=remaining-count_shares,filled=filled+count_shares,purchased_hold=purchased_hold-bought-refund_b,earned_hold=earned_hold-(cost-bought)-refund_e,state=case when remaining=count_shares then 'filled' else 'open' end where id=order_id;
  return;
 end if;
 released=count_shares*o.price*100;if count_shares>o.remaining or cost<0 or cost>released then raise exception 'Invalid fill';end if;
 bought=least(o.purchased_hold,released);refund_b=greatest(bought-cost,0);refund_e=released-cost-refund_b;
 perform omni_private.wallet_entry(j,o.user_id,'prediction_hold',-released);
 perform omni_private.wallet_entry(j,o.user_id,'purchased',refund_b);perform omni_private.wallet_entry(j,o.user_id,'earned',refund_e);
 update omni_private.exchange_orders set remaining=remaining-count_shares,filled=filled+count_shares,purchased_hold=purchased_hold-bought,earned_hold=earned_hold-(released-bought),state=case when remaining=count_shares then 'filled' else 'open' end where id=order_id;
end;$$;
create or replace function omni_private.exchange_record_cost() returns trigger language plpgsql set search_path='' as $$
declare o omni_private.exchange_orders;p omni_private.exchange_positions;unit_price integer;removed bigint;
begin
 for o in select * from omni_private.exchange_orders where id in(new.maker_id,new.taker_id) loop
  unit_price=case when o.outcome='yes' then new.yes_price else 100-new.yes_price end;
  update omni_private.exchange_orders set executed_units=executed_units+new.quantity*unit_price*100 where id=o.id;
  if o.side='buy' then update omni_private.exchange_positions set cost_units=cost_units+new.quantity*unit_price*100 where market_id=new.market_id and user_id=o.user_id and outcome=o.outcome;
  else
   select * into strict p from omni_private.exchange_positions where market_id=new.market_id and user_id=o.user_id and outcome=o.outcome;
   removed=case when p.quantity=0 then p.cost_units else floor(p.cost_units::numeric*new.quantity/(p.quantity+new.quantity))::bigint end;
   update omni_private.exchange_positions set cost_units=cost_units-removed,realized_units=realized_units+new.quantity*unit_price*100-removed where market_id=new.market_id and user_id=o.user_id and outcome=o.outcome;
  end if;
 end loop;return new;
end;$$;
create or replace function omni_private.exchange_cancel(order_id uuid,actor uuid) returns void language plpgsql set search_path='' as $$declare o omni_private.exchange_orders;j uuid;begin
 select * into strict o from omni_private.exchange_orders where id=order_id;if o.state<>'open' then return;end if;
 if o.side='buy' then
  if o.purchased_hold+o.earned_hold>0 then
  j=omni_private.exchange_journal(actor,'prediction_refund',o.purchased_hold+o.earned_hold,jsonb_build_object('order',o.id,'market',o.market_id));
  perform omni_private.wallet_entry(j,o.user_id,'prediction_hold',-o.purchased_hold-o.earned_hold);perform omni_private.wallet_entry(j,o.user_id,'purchased',o.purchased_hold);perform omni_private.wallet_entry(j,o.user_id,'earned',o.earned_hold);
 end if;
 else update omni_private.exchange_positions set reserved=reserved-o.remaining where market_id=o.market_id and user_id=o.user_id and outcome=o.outcome;end if;
 update omni_private.exchange_orders set remaining=0,purchased_hold=0,earned_hold=0,state='cancelled' where id=o.id;
end;$$;
create or replace function omni_private.exchange_action(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();old omni_private.exchange_requests;m omni_private.exchange_markets;o omni_private.exchange_orders;k omni_private.exchange_orders;target uuid;uid uuid;order_key uuid;shares bigint;limit_price integer;side_value text;outcome_value text;tif text;cost bigint;held bigint;bought bigint;j uuid;fill bigint;effective integer;price_yes integer;rounds integer:=0;result_value jsonb:='{"ok":true}';p omni_private.exchange_positions;pay bigint:=0;share_key uuid;budget bigint;
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
  if m.state<>'open' or m.closes_at<=clock_timestamp() or not coalesce(omni_private.exchange_official_ready(m.id),false) then raise exception 'Market closed' using errcode='PT409';end if;
  if exists(select 1 from omni_private.wallet_users where user_id=actor and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
  side_value=payload->>'side';outcome_value=payload->>'outcome';tif=coalesce(payload->>'tif','gtc');
  if (not(payload ? 'budget_units') and coalesce(payload->>'quantity','')!~'^[0-9]{1,7}$') or coalesce(payload->>'price','')!~'^[0-9]{1,2}$' or side_value is null or side_value not in('buy','sell') or outcome_value is null or outcome_value not in('yes','no') or tif not in('gtc','ioc','fok') or (coalesce((payload->>'post_only')::boolean,false) and tif<>'gtc') then raise exception 'Invalid order' using errcode='PT400';end if;
  if payload ? 'budget_units' then
   if coalesce(payload->>'budget_units','')!~'^[0-9]{1,10}$' or side_value<>'buy' or tif<>'ioc' or payload ? 'quantity' then raise exception 'Invalid budget order' using errcode='PT400';end if;
   budget=(payload->>'budget_units')::bigint;
   if budget not between 100 and 9900000000 then raise exception 'Invalid budget' using errcode='PT400';end if;
   shares=least(1000000,budget/100);
  else shares=(payload->>'quantity')::bigint;end if;
  limit_price=(payload->>'price')::integer;
  if shares not between 1 and 1000000 or limit_price not between 1 and 99 then raise exception 'Invalid order' using errcode='PT400';end if;
  if (select count(*) from omni_private.exchange_orders where user_id=actor and state='open')>=100 then raise exception 'Open order limit' using errcode='PT429';end if;
  if (select count(*) from omni_private.exchange_orders where user_id=actor and created_at>statement_timestamp()-interval '1 minute')>=30 then raise exception 'Order rate limit' using errcode='PT429';end if;
  if (select count(*) from omni_private.exchange_orders where market_id=target and state='open')>=1000 then raise exception 'Market order capacity reached' using errcode='PT429';end if;
  insert into omni_private.exchange_positions(market_id,user_id,outcome) values(target,actor,outcome_value) on conflict do nothing;
  held=case when side_value='buy' then coalesce(budget,shares*limit_price*100) else 0 end;bought=0;
  if side_value='buy' then
   bought=least(held,omni_private.c2c_balance(actor,'purchased'));
   if held-bought>omni_private.c2c_balance(actor,'earned') then raise exception 'Insufficient points' using errcode='PT402';end if;
   j=omni_private.exchange_journal(actor,'prediction_hold',held,jsonb_build_object('market',target,'request',request));
   perform omni_private.wallet_entry(j,actor,'purchased',-bought);perform omni_private.wallet_entry(j,actor,'earned',-(held-bought));perform omni_private.wallet_entry(j,actor,'prediction_hold',held);
  else
   update omni_private.exchange_positions set reserved=reserved+shares where market_id=target and user_id=actor and outcome=outcome_value and quantity-reserved>=shares;
   if not found then raise exception 'Insufficient shares' using errcode='PT402';end if;
  end if;
  insert into omni_private.exchange_orders(market_id,user_id,side,outcome,price,quantity,remaining,purchased_hold,earned_hold,tif,post_only,budget_units) values(target,actor,side_value,outcome_value,limit_price,shares,shares,bought,held-bought,tif,coalesce((payload->>'post_only')::boolean,false),budget) returning id into order_key;
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

   fill=least(o.remaining,k.remaining);effective=case when o.side='buy' and k.side='buy' then 100-k.price else k.price end;
   if budget is not null then fill=least(fill,(o.purchased_hold+o.earned_hold)/(effective*100));exit when fill=0;end if;
   rounds=rounds+1;if rounds>100 then raise exception 'Order crosses too many levels; use smaller quantity' using errcode='PT429';end if;
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
  if budget is not null then update omni_private.exchange_orders set state=case when filled>0 then 'filled' else 'cancelled' end where id=order_key;end if;
  select jsonb_build_object('ok',true,'id',id,'filled',filled::text,'remaining',remaining::text,'state',state,'executed_units',executed_units::text,'budget_units',budget_units::text) into result_value from omni_private.exchange_orders where id=order_key;
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
create or replace function omni_private.exchange_order_json(target uuid) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('budget_units',o.budget_units::text,'executed_units',o.executed_units::text,'id',o.id,'sequence',o.sequence::text,'market_id',o.market_id,'title',m.title,'side',o.side,'outcome',o.outcome,'price',o.price,'tif',o.tif,'post_only',o.post_only,'quantity',o.quantity::text,'remaining',o.remaining::text,'filled',o.filled::text,'state',o.state,'created_at',o.created_at,'held',(o.purchased_hold+o.earned_hold)::text) from omni_private.exchange_orders o join omni_private.exchange_markets m on m.id=o.market_id where o.id=target;$$;
create or replace function omni_private.exchange_budget_quote(target uuid,outcome_value text,limit_price integer,budget bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();k record;fill bigint;remaining bigint:=1000000;side_value text:='buy';units bigint:=0;worst integer;rounds integer:=0;begin
 if target is null or side_value is null or side_value not in('buy','sell') or outcome_value is null or outcome_value not in('yes','no') or limit_price is null or limit_price not between 1 and 99 or budget is null or budget not between 100 and 9900000000 then raise exception 'Invalid quote' using errcode='PT400';end if;
 if not exists(select 1 from omni_private.exchange_markets where id=target and published_at is not null and state='open' and closes_at>now() and omni_private.exchange_official_ready(id)) then raise exception 'Market closed' using errcode='PT409';end if;
 for k in select e.remaining,case when side_value='buy' and e.side='buy' then 100-e.price else e.price end price from omni_private.exchange_orders e join public.omni_profiles u on u.id=e.user_id join omni_private.wallet_users w on w.user_id=e.user_id
 where e.market_id=target and e.state='open' and e.user_id is distinct from actor and not u.disabled and not w.frozen and
 ((side_value='buy' and ((e.side='sell' and e.outcome=outcome_value and e.price<=limit_price) or (e.side='buy' and e.outcome<>outcome_value and 100-e.price<=limit_price))) or (side_value='sell' and e.side='buy' and e.outcome=outcome_value and e.price>=limit_price))
 order by case when side_value='buy' then case when e.side='sell' then e.price else 100-e.price end else -e.price end,e.sequence limit 101 loop
  exit when remaining=0 or budget-units<k.price*100;rounds=rounds+1;exit when rounds>100;
  fill=least(remaining,k.remaining,(budget-units)/(k.price*100));units=units+fill*k.price*100;remaining=remaining-fill;worst=k.price;
 end loop;
 return jsonb_build_object('filled',(1000000-remaining)::text,'unspent',(budget-units)::text,'units',units::text,'worst',worst,'limited',rounds>100,'server_time',clock_timestamp());end;$$;
create function public.omni_exchange_budget_quote(target uuid,outcome_value text,limit_price integer,budget bigint) returns jsonb language sql security invoker set search_path='' as $$select omni_private.exchange_budget_quote(target,outcome_value,limit_price,budget);$$;
revoke all on function omni_private.exchange_budget_quote(uuid,text,integer,bigint),public.omni_exchange_budget_quote(uuid,text,integer,bigint) from public,anon,authenticated;
grant execute on function omni_private.exchange_budget_quote(uuid,text,integer,bigint),public.omni_exchange_budget_quote(uuid,text,integer,bigint) to anon,authenticated;
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
  where (is_owner or e.published_at is not null) and (view_kind<>'public' or market_id is not null or e.series_id is null) and (market_id is null or e.id=market_id)
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
  result_value=result_value||jsonb_build_object('open_orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id) v from omni_private.exchange_orders o where o.user_id=actor and o.state='open' and (market_id is null or o.market_id=market_id) order by o.sequence desc limit 100)q),'orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id) v from omni_private.exchange_orders o where o.user_id=actor and (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),
   'positions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from(select e.market_id,e.outcome,e.quantity::text,e.reserved::text,e.claimed::text,e.cost_units::text,e.realized_units::text from omni_private.exchange_positions e where e.user_id=actor and (market_id is null or e.market_id=market_id) and (market_id is not null or e.market_id in(select (value->>'id')::uuid from jsonb_array_elements(rows))) order by e.market_id,e.outcome limit 62)p),
   'shares',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select s.id,s.order_id,o.market_id,s.show_amount,s.active,s.created_at from omni_private.exchange_shares s join omni_private.exchange_orders o on o.id=s.order_id where s.user_id=actor and s.active and (market_id is null or o.market_id=market_id) and (before_share is null or (s.created_at,s.id)<(select x.created_at,x.id from omni_private.exchange_shares x where x.id=before_share and x.user_id=actor)) order by s.created_at desc,s.id desc limit 51)s),
   'balance',jsonb_build_object('purchased',omni_private.c2c_balance(actor,'purchased')::text,'earned',omni_private.c2c_balance(actor,'earned')::text,'held',omni_private.c2c_balance(actor,'prediction_hold')::text));
 end if;
 if is_owner then result_value=result_value||jsonb_build_object('admin_orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id)||jsonb_build_object('user_id',o.user_id,'handle',p.handle) v from omni_private.exchange_orders o join public.omni_profiles p on p.id=o.user_id where (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),'disputes',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select d.id,d.market_id,d.body,d.handled,d.created_at,p.handle from omni_private.exchange_disputes d join public.omni_profiles p on p.id=d.user_id where market_id is null or d.market_id=market_id order by d.handled,d.created_at desc limit 100)d),
 'totals',(select jsonb_build_object('markets',count(*),'open',count(*)filter(where state='open' and closes_at>now()),'resolving',count(*)filter(where state='resolving'),'collateral',coalesce(sum(collateral),0)::text,'volume',coalesce(sum(volume),0)::text) from omni_private.exchange_markets));end if;
 return result_value;
end;$$;
commit;
