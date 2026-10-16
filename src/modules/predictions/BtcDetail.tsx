'use client';
import {WALLET_ORIGIN} from '@/lib/site';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {FiArrowLeft,FiArrowDown,FiCheckCircle} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {liveCopy} from './live-copy';
import {btcCopy} from './btc-copy';
import {officialCopy} from './official-copy';
import {validBtcSnapshot,type BtcSnapshot} from './btc-data';
import type {Market} from './types';
import './btc.css';
const BtcChart=dynamic(()=>import('./BtcChart'),{ssr:false,loading:()=> <div className="btc-chart-placeholder" aria-busy="true"/>});
export function useServerNow(server:string){const[now,setNow]=useState(()=>Date.parse(server));useEffect(()=>{const base=Date.parse(server),received=performance.now(),tick=()=>setNow(base+performance.now()-received);tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[server]);return now;}
function useBtcPrices(start:number,server:string){
 const{online}=useApp(),[data,setData]=useState<BtcSnapshot|null>(null),[error,setError]=useState(false),[attempt,retry]=useState(0);
 const anchor=useRef({server:Date.parse(server),local:performance.now()});
 useEffect(()=>{anchor.current={server:Date.parse(server),local:performance.now()};},[server]);
 useEffect(()=>{if(!online||!Number.isFinite(start))return;let disposed=false,done=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined,flight:AbortController|null=null;
  const now=()=>anchor.current.server+performance.now()-anchor.current.local;
  const schedule=(delay:number)=>{clearTimeout(timer);if(!disposed&&!done)timer=setTimeout(()=>void load(),delay);};
  const load=async()=>{if(disposed||done||busy||document.visibilityState!=='visible')return;if(now()<start){schedule(Math.min(5000,start-now()+100));return;}busy=true;flight=new AbortController();let delay=5000;
   try{const r=await fetch(`${WALLET_ORIGIN}/v1/markets/btc?start=${start}`,{credentials:'omit',cache:'no-store',signal:AbortSignal.any([flight.signal,AbortSignal.timeout(10000)])});if(!r.ok)throw Error();const value:unknown=await r.json();if(!validBtcSnapshot(value,start)||value.observed_at>now()+10000||value.last_at<Math.min(now(),start+179999)-20000)throw Error();if(!disposed&&!flight.signal.aborted){setData(value);setError(false);done=value.complete;}}
   catch{if(!disposed&&!flight?.signal.aborted){setError(true);delay=10000;}}finally{busy=false;flight=null;if(document.visibilityState==='visible')schedule(delay);}
  };
  const visibility=()=>{clearTimeout(timer);if(document.visibilityState==='visible')void load();else flight?.abort();};
  void load();document.addEventListener('visibilitychange',visibility);return()=>{disposed=true;flight?.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 },[start,online,attempt]);return{data,error:!online||error,retry:()=>retry(n=>n+1)};
}
export function BtcDetail({market:m,server,compact=false}:{market:Market;server:string;compact?:boolean}){
 const{locale}=useApp(),c=btcCopy[locale],o=officialCopy[locale],start=Date.parse(m.opens_at!),end=Date.parse(m.closes_at),now=useServerNow(server),state=useBtcPrices(start,server),d=state.data;
 const future=now<start,ended=now>=end,seconds=Math.max(0,Math.ceil(((future?start:end)-now)/1000)),verified=!!m.oracle?.confirmed_at&&!m.oracle.conflict;
 const price=ended&&verified?m.oracle!.close:d?.points.at(-1)?.price??null,opening=m.opening_price?Number(m.opening_price):null,delta=price&&opening!==null?Number(price)-opening:null,stale=state.error||!!d&&!d.complete&&now<end&&now-d.last_at>20000;
 const format=(value:string|number)=>Number(value).toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2});
 return <section id="btc-prices" className="exchange-panel market-chart-panel btc-detail" aria-label={c.chart}>
  <div className="btc-round-head"><span className="official-kicker"><FiCheckCircle/>{o.official}</span><span className={`btc-timer ${!future&&!ended&&seconds<=30?'btc-timer-ending':''}`}><small>{future?c.begins:ended?c.ended:c.remaining}</small><b aria-live="off">{ended?'0:00':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</b></span></div>
  <div className="btc-price-grid"><div className="btc-current"><span>{ended?(verified?c.closed:c.last):c.current}</span><strong data-testid="btc-current">{price?format(price):'—'} <small>USDT</small></strong>{delta!==null&&<small className={delta>=0?'outcome-text-yes':'outcome-text-no'}>{delta>=0?'+':''}{format(delta)} ({delta>=0?'+':''}{(delta/opening!*100).toLocaleString(locale,{maximumFractionDigits:3})}%) <span>{c.difference}</span></small>}</div><div className="btc-opening"><span>{c.beat}</span><b data-testid="btc-opening">{opening===null?'—':format(opening)} <small>USDT</small></b></div></div>
  {d?<BtcChart points={d.points} start={start} opening={opening}/>:<div className="btc-chart-placeholder" role="status">{future?c.empty:state.error?c.error:c.loading}</div>}
  <div className="btc-feed-state"><span className={stale?'history-warning':'form-note'}>{stale?c.delayed:d?<>{c.asof} <time dateTime={new Date(d.last_at).toISOString()}>{new Date(d.last_at).toLocaleTimeString(locale)}</time></>:!future?c.waiting:c.reference}</span>{stale&&<button className="text-link" onClick={state.retry}>{c.retry}</button>}</div>
  {compact?<details className="terminal-price-details"><summary>{liveCopy[locale].details}</summary><p className="form-note">{o.source} · {c.note}</p></details>:<p className="form-note btc-source">{o.source} · {c.note}</p>}
  {!compact&&<nav className="btc-round-nav" aria-label={c.all}><Link href={`/${locale}/predictions/?series=btc-3m`}><FiArrowLeft/>{c.all}</Link><button type="button" className="text-link" onClick={()=>document.getElementById('prediction-ticket')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}>{c.orderTitle}<FiArrowDown/></button></nav>}
 </section>;
}
