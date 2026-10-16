begin;
-- Same Binance BTCUSDT candle dataset; documented GCP endpoint is reachable from Workers.
create or replace function omni_private.exchange_official_tick(token uuid,server_ms bigint,candle jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s omni_private.exchange_official_series;start_ms bigint;v bigint;round_id uuid;begin
 perform omni_private.wallet_gateway_auth();select * into s from omni_private.exchange_official_series where id='btc-3m' for update;
 if token is null or s.lease is null or token is distinct from s.lease or s.lease_until<clock_timestamp() then raise exception 'Lease expired' using errcode='PT409';end if;
 if server_ms is null or abs(server_ms-extract(epoch from clock_timestamp())*1000)>90000 or not coalesce(omni_private.exchange_candle_valid(candle),false) then raise exception 'Invalid source observation' using errcode='PT400';end if;
 start_ms=(server_ms/180000)*180000;
 if (candle->>0)::bigint not between start_ms-180000 and start_ms then raise exception 'Stale source observation' using errcode='PT409';end if;
 update omni_private.exchange_official_series set last_success=clock_timestamp(),last_error=null,retry_at=null where id=s.id;
 if s.enabled then
  for v in select start_ms+180000*i from generate_series(0,1)i loop
   insert into omni_private.exchange_markets(creator_id,title,rules,source_url,category,opens_at,closes_at,state,published_at,dispute_seconds,series_id)
   values(s.owner_id,'BTC 3m · '||to_char(to_timestamp(v/1000.0) at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC',
    'Teamcn official BTC/USDT spot three-minute market (rules v1). UTC interval ['||to_timestamp(v/1000.0)::text||', '||to_timestamp((v+180000)/1000.0)::text||'). Only the Binance BTCUSDT 3m UTC candlestick is used. YES = close >= open (ties count as up); NO = close < open. Decimal values are compared without display rounding. Trading is allowed only within this interval while the series and source are healthy. After expiry, two identical closed-candle observations at least 30 seconds apart and a five-minute public dispute window are required. Missing, changed or invalid data pauses resolution; no substitute source is used. If data cannot be verified for 24 hours, the administrator may propose VOID (0.5 points per share). Winning shares pay 1 point, losing shares 0. Claim settlement from the position. No liquidity or execution is guaranteed.',
    'https://api-gcp.binance.com/api/v3/klines?symbol=BTCUSDT&interval=3m&timeZone=0&startTime='||v||'&endTime='||(v+179999)||'&limit=1',
    'Crypto',to_timestamp(v/1000.0),to_timestamp((v+180000)/1000.0),'open',clock_timestamp(),300,s.id)
   on conflict(series_id,opens_at) do nothing returning id into round_id;
   if round_id is not null then insert into omni_private.exchange_events(market_id,event,note) values(round_id,'publish','Teamcn official · BTCUSDT 3m · rules v1');end if;
  end loop;
 end if;
 update omni_private.exchange_markets set opening_price=(candle->>1)::numeric where series_id=s.id and opens_at=to_timestamp((candle->>0)::bigint/1000.0) and opening_price is null;
 return jsonb_build_object('ok',true,'enabled',s.enabled);end;$$;
commit;
