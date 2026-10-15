'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {FiBarChart2,FiCheckCircle} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {predictionReference,predictionUrl} from './reference';
import {exchangeCopy} from './exchange-copy';
import type {ReferenceCard as Card} from './types';
import './reference.css';
const cache=new Map<string,{expires:number;value:Promise<Card|null>}>();
export function PredictionCard({url,compact=false}:{url:string;compact?:boolean}){
 const{db,locale}=useApp(),c=exchangeCopy[locale],ref=useRef<HTMLDivElement>(null),[data,setData]=useState<{url:string;value:Card|null}|null>(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(false);const reference=predictionReference(url),key=reference?`${reference.kind}:${reference.id}`:'';
 useEffect(()=>{if(!db||!key)return;let active=true;setError(false);const request=predictionReference(url)!;
 function load(){let entry=cache.get(key);if(!entry||entry.expires<Date.now()||attempt){if(cache.size>200)cache.delete(cache.keys().next().value!);const value=(async()=>{const r=await db!.rpc('omni_exchange_card',{target:request.id,kind:request.kind}).abortSignal(AbortSignal.timeout(10000));if(r.error)throw r.error;return r.data as Card|null;})();entry={value,expires:Date.now()+30000};cache.set(key,entry);}void entry.value.then(value=>{if(active)setData({url,value});}).catch(()=>{cache.delete(key);if(active)setError(true);});}
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'200px'});if(ref.current)observer.observe(ref.current);else load();return()=>{active=false;observer.disconnect();};
 },[db,url,key,attempt]);
 const value=data?.url===url?data.value:undefined;
 return <div ref={ref} className={`prediction-reference ${compact?'prediction-reference-compact':''}`}>
 {error?<><span>{c.error}</span><button type="button" className="text-link" onClick={()=>setAttempt(n=>n+1)}>{c.retry}</button></>:value===undefined?<span role="status"><FiBarChart2/> {c.loading}</span>:value===null?<span>{c.unavailable}</span>:<>
 <div className="reference-kicker"><FiBarChart2/>{value.order?c.shared:c.title}</div>
 <Link className="reference-main" href={`/${locale}/predictions/?id=${value.market.id}`}><strong>{value.market.title}</strong><div className="reference-price">{value.market.result?c[value.market.result]:value.market.last_yes===null?'—':`${value.market.last_yes}%`}<small>{value.market.result?c[value.market.state]:c.last}</small></div></Link>
 {value.order&&<div className="reference-order"><span><FiCheckCircle/> {c.verified}</span>{value.trader&&<Link href={`/${locale}/profile/?id=${value.trader.id}`}>@{value.trader.handle}</Link>}<b>{c[value.order.side]} · {c[value.order.outcome]}</b><span>{c.orderLimit} {(value.order.price/100).toLocaleString(locale)} {c.points}</span><span>{value.order.filled?`${c.filledQuantity} ${Number(value.order.filled).toLocaleString(locale)}`:c.amountHidden}</span>{!compact&&<small>{c.snapshot} · {new Date(value.shared_at!).toLocaleString(locale)}</small>}</div>}
 {!value.order&&!compact&&<small>{c[value.market.state]} · {c.ends} {new Date(value.market.closes_at).toLocaleString(locale)}</small>}
 </>}
 </div>;
}
