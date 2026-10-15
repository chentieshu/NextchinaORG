'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {Modal} from '@/components/Shell';
import {walletCopy} from './copy';
import {gatewayCopy} from './gateway-copy';
import {walletChanged} from './use-wallet';
import {discoverTronLink,walletAccount,type TronProvider} from './tronlink';

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
type DepositState={treasury:string;enabled:boolean;healthy:boolean;payers:{address:string;verified_at:string}[]};
export function DepositDialog({onClose}:{onClose:()=>void}){
 const{db,locale,notify,online}=useApp(),c=walletCopy[locale],g=gatewayCopy[locale];
 const[data,setData]=useState<DepositState|null>(null),[address,setAddress]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const mounted=useRef(true),pending=useRef(false),epoch=useRef(0),provider=useRef<TronProvider|null>(null),unwatch=useRef<()=>void>(()=>{});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;unwatch.current();};},[]);
 const load=useCallback(async()=>{if(!db)return null;try{const r=await db.rpc('omni_wallet_deposit_status').abortSignal(AbortSignal.timeout(10000));if(r.error||!Array.isArray(r.data?.payers))throw Error('status');if(mounted.current){setData(r.data);setLoading(false);}return r.data as DepositState;}catch{if(mounted.current){setData(null);setLoading(false);setError(c.error);}return null;}},[db,c.error]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){void load();walletChanged();}},15000);return()=>clearInterval(timer);},[load]);
 async function connect(){
  if(!db||pending.current||!online)return;pending.current=true;setBusy(true);setError('');setAddress('');const attempt=++epoch.current;
  try{
   const p=await discoverTronLink();if(!mounted.current||epoch.current!==attempt)return;
   unwatch.current();provider.current=p;
   // The initial account permission can emit accountsChanged. Watch after it resolves.
   await p.request({method:'eth_requestAccounts'});
   if(!mounted.current||epoch.current!==attempt)return;
   const changed=()=>{epoch.current++;if(mounted.current){setAddress('');setError(g.changed);}};
   p.on?.('accountsChanged',changed);p.on?.('chainChanged',changed);
   unwatch.current=()=>{p.removeListener?.('accountsChanged',changed);p.removeListener?.('chainChanged',changed);};
   const selected=await walletAccount(p);const current=await load();if(!current)throw Error('status');
   if(!mounted.current||epoch.current!==attempt)return;
   if(!current.payers.some(v=>v.address===selected.address)){
    const challenge=await db.rpc('omni_wallet_deposit_challenge',{payer_address:selected.address}).abortSignal(AbortSignal.timeout(10000));
    if(challenge.error||!challenge.data?.id||challenge.data.address!==selected.address)throw Error('challenge');
    const fresh=await walletAccount(p,selected.address);if(!mounted.current||epoch.current!==attempt)return;
    const signature=await fresh.wallet.trx.signMessageV2(challenge.data.message);
    if(!mounted.current||epoch.current!==attempt)return;await walletAccount(p,selected.address);
    const session=await db.auth.getSession();if(!session.data.session)throw Error('auth');
    const r=await fetch('https://wallet.chinateam.org/v1/deposit/verify-address',{method:'POST',headers:{Authorization:`Bearer ${session.data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({challenge:challenge.data.id,signature}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('verify');const result=await load();if(!result?.payers.some(v=>v.address===selected.address))throw Error('verify');
   }
   await walletAccount(p,selected.address);if(mounted.current&&epoch.current===attempt){setAddress(selected.address);notify(g.linked);}
  }catch(e){if(mounted.current&&epoch.current===attempt){const message=typeof e==='string'?e:(e as Error).message,code=(e as {code?:number})?.code;
   setError(code===4001||/declined|denied|reject|cancel/i.test(message)?g.cancelled:message==='wallet_missing'?g.missing:message==='wallet_network'?g.networkError:message==='wallet_changed'?g.changed:g.bindError);
  }}finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 async function copy(){if(!provider.current||!data||!address)return;try{await walletAccount(provider.current,address);const latest=await load();if(!latest?.enabled||!latest.healthy||!latest.payers.some(v=>v.address===address))throw Error('paused');await navigator.clipboard.writeText(latest.treasury);notify(g.copied);}catch{setAddress('');setError(g.changed);}}
 const ready=!!address&&data?.payers.some(v=>v.address===address),open=ready&&data?.enabled&&data.healthy&&online;
 return <Modal title={c.deposit} onClose={onClose}><div className="wallet-form"><h2>{c.deposit}</h2><p>{g.network}</p><p>{g.signNote}</p>{loading&&<p role="status">{c.loading}</p>}{error&&<p className="inline-error" role="alert">{error}</p>}
 <button className="button primary" disabled={busy||!online||loading} onClick={()=>void connect()}>{busy?g.working:g.connect}</button>
 <button className="text-link" disabled={busy||!online} onClick={()=>{setError('');void load();}}>{g.refresh}</button>
 {ready&&<div><span>{g.connected}</span><code className="wallet-address">{address}</code></div>}
 {data&&(!data.enabled||!data.healthy)&&<p role="status" className="wallet-notice">{g.paused}</p>}
 {open&&<section className="wallet-deposit-target"><h3>{g.address}</h3><code className="wallet-address">{data.treasury}</code><button className="button" onClick={()=>void copy()}>{g.copy}</button><p>{g.sendNote}</p></section>}
 <p className="form-note">{c.rate}</p><a href="mailto:chentieshu520@gmail.com">{g.support}</a></div></Modal>;
}
export function VerifyPayout({withdrawal}:{withdrawal:string}){const{db,locale,online,notify}=useApp(),g=gatewayCopy[locale],c=walletCopy[locale],[tx,setTx]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function verify(e:React.FormEvent){e.preventDefault();if(pending.current||!db||!online||!/^[0-9a-f]{64}$/.test(tx.trim()))return;pending.current=true;setBusy(true);setError('');try{
  const{data,error}=await db.auth.getSession();if(error||!data.session)throw Error('auth');const r=await fetch('https://wallet.chinateam.org/v1/payout/verify',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({withdrawal,tx:tx.trim()}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('verify');if(mounted.current){walletChanged();notify(g.verified);}
 }catch{if(mounted.current)setError(g.verifyPending);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <form className="wallet-payout-form" onSubmit={verify}><label>{g.tx}<input value={tx} onChange={e=>setTx(e.target.value.toLowerCase())} required pattern="[0-9a-f]{64}" maxLength={64} autoComplete="off" spellCheck={false} disabled={busy}/></label><button className="button small" disabled={busy||!online}>{busy?c.loading:g.verify}</button>{error&&<p role="alert" className="inline-error">{error}</p>}</form>;
}
