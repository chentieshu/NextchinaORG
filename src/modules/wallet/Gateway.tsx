'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {walletCopy} from './copy';
import {gatewayCopy} from './gateway-copy';
import {walletChanged} from './use-wallet';
export {DepositDialog} from './DepositDialog';

type Setup={treasury:string;heartbeat:string|null;assigned:number;unmatched:number;enabled:boolean};
export function GatewaySetup(){
 const{db,locale,online}=useApp(),c=walletCopy[locale],g=gatewayCopy[locale],[data,setData]=useState<Setup|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const load=useCallback(async()=>{if(!db)return;try{const r=await db.rpc('omni_wallet_admin_setup').abortSignal(AbortSignal.timeout(10000));if(r.error)throw r.error;if(mounted.current){setData(r.data);setError('');}}catch{if(mounted.current){setError(c.error);setData(null);}}},[db,c.error]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!pending.current)void load();},30000);return()=>clearInterval(timer);},[load]);
 async function save(enable:boolean){if(!db||pending.current||!online||enable&&!confirm(g.confirmEnable))return;pending.current=true;setBusy(true);setError('');try{
  const r=await db.rpc('omni_wallet_admin_setup',{enable_payments:enable}).abortSignal(AbortSignal.timeout(15000));if(r.error)throw r.error;if(mounted.current){setData(r.data);walletChanged();}
 }catch(e){if(mounted.current)setError((e as {code?:string}).code==='PT401'?c.mfa:g.configError);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <section className="wallet-setup"><h3>{g.pool}</h3><p>{g.note}</p>{error&&<p role="alert" className="inline-error">{error}</p>}<button className="text-link" disabled={busy||!online} onClick={()=>void load()}>{g.refresh}</button>{data&&<><dl><div><dt>{g.assigned}</dt><dd>{data.assigned}</dd></div><div><dt>{g.unmatched}</dt><dd>{data.unmatched}</dd></div><div><dt>{g.heartbeat}</dt><dd>{data.heartbeat?new Date(data.heartbeat).toLocaleString(locale):g.never}</dd></div></dl><p>{g.treasury}<br/><code className="wallet-address">{data.treasury}</code></p><p>{g.keyHelp}</p><button className="button" disabled={busy||!online||!data.enabled&&(!data.heartbeat||Date.now()-Date.parse(data.heartbeat)>300000)} onClick={()=>void save(!data.enabled)}>{data.enabled?g.disable:g.enable}</button></>}</section>;
}
export function VerifyPayout({withdrawal}:{withdrawal:string}){const{db,locale,online,notify}=useApp(),g=gatewayCopy[locale],c=walletCopy[locale],[tx,setTx]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function verify(e:React.FormEvent){e.preventDefault();if(pending.current||!db||!online||!/^[0-9a-f]{64}$/.test(tx.trim()))return;pending.current=true;setBusy(true);setError('');try{
  const{data,error}=await db.auth.getSession();if(error||!data.session)throw Error('auth');const r=await fetch('https://wallet.chinateam.org/v1/payout/verify',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({withdrawal,tx:tx.trim()}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('verify');if(mounted.current){walletChanged();notify(g.verified);}
 }catch{if(mounted.current)setError(g.verifyPending);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <form className="wallet-payout-form" onSubmit={verify}><label>{g.tx}<input value={tx} onChange={e=>setTx(e.target.value.toLowerCase())} required pattern="[0-9a-f]{64}" maxLength={64} autoComplete="off" spellCheck={false} disabled={busy}/></label><button className="button small" disabled={busy||!online}>{busy?c.loading:g.verify}</button>{error&&<p role="alert" className="inline-error">{error}</p>}</form>;
}
