begin;
-- Public chart data is aggregated once at execution time, never from wallets.
create table omni_private.exchange_candles (
 market_id uuid not null references omni_private.exchange_markets(id),
 step integer not null check(step in (60,3600,86400)),
 bucket timestamptz not null,
 open integer not null check(open between 1 and 99),
 high integer not null check(high between 1 and 99),
 low integer not null check(low between 1 and 99),
 close integer not null check(close between 1 and 99),
 volume bigint not null check(volume>=0),
 trades bigint not null check(trades>0),
 first_at timestamptz not null,first_id uuid not null,last_at timestamptz not null,last_id uuid not null,
 primary key(market_id,step,bucket)
);
alter table omni_private.exchange_candles enable row level security;
revoke all on omni_private.exchange_candles from public,anon,authenticated;

create function omni_private.exchange_record_candle() returns trigger
language plpgsql set search_path='' as $$
declare units bigint;begin
 select new.quantity*case when a.side='buy' and b.side='buy' then 10000
   else (case when b.outcome='yes' then new.yes_price else 100-new.yes_price end)*100 end
 into units from omni_private.exchange_orders a,omni_private.exchange_orders b where a.id=new.maker_id and b.id=new.taker_id;
 insert into omni_private.exchange_candles as c(market_id,step,bucket,open,high,low,close,volume,trades,first_at,first_id,last_at,last_id)
 select new.market_id,s,date_bin(make_interval(secs=>s),new.created_at,'2000-01-01Z'),new.yes_price,new.yes_price,new.yes_price,new.yes_price,units,1,new.created_at,new.id,new.created_at,new.id
 from unnest(array[60,3600,86400]) s
 on conflict(market_id,step,bucket) do update set
 open=case when (excluded.first_at,excluded.first_id)<(c.first_at,c.first_id) then excluded.open else c.open end,
 close=case when (excluded.last_at,excluded.last_id)>(c.last_at,c.last_id) then excluded.close else c.close end,
 high=greatest(c.high,excluded.high),low=least(c.low,excluded.low),volume=c.volume+excluded.volume,trades=c.trades+1,
 first_at=least(c.first_at,excluded.first_at),first_id=case when (excluded.first_at,excluded.first_id)<(c.first_at,c.first_id) then excluded.first_id else c.first_id end,
 last_at=greatest(c.last_at,excluded.last_at),last_id=case when (excluded.last_at,excluded.last_id)>(c.last_at,c.last_id) then excluded.last_id else c.last_id end;
 return new;
end;$$;
revoke all on function omni_private.exchange_record_candle() from public,anon,authenticated;
create trigger exchange_trade_chart after insert on omni_private.exchange_trades for each row execute function omni_private.exchange_record_candle();
-- Backfill pre-existing executions in the same transaction as trigger installation.
insert into omni_private.exchange_candles
select t.market_id,s,date_bin(make_interval(secs=>s),t.created_at,'2000-01-01Z'),
 (array_agg(t.yes_price order by t.created_at,t.id))[1],max(t.yes_price),min(t.yes_price),(array_agg(t.yes_price order by t.created_at desc,t.id desc))[1],
 sum(t.quantity*case when a.side='buy' and b.side='buy' then 10000 else (case when b.outcome='yes' then t.yes_price else 100-t.yes_price end)*100 end),count(*),
 min(t.created_at),(array_agg(t.id order by t.created_at,t.id))[1],max(t.created_at),(array_agg(t.id order by t.created_at desc,t.id desc))[1]
from omni_private.exchange_trades t join omni_private.exchange_orders a on a.id=t.maker_id join omni_private.exchange_orders b on b.id=t.taker_id cross join unnest(array[60,3600,86400]) s
group by t.market_id,s,date_bin(make_interval(secs=>s),t.created_at,'2000-01-01Z');

