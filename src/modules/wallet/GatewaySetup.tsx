'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {Modal} from '@/components/Shell';
import {gatewayCopy} from './gateway-copy';
import {gatewayStatusCopy} from './gateway-status-copy';
import {walletCopy} from './copy';
import {walletChanged} from './use-wallet';

type Setup={treasury:string;heartbeat:string|null;assigned:number;unmatched:number;enabled:boolean;healthy:boolean;configured:boolean;mfa_verified:boolean};
type Failure='mfaRequired'|'listenerUnavailable'|'accessDenied'|'uncertain';

export function GatewaySetup(){
 const {db,locale,online,t}=useApp(),g={...gatewayCopy[locale],...gatewayStatusCopy[locale]},c=walletCopy[locale];
 const [data,setData]=useState<Setup|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [readError,setReadError]=useState(false),[error,setError]=useState<Failure|null>(null),[message,setMessage]=useState('');
 const [confirming,setConfirming]=useState<boolean|null>(null);
 const mounted=useRef(true),pending=useRef(false),reading=useRef(false),generation=useRef(0);

 const read=useCallback(async()=>{
  if(!db)throw Error('unavailable');
  const r=await db.rpc('omni_wallet_admin_setup').abortSignal(AbortSignal.timeout(10000));
  if(r.error||!r.data)throw r.error??Error('empty');
  return r.data as Setup;
 },[db]);
 const refresh=useCallback(async()=>{
  if(pending.current||reading.current)return;
  const version=++generation.current;reading.current=true;setLoading(true);
  try{const next=await read();if(mounted.current&&version===generation.current){setData(next);setReadError(false);}}
  catch{if(mounted.current&&version===generation.current)setReadError(true);}
  finally{if(version===generation.current){reading.current=false;if(mounted.current)setLoading(false);}}
 },[read]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  const tick=()=>{if(document.visibilityState==='visible')void refresh();};
  const timer=setInterval(tick,30000);window.addEventListener('focus',tick);window.addEventListener('online',tick);
  return()=>{mounted.current=false;++generation.current;reading.current=false;clearInterval(timer);window.removeEventListener('focus',tick);window.removeEventListener('online',tick);};
 },[refresh]);

 async function save(enable:boolean){
  if(!db||pending.current||reading.current||!online)return;
  pending.current=true;setBusy(true);setError(null);setMessage('');
  const succeeded=(next:Setup)=>{if(mounted.current){setData(next);setReadError(false);setConfirming(null);setMessage(enable?g.opened:g.paused);walletChanged();}};
  try{
   const r=await db.rpc('omni_wallet_admin_setup',{enable_payments:enable}).abortSignal(AbortSignal.timeout(15000));
   if(r.error||!r.data)throw r.error??Error('empty');
   succeeded(r.data as Setup);
  }catch(e){
   const code=(e as {code?:string})?.code;
   // Reconcile a lost response without repeating a potentially committed write.
   if(!['PT401','PT403','PT503'].includes(code??'')){
    try{const next=await read();if(next.enabled===enable){succeeded(next);return;}if(mounted.current)setData(next);}catch{/* Preserve the last known state and report uncertainty. */}
   }
   if(mounted.current){
    setError(code==='PT401'?'mfaRequired':code==='PT503'?'listenerUnavailable':code==='PT403'?'accessDenied':'uncertain');
    if(code==='PT401')setData(old=>old?{...old,mfa_verified:false}:old);
    if(code==='PT503')setData(old=>old?{...old,healthy:false}:old);
   }
  }finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 const mfaRequired=!!data&&!data.mfa_verified;
 const guidance=<>
  {!online&&<p role="alert" className="inline-error">{g.offline}</p>}
  {mfaRequired&&<p className="wallet-notice">{g.mfaRequired}<br/><Link className="text-link" href={`/${locale}/settings/#authenticator`}>{g.openSecurity}</Link></p>}
  {data&&!data.healthy&&<p className="wallet-notice">{data.configured?g.listenerUnavailable:g.gatewayMissing}</p>}
 </>;
 const feedback=<>{readError&&<p role="alert" className="inline-error">{g.readError}</p>}{error&&<p role="alert" className="inline-error">{g[error]}</p>}</>;
 return <section className="wallet-setup wallet-gateway" aria-busy={loading||busy}>
  <h3>{g.pool}</h3><p>{g.note}</p>
  <button className="text-link" disabled={busy||loading||!online} onClick={()=>void refresh()}>{loading?g.checking:g.refresh}</button>
  {confirming===null&&<>{feedback}{guidance}</>}
  {message&&<p role="status" className="wallet-result">{message}</p>}
  {data&&<>
   <dl>
    <div><dt>{g.listener}</dt><dd>{readError?g.unknown:data.healthy?g.ready:g.notReady}</dd></div>
    <div><dt>{g.paymentState}</dt><dd>{readError?g.unknown:data.enabled?c.enabled:c.closed}</dd></div>
    <div><dt>{g.assigned}</dt><dd>{data.assigned}</dd></div>
    <div><dt>{g.unmatched}</dt><dd>{data.unmatched}</dd></div>
    <div><dt>{g.heartbeat}</dt><dd>{data.heartbeat?new Date(data.heartbeat).toLocaleString(locale):g.never}</dd></div>
   </dl>
   <p>{g.treasury}<br/><code className="wallet-address">{data.treasury}</code></p>
   <details className="wallet-config-help"><summary>{g.technicalHelp}</summary><p>{g.keyHelp}</p></details>
   <button className="button" disabled={busy||loading||!online||readError} onClick={()=>{setError(null);setMessage('');setConfirming(!data.enabled);}}>{data.enabled?g.disable:g.enable}</button>
  </>}
  {confirming!==null&&<Modal title={confirming?g.enable:g.disable} onClose={()=>{if(!pending.current)setConfirming(null);}}>
   <div className="wallet-form"><h2>{confirming?g.enable:g.disable}</h2><p>{confirming?g.confirmEnable:g.confirmPause}</p>
    {guidance}{feedback}
    <div className="wallet-actions">
     <button className="button primary" disabled={busy||loading||!online||readError||mfaRequired||confirming&&!data?.healthy} onClick={()=>void save(confirming)}>{busy?g.saving:g.confirm}</button>
     <button className="button" disabled={busy} onClick={()=>setConfirming(null)}>{t.close}</button>
    </div>
   </div>
  </Modal>}
 </section>;
}
