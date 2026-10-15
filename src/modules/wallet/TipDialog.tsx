'use client';
import Link from 'next/link';
import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {Modal} from '@/components/Shell';
import {Avatar} from '@/components/Avatar';
import type {Article} from '@/lib/types';
import {walletCopy} from './copy';
import {useWallet,walletChanged} from './use-wallet';
import {formatPoints,parsePoints,walletRequest,clearWalletRequest} from './money';
import './wallet.css';
export default function TipDialog({article,onClose}:{article:Article;onClose:()=>void}){const{user,db,locale,online,notify}=useApp(),c=walletCopy[locale],wallet=useWallet(),[amount,setAmount]=useState('10'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);const points=parsePoints(amount),available=wallet.data?BigInt(wallet.data.purchased)+BigInt(wallet.data.earned):0n;
 async function submit(e:React.FormEvent){e.preventDefault();if(!user||!db||!points||pending.current||!online||!wallet.data?.tipping_enabled||wallet.data.frozen||wallet.error)return;pending.current=true;setBusy(true);setError('');
  try{const request=walletRequest(user.id,'tip',JSON.stringify([article.id,amount]));const result=await db.rpc('omni_wallet_tip',{request,article:article.id,amount:points.toString()}).abortSignal(AbortSignal.timeout(15000));if(result.error)throw result.error;clearWalletRequest(user.id,'tip');if(mounted.current){walletChanged();notify(c.success);onClose();}}
  catch(e){if(mounted.current){const code=(e as {code?:string}).code;setUncertain(!code);setError(code==='PT402'?c.insufficient:code==='PT503'?c.paused:code==='PT409'?c.changed:c.unknown);}}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 return createPortal(<Modal title={c.tip} onClose={onClose}><form className="wallet-form" onSubmit={submit}><h2>{c.tip}</h2><div className="wallet-recipient"><Avatar name={article.author_name??''} avatarKey={article.author_avatar_key} size={44}/><div><small>{c.to}</small><b>{article.author_name}</b><span>@{article.author_handle}</span></div></div><label>{c.amount}<input inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,4})?" value={amount} disabled={busy||uncertain} onChange={e=>setAmount(e.target.value)}/></label><div className="wallet-presets">{['10','50','100'].map(n=><button type="button" className="button small" disabled={busy||uncertain} aria-pressed={amount===n} key={n} onClick={()=>setAmount(n)}>{n}</button>)}</div><p className="form-note">{c.tipNote}</p>{wallet.loading&&<p role="status">{c.loading}</p>}{wallet.error&&<p className="inline-error" role="alert">{c.error}<button type="button" onClick={()=>void wallet.refresh()}>{c.retry}</button></p>}{wallet.data&&<><p>{c.available}: {formatPoints(available,locale)} {c.points}</p>{(!wallet.data.tipping_enabled||wallet.data.frozen)&&<p className="wallet-notice">{wallet.data.frozen?c.frozen:c.paused}</p>}</>}{error&&<p className="inline-error" role="alert">{error}</p>}<button className="button primary" disabled={busy||wallet.loading||wallet.error||!points||!online||!wallet.data?.tipping_enabled||wallet.data.frozen}>{busy?c.loading:c.confirm}</button><Link href={`/${locale}/wallet/`} className="text-link" onClick={onClose}>{c.title}</Link></form></Modal>,document.body);
}
