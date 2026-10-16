'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {useApp} from '@/components/Provider';
import {Modal} from '@/components/Shell';
import {walletCopy} from './copy';
import {gatewayCopy} from './gateway-copy';
import {c2cCopy} from './c2c-copy';
import {depositCopy} from './deposit-copy';
import {clearMatchedWalletRequest,clearWalletRequest,formatPoints,parseUsdt,formatUsdtMicros,walletRequest} from './money';
import {walletChanged} from './use-wallet';

type Order={points_per_usdt?:number;expected_units?:string;credited_units?:string;id:string;address:string;actual_micro:string;requested_micro:string;created_at:string;expires_at:string;status:'waiting'|'paid'|'expired';credited_micro:string;receipt_count:number};
type Status={enabled:boolean;healthy:boolean;server_time:string;order:Order|null};
export function DepositDialog({onClose,collateral=false}:{onClose:()=>void;collateral?:boolean}){
 const{db,user,locale,online,notify}=useApp(),c=walletCopy[locale],g=gatewayCopy[locale],d=depositCopy[locale];
 const[data,setData]=useState<Status|null>(null),[amount,setAmount]=useState(collateral?'1000':'10'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 const life=useRef<AbortController|null>(null),pending=useRef(false),sequence=useRef(0),clockOffset=useRef(0),lastReceipt=useRef('');
 useEffect(()=>{life.current=new AbortController();return()=>{life.current?.abort();sequence.current++;};},[]);
 const load=useCallback(async()=>{
  if(!db||!life.current||life.current.signal.aborted)return null;
  const current=++sequence.current;
  try{
   const result=await db.rpc(collateral?'omni_c2c_deposit_status':'omni_wallet_deposit_status').abortSignal(AbortSignal.any([life.current.signal,AbortSignal.timeout(10000)]));
   const value=result.data as Status;
   if(result.error||typeof value?.enabled!=='boolean'||typeof value?.healthy!=='boolean'||!Number.isFinite(Date.parse(value.server_time)))throw Error('status');
   if(life.current.signal.aborted||current!==sequence.current)return null;
   clockOffset.current=Date.parse(value.server_time)-Date.now();setNow(Date.now()+clockOffset.current);setData(value);setLoading(false);setError('');
   if(value.order&&user)clearMatchedWalletRequest(user.id,collateral?'collateral':'deposit',value.order.id);
   const receipt=value.order?`${value.order.id}:${value.order.credited_micro}`:'';
   if(receipt!==lastReceipt.current){lastReceipt.current=receipt;walletChanged();}
   return value;
  }catch{if(!life.current?.signal.aborted&&current===sequence.current){setData(null);setLoading(false);setError(d.unavailable);}return null;}
 },[db,user,d.unavailable,collateral]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!pending.current)void load();},15000);const clock=setInterval(()=>setNow(Date.now()+clockOffset.current),1000);return()=>{clearInterval(timer);clearInterval(clock);};},[load]);
 async function create(event:React.FormEvent){
  event.preventDefault();const units=parseUsdt(amount);
  if(!units){setError(d.invalid);return;}if(!db||!user||!online||pending.current||!data?.enabled||!data.healthy||!life.current)return;
  pending.current=true;sequence.current++;setBusy(true);setError('');
  try{
   const request=walletRequest(user.id,collateral?'collateral':'deposit',units.toString());
   const result=await db.rpc(collateral?'omni_c2c_create_deposit_v2':'omni_wallet_create_deposit_v2',{request,amount:units.toString()}).abortSignal(AbortSignal.any([life.current.signal,AbortSignal.timeout(15000)]));
   if(result.error)throw result.error;
   if(!result.data?.id)throw Error('order');
   clearWalletRequest(user.id,collateral?'collateral':'deposit');
   if(!life.current.signal.aborted){await load();}
  }catch(e){if(!life.current.signal.aborted){const status=await load();if(!life.current.signal.aborted&&status?.order?.status!=='waiting'){const code=(e as {code?:string}).code;setError(code==='PT429'?d.limited:code==='PT409'?d.conflict:code==='PT503'?d.paused:d.failed);}}}
  finally{pending.current=false;if(!life.current.signal.aborted)setBusy(false);}
 }
 const order=data?.order,remaining=order?Math.max(0,Math.ceil((Date.parse(order.expires_at)-now)/1000)):0;
 const waiting=order?.status==='waiting'&&remaining>0,available=online&&data?.enabled&&data.healthy;
 async function copy(kind:'address'|'amount'){
  if(!order||!waiting||!available)return;
  try{await navigator.clipboard.writeText(kind==='address'?order.address:formatUsdtMicros(order.actual_micro));notify(g.copied);}catch{setError(d.copyFailed);}
 }
 return <Modal title={collateral?c2cCopy(locale).deposit:c.deposit} onClose={onClose}><div className="wallet-form wallet-deposit"><h2>{collateral?c2cCopy(locale).deposit:c.deposit}</h2>{collateral&&<p>{c2cCopy(locale).minimum}</p>}<p>{g.network}</p>
 {loading&&<p role="status">{c.loading}</p>}{error&&<p role="alert" className="inline-error">{error}</p>}
 {data&&!available&&<p role="status" className="wallet-notice">{d.paused}</p>}
 {order&&<section className="wallet-order"><p className="wallet-order-state" role="status">{order.status==='paid'?d.paid:waiting?d.waiting:d.expired}</p>
 {order.status==='paid'&&<p>{collateral?c2cCopy(locale).collateral:d.received} <strong>{collateral?formatUsdtMicros(order.credited_micro):formatPoints(order.credited_units??order.credited_micro,locale)}</strong></p>}
 {waiting&&available&&<section className="wallet-deposit-target"><span>{d.exact}</span><strong className="wallet-exact" data-testid="deposit-amount">{formatUsdtMicros(order.actual_micro)} <small>USDT</small></strong><button className="text-link" onClick={()=>void copy('amount')}>{d.copyAmount}</button>
 <p className="wallet-notice">{d.precision}</p><div className="wallet-qr"><QRCodeSVG value={order.address} size={184} level="M" marginSize={4} title={d.qr}/></div><p className="form-note">{d.qrNote}</p><code className="wallet-address">{order.address}</code><button className="button" onClick={()=>void copy('address')}>{g.copy}</button>
 <dl className="wallet-quote"><div><dt>{collateral?c2cCopy(locale).collateral:d.receive}</dt><dd>{collateral?formatUsdtMicros(order.actual_micro):formatPoints(order.expected_units??order.actual_micro,locale)}</dd></div><div><dt>{d.remaining}</dt><dd>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</dd></div></dl><p>{d.extra}</p><p className="form-note">{d.rate}: 1 USDT = {order?.points_per_usdt??1} {c.points}</p><p>{d.confirmed}</p></section>}
 <small className="wallet-order-id">{d.id} {order.id}</small></section>}
 {data&&!waiting&&<form onSubmit={create}><p>{d.intro}</p><label>{d.amount}<input value={amount} inputMode="decimal" autoComplete="off" onChange={e=>setAmount(e.target.value)} disabled={busy||!available} aria-describedby="deposit-range" maxLength={8}/></label><small id="deposit-range">{d.range}</small><p>{d.extra}</p><button className="button primary" disabled={busy||!available||!parseUsdt(amount)}>{busy?d.creating:d.create}</button></form>}
 <button className="text-link" disabled={busy||!online} onClick={()=>{setError('');void load();}}>{g.refresh}</button><p className="form-note">{c.rate}</p><a href="mailto:chentieshu520@gmail.com">{g.support}</a></div></Modal>;
}