create function omni_private.exchange_history(target uuid,period text default '1d',before_time timestamptz default null,since_time timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare seconds integer;lower_bound timestamptz;result jsonb;begin
 if not exists(select 1 from omni_private.exchange_markets where id=target and published_at is not null) then raise exception 'Market unavailable' using errcode='PT404';end if;
 if period is null or period not in('1h','1d','1w','all') or before_time>now()+interval '1 day' or since_time>now()+interval '1 day' or (before_time is not null and since_time is not null) then raise exception 'Invalid history range' using errcode='PT400';end if;
 seconds=case period when '1h' then 60 when '1d' then 60 when '1w' then 3600 else 86400 end;
 lower_bound=case period when '1h' then now()-interval '1 hour' when '1d' then now()-interval '1 day' when '1w' then now()-interval '7 days' else '-infinity'::timestamptz end;
 with recent as materialized (
  select * from omni_private.exchange_candles where market_id=target and step=seconds and bucket>=date_bin(make_interval(secs=>seconds),lower_bound,'2000-01-01Z')
   and (before_time is null or bucket<before_time) and (since_time is null or bucket>=since_time) order by bucket desc limit 301
 ), page as (select * from recent order by bucket desc limit 300)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('time',extract(epoch from bucket)::bigint,'open',open,'high',high,'low',low,'close',close,'volume',volume::text,'trades',trades::text) order by bucket) from page),'[]'::jsonb),
  'has_more',(select count(*)>300 from recent),'next_before',(select min(bucket) from page),'step',seconds,'server_time',now(),'from_time',case when period='all' then null else lower_bound end)
 into result;
 return result;
end;$$;
create function public.omni_exchange_history(target uuid,period text default '1d',before_time timestamptz default null,since_time timestamptz default null)
returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.exchange_history(target,period,before_time,since_time);$$;
revoke all on function omni_private.exchange_history(uuid,text,timestamptz,timestamptz),public.omni_exchange_history(uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.exchange_history(uuid,text,timestamptz,timestamptz),public.omni_exchange_history(uuid,text,timestamptz,timestamptz) to anon,authenticated;
create or replace function omni_private.exchange_read(view_kind text default 'public',market_id uuid default null,query text default '',category text default '',state_filter text default '',before_id uuid default null,sort_by text default 'new',before_order bigint default null,before_share uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 if actor is not null and (view_kind='portfolio' or (view_kind='public' and market_id is not null)) then
  result_value=result_value||jsonb_build_object('orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id) v from omni_private.exchange_orders o where o.user_id=actor and (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),
   'positions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from(select e.market_id,e.outcome,e.quantity::text,e.reserved::text,e.claimed::text from omni_private.exchange_positions e where e.user_id=actor and (market_id is null or e.market_id=market_id) order by e.market_id,e.outcome limit 1000)p),
   'shares',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from(select s.id,s.order_id,o.market_id,s.show_amount,s.active,s.created_at from omni_private.exchange_shares s join omni_private.exchange_orders o on o.id=s.order_id where s.user_id=actor and s.active and (market_id is null or o.market_id=market_id) and (before_share is null or (s.created_at,s.id)<(select x.created_at,x.id from omni_private.exchange_shares x where x.id=before_share and x.user_id=actor)) order by s.created_at desc,s.id desc limit 51)s),
   'balance',jsonb_build_object('purchased',omni_private.c2c_balance(actor,'purchased')::text,'earned',omni_private.c2c_balance(actor,'earned')::text,'held',omni_private.c2c_balance(actor,'prediction_hold')::text));
 end if;
 if is_owner then result_value=result_value||jsonb_build_object('admin_orders',(select coalesce(jsonb_agg(v),'[]') from(select omni_private.exchange_order_json(o.id)||jsonb_build_object('user_id',o.user_id,'handle',p.handle) v from omni_private.exchange_orders o join public.omni_profiles p on p.id=o.user_id where (market_id is null or o.market_id=market_id) and (before_order is null or o.sequence<before_order) order by o.sequence desc limit 51)q),'disputes',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from(select d.id,d.market_id,d.body,d.handled,d.created_at,p.handle from omni_private.exchange_disputes d join public.omni_profiles p on p.id=d.user_id where market_id is null or d.market_id=market_id order by d.handled,d.created_at desc limit 100)d),
 'totals',(select jsonb_build_object('markets',count(*),'open',count(*)filter(where state='open' and closes_at>now()),'resolving',count(*)filter(where state='resolving'),'collateral',coalesce(sum(collateral),0)::text,'volume',coalesce(sum(volume),0)::text) from omni_private.exchange_markets));end if;
 return result_value;
end;$$;

commit;
