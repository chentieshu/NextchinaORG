'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {walletCopy} from './copy';
import {gatewayCopy} from './gateway-copy';
import {walletChanged} from './use-wallet';
export {DepositDialog} from './DepositDialog';

export {GatewaySetup} from './GatewaySetup';
export function VerifyPayout({withdrawal}:{withdrawal:string}){const{db,locale,online,notify}=useApp(),g=gatewayCopy[locale],c=walletCopy[locale],[tx,setTx]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function verify(e:React.FormEvent){e.preventDefault();if(pending.current||!db||!online||!/^[0-9a-f]{64}$/.test(tx.trim()))return;pending.current=true;setBusy(true);setError('');try{
  const{data,error}=await db.auth.getSession();if(error||!data.session)throw Error('auth');const r=await fetch('https://wallet.teamcn.org/v1/payout/verify',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({withdrawal,tx:tx.trim()}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('verify');if(mounted.current){walletChanged();notify(g.verified);}
 }catch{if(mounted.current)setError(g.verifyPending);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <form className="wallet-payout-form" onSubmit={verify}><label>{g.tx}<input value={tx} onChange={e=>setTx(e.target.value.toLowerCase())} required pattern="[0-9a-f]{64}" maxLength={64} autoComplete="off" spellCheck={false} disabled={busy}/></label><button className="button small" disabled={busy||!online}>{busy?c.loading:g.verify}</button>{error&&<p role="alert" className="inline-error">{error}</p>}</form>;
}
