'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useApp} from '@/components/Provider';
import {Modal} from '@/components/Shell';
import {EmailVerification} from '@/components/EmailVerification';
import {walletRequest,clearWalletRequest} from '../wallet/money';
import {walletChanged} from '../wallet/use-wallet';
import {exchangeCopy} from './exchange-copy';
import {productCopy} from './product-copy';
import {chartCopy} from './chart-copy';
import {predictionUrl} from './reference';
import type {Snapshot} from './types';
export function useExchange(params:Record<string,unknown>,enabled=true){
 const{db,user,online}=useApp(),key=JSON.stringify(params),scope=`${user?.id??''}:${JSON.stringify({...params,before_order:null,before_share:null})}`;
 const[state,setState]=useState<{scope:string;data:Snapshot}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);const run=useRef(0),abort=useRef<AbortController|null>(null),connected=useRef(online),queued=useRef(false);connected.current=online;
 const load=useCallback(async()=>{if(!db||!enabled||!connected.current||abort.current)return;const n=++run.current;const controller=new AbortController();abort.current=controller;setLoading(true);setError(false);
 try{const r=await db.rpc('omni_exchange_read',JSON.parse(key)).abortSignal(AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]));if(n!==run.current)return;if(r.error||!Array.isArray(r.data?.rows))throw Error();setState({scope,data:r.data});}catch{if(n===run.current&&!controller.signal.aborted)setError(true);}finally{if(n===run.current){abort.current=null;setLoading(false);if(queued.current){queued.current=false;void load();}}}
 },[db,scope,key,enabled]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load();},changed=()=>{if(abort.current)queued.current=true;else refresh();};const timer=setInterval(refresh,30000);window.addEventListener('wallet:changed',changed);document.addEventListener('visibilitychange',refresh);return()=>{++run.current;abort.current?.abort();abort.current=null;queued.current=false;clearInterval(timer);window.removeEventListener('wallet:changed',changed);document.removeEventListener('visibilitychange',refresh);};},[load]);
 useEffect(()=>{if(online&&document.visibilityState==='visible')void load();},[online,load]);
 return{data:state?.scope===scope?state.data:null,loading,error,load};
}
type Intent={action:string;payload:Record<string,unknown>;summary:string;admin:boolean};
function validIntent(v:unknown):v is Intent{const i=v as Intent;return !!i&&typeof i.action==='string'&&['order','cancel','claim','share','unshare','dispute','official_config','edit','create','publish','pause','resume','result','finalize','review_disputes','cancel_order'].includes(i.action)&&!!i.payload&&typeof i.payload==='object'&&typeof i.summary==='string'&&typeof i.admin==='boolean';}
export function useExchangeAction(onDone?:()=>void,onShare?:(url:string)=>void){
 const{db,user,locale,online,notify}=useApp(),c=exchangeCopy[locale],[intent,setIntent]=useState<Intent|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[shared,setShared]=useState<string|null>(null);const pending=useRef(false),actor=useRef(user?.id),done=useRef(onDone);actor.current=user?.id;done.current=onDone;
 useEffect(()=>{setIntent(null);setError('');setUncertain(false);setShared(null);setBusy(false);if(!user)return;try{const value=JSON.parse(sessionStorage.getItem(`chinateam-wallet-request:${user.id}:exchange`)??'null'),old=JSON.parse(value?.payload??'null');if(validIntent(old)){setIntent(old);setUncertain(true);}}catch{}},[user?.id]);
 function stage(action:string,payload:Record<string,unknown>,summary:string,admin=false){if(pending.current||intent||!online)return;setError('');setUncertain(false);setIntent({action,payload,summary,admin});}
 async function commit(){if(!db||!user||!intent||pending.current||!online)return;const id=user.id,current=intent;pending.current=true;setBusy(true);setError('');
 try{const request=walletRequest(id,'exchange',JSON.stringify(current)),r=await db.rpc(current.admin?'omni_exchange_admin':'omni_exchange_action',{request,action:current.action,payload:current.payload}).abortSignal(AbortSignal.timeout(20000));if(actor.current!==id)return;if(r.error)throw r.error;if(r.data?.ok!==true)throw Error();clearWalletRequest(id,'exchange');setIntent(null);setUncertain(false);if(current.action==='share'){const url=predictionUrl(locale,{kind:'order',id:r.data.id});if(onShare)onShare(url);else setShared(url);}walletChanged();done.current?.();notify(current.action==='order'&&r.data.filled!=null?`${c.filled}: ${r.data.filled} · ${r.data.state==='cancelled'?c.cancelled:c.remaining}: ${r.data.remaining}`:c.saved);
 }catch(e){if(actor.current!==id)return;const code=(e as {code?:string}).code??'',known=/^(PT[0-9]{3}|[0-9A-Z]{5}|PGRST[0-9]+)$/.test(code);setUncertain(!known);if(known)clearWalletRequest(id,'exchange');setError(code==='PT401'?c.email:code==='PT402'?c.stock:code==='PT409'?c.conflict:code==='PT412'?productCopy[locale].executionError:code==='PT429'?chartCopy[locale].rate:c.error);
 }finally{pending.current=false;if(actor.current===id)setBusy(false);}}
 const close=()=>{if(!pending.current&&!uncertain){setIntent(null);setError('');}};
 const dialog=intent?<Modal title={c.review} onClose={close}><div className="exchange-review"><h2>{c.review}</h2><p className="exchange-preline">{intent.summary}</p>{intent.action==='order'&&<p className="form-note">{c.fee}</p>}{error&&<p role="alert" className="inline-error">{error}</p>}{error===c.email&&<EmailVerification/>}{uncertain&&<p role="status">{c.uncertain}</p>}<div className="wallet-actions"><button className="button primary" disabled={busy||!online} onClick={()=>void commit()}>{busy?c.loading:uncertain?c.retry:c.confirm}</button><button className="button" disabled={busy||uncertain} onClick={close}>{c.cancel}</button></div></div></Modal>:shared?<Modal title={c.shared} onClose={()=>setShared(null)}><h2>{c.shared}</h2><ShareLinks url={shared}/></Modal>:null;
 return{stage,dialog,busy:busy||!!intent};
}
export function ShareLinks({url}:{url:string}){const{locale,profile,notify}=useApp(),c=exchangeCopy[locale];return <div className="exchange-share-links"><input aria-label={c.copy} readOnly value={url} onFocus={e=>e.target.select()}/><button type="button" className="button" onClick={()=>{void navigator.clipboard.writeText(url).then(()=>notify(c.copied)).catch(()=>notify(c.error));}}>{c.copy}</button><Link className="button" href={`/${locale}/write/?prediction=${encodeURIComponent(url)}`}>{c.write}</Link>{profile&&profile.role!=='member'&&<Link className="button" href={`/${locale}/write/?kind=news&prediction=${encodeURIComponent(url)}`}>{c.writeArticle}</Link>}</div>;}
