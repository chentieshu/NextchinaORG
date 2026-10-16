'use client';
import Link from 'next/link';
import {HelpDisclosure} from '@/components/HelpDisclosure';
import {WalletNav} from './WalletNav';
import dynamic from 'next/dynamic';
const LedgerTable=dynamic(()=>import('./LedgerTable').then(m=>m.LedgerTable));
import {exchangeCopy} from '../predictions/exchange-copy';
import {marketCopy} from './market-copy';
import {useEffect,useRef,useState} from 'react';
import {FiArrowDownLeft,FiArrowUpRight,FiRefreshCw} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {AccountGate} from '@/components/AccountGate';
import {Modal} from '@/components/Shell';
import {DepositDialog,VerifyPayout} from './Gateway';
import {depositCopy} from './deposit-copy';
import {gatewayCopy} from './gateway-copy';
import {walletCopy} from './copy';
import {useWallet,walletChanged} from './use-wallet';
import {useWalletRows} from './use-wallet-rows';
import {formatUsdtMicros,formatPoints,withdrawalFee,parsePoints,pointsToUsdt,isTronAddress,walletRequest,clearWalletRequest,type WalletSnapshot,type WalletEntry,type Withdrawal} from './money';
import './wallet.css';

export function WalletPage(){const{user,profile,authStatus,t,setAuthOpen,locale}=useApp();if(authStatus!=='ready')return <AccountGate/>;
 if(!user)return <main id="main" className="wallet-page page-wrap content-wrap"><h1>{walletCopy[locale].title}</h1><p>{walletCopy[locale].intro}</p><button className="button primary" onClick={()=>setAuthOpen(true)}>{t.login}</button></main>;
 if(!profile||profile.disabled)return <main id="main" className="empty-state">{t.disabled}</main>;return <Wallet key={user.id}/>;
}
function Wallet(){const{locale}=useApp(),c=walletCopy[locale],wallet=useWallet(),[withdraw,setWithdraw]=useState(false),[deposit,setDeposit]=useState(false),[tab,setTab]=useState<'history'|'requests'>('history');
 return <main id="main" className="wallet-page page-wrap content-wrap"><WalletNav active="balance"/><header className="wallet-heading"><div><h1>{c.title}</h1><p>{c.rate}</p></div><button className="icon-button" aria-label={c.retry} disabled={wallet.loading} onClick={()=>{void wallet.refresh();walletChanged();}}><FiRefreshCw/></button></header>
 {wallet.error&&<p className="inline-error" role="alert">{c.error}<button onClick={()=>void wallet.refresh()}>{c.retry}</button></p>}
 {!wallet.data?wallet.loading&&<p role="status">{c.loading}</p>:<><section className="wallet-balance" aria-label={c.available}><span>{c.available}</span><strong>{formatPoints(BigInt(wallet.data.purchased)+BigInt(wallet.data.earned),locale)}<small>{c.points}</small></strong><dl>{(['purchased','earned','held'] as const).map(k=><div key={k}><dt>{c[k]}</dt><dd>{formatPoints(wallet.data![k],locale)}</dd></div>)}<div><dt>{exchangeCopy[locale].held}</dt><dd>{formatPoints(wallet.data.prediction_held??'0',locale)}</dd></div></dl></section>
 <div className="wallet-actions"><button className="button" disabled={wallet.error||wallet.loading||wallet.data.frozen} onClick={()=>setDeposit(true)}><FiArrowDownLeft/>{c.deposit}</button><button className="button" disabled={wallet.error||wallet.loading||wallet.data.frozen||!wallet.data.withdrawals_enabled} onClick={()=>setWithdraw(true)}><FiArrowUpRight/>{c.withdraw}</button></div>
 {wallet.data.frozen?<p className="wallet-notice" role="status">{c.frozen}</p>:(!wallet.data.deposits_enabled||!wallet.data.withdrawals_enabled)&&<p className="wallet-notice" role="status">{c.paused}</p>}
 {!!wallet.data.deposit_remainder_micro&&<p className="form-note">{depositCopy[locale].dust}: {formatUsdtMicros(BigInt(wallet.data.deposit_remainder_micro))}</p>}</>}
 <nav className="wallet-tabs" aria-label={c.history}>{(['history','requests'] as const).map(k=><button key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{c[k]}</button>)}</nav>
 {tab==='history'?<History/>:<WithdrawalList/>}<HelpDisclosure><p>{c.withdrawalNote}</p><p>{gatewayCopy[locale].feeNote}</p><p>{c.historyNote}</p><a className="text-link" href="mailto:chentieshu520@gmail.com">{c.support}</a></HelpDisclosure>
 {deposit&&<DepositDialog onClose={()=>setDeposit(false)}/>}
 {withdraw&&wallet.data&&<WithdrawDialog snapshot={wallet.data} onClose={()=>setWithdraw(false)}/>}</main>;
}
function History(){const{locale}=useApp(),c=walletCopy[locale],list=useWalletRows<WalletEntry>('omni_wallet_history');
 return <section aria-label={c.history}>{list.error&&<p className="inline-error" role="alert">{c.error}<button onClick={()=>void list.load()}>{c.retry}</button></p>}
 {!list.loading&&!list.error&&!list.rows.length?<p className="wallet-empty">{c.empty}</p>:list.rows.length>0&&<LedgerTable rows={list.rows} loading={list.loading}/>}
 {list.loading&&<p role="status">{c.loading}</p>}{list.hasMore&&<button className="button" disabled={list.loading} onClick={()=>void list.load(true)}>{c.more}</button>}</section>;
}
export function WithdrawalList({admin=false}:{admin?:boolean}){const{locale,db,online}=useApp(),c=walletCopy[locale],list=useWalletRows<Withdrawal>('omni_wallet_requests',admin),[busy,setBusy]=useState(''),[error,setError]=useState('');const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function review(row:Withdrawal,action:'cancel'|'process'|'reject'){
  if(pending.current||!online||!db)return;if(action!=='cancel'&&!confirm(action==='process'?c.confirmProcess:c.confirmReject))return;pending.current=true;setBusy(row.id);setError('');
  try{const result=await db.rpc('omni_wallet_review',{withdrawal:row.id,action,expected:'pending'}).abortSignal(AbortSignal.timeout(15000));if(result.error)throw result.error;if(mounted.current)walletChanged();}
  catch(e){if(mounted.current)setError((e as {code?:string}).code==='PT401'?c.emailRequired:(e as {code?:string}).code==='PT409'?c.changed:c.unknown);}finally{pending.current=false;if(mounted.current)setBusy('');}
 }
 return <section aria-label={admin?c.queue:c.requests}>{(list.error||error)&&<p className="inline-error" role="alert">{error||c.error}<button onClick={()=>void list.load()}>{c.retry}</button></p>}{!list.error&&!list.loading&&!list.rows.length&&<p className="wallet-empty">{c.noRequests}</p>}
 <ul className="wallet-list wallet-withdrawals">{list.rows.map(row=><li key={row.id}><div><b>{admin?`${row.display_name} (@${row.handle}) · `:''}{formatPoints(row.units,locale)} {c.points}</b><span>{c[row.status]} · {pointsToUsdt(BigInt(row.units)-BigInt(row.fee_units))} USDT</span><code>{row.destination}</code><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(locale)}</time>{row.status==='processing'&&<small>{c.processingNote}</small>}{row.tx_hash&&<a href={`https://tronscan.org/#/transaction/${row.tx_hash}`} target="_blank" rel="noreferrer">{c.receipt}</a>}</div>{admin&&row.status==='processing'&&<VerifyPayout withdrawal={row.id}/>}
 {row.status==='pending'&&<div className="wallet-row-actions">{admin?<><button className="button small" disabled={!!busy||!online} onClick={()=>void review(row,'process')}>{c.approve}</button><button className="text-link" disabled={!!busy||!online} onClick={()=>void review(row,'reject')}>{c.reject}</button></>:<button className="text-link" disabled={!!busy||!online} onClick={()=>void review(row,'cancel')}>{c.cancel}</button>}</div>}</li>)}</ul>
 {list.loading&&<p role="status">{c.loading}</p>}{list.hasMore&&<button className="button" disabled={list.loading} onClick={()=>void list.load(true)}>{c.more}</button>}</section>;
}
function WithdrawDialog({snapshot,onClose}:{snapshot:WalletSnapshot;onClose:()=>void}){const{locale,db,user,online,notify}=useApp(),c=walletCopy[locale],[amount,setAmount]=useState(''),[address,setAddress]=useState(''),[review,setReview]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);const points=parsePoints(amount),fee=withdrawalFee(points??0n,snapshot.withdrawal_fee_bps),minimum=BigInt(snapshot.withdrawal_min_units);
 async function submit(e:React.FormEvent){e.preventDefault();if(!points||pending.current||!db||!user||!online)return;pending.current=true;setBusy(true);setError('');
  try{if(points<minimum||points<=fee){setError(`${c.minimum}: ${formatPoints(minimum,locale)} ${c.points}`);return;}if(!await isTronAddress(address.trim())){setError(c.invalidAddress);return;}if(!review){setReview(true);return;}
   const request=walletRequest(user.id,'withdraw',JSON.stringify([amount,address.trim()]));const result=await db.rpc('omni_wallet_withdraw_v2',{request,amount:points.toString(),address:address.trim()}).abortSignal(AbortSignal.timeout(15000));if(result.error)throw result.error;
   clearWalletRequest(user.id,'withdraw');if(!mounted.current)return;walletChanged();notify(c.requested);onClose();
  }catch(e){if(mounted.current){const code=(e as {code?:string}).code;setUncertain(!code);setError(code==='PT401'?c.emailRequired:code==='PT402'?c.insufficient:code==='PT503'?c.paused:code==='PT409'?c.changed:c.unknown);}}finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 return <Modal title={c.withdraw} onClose={onClose}><form className="wallet-form" onSubmit={submit}><h2>{review?c.review:c.withdraw}</h2><p className="form-note">{c.withdrawalNote}</p><label>{c.amount}<input inputMode="decimal" pattern="[0-9]+([.][0-9]{1,4})?" required value={amount} disabled={review||busy||uncertain} onChange={e=>setAmount(e.target.value)}/></label><label>{c.address}<input autoComplete="off" spellCheck={false} required value={address} maxLength={34} disabled={review||busy||uncertain} onChange={e=>setAddress(e.target.value)}/></label><dl className="wallet-quote"><div><dt>{c.fee}</dt><dd>{formatPoints(fee,locale)} {c.points} ({Number(snapshot.withdrawal_fee_bps)/100}%)</dd></div><div><dt>{c.receive}</dt><dd>{points&&points>fee?pointsToUsdt(points-fee):'—'} USDT</dd></div></dl>{error&&<p className="inline-error" role="alert">{error}</p>}<div className="wallet-actions">{review&&!uncertain&&<button type="button" className="button" disabled={busy} onClick={()=>setReview(false)}>{c.back}</button>}<button className="button primary" disabled={busy||!online||!points||!snapshot.withdrawals_enabled||snapshot.frozen}>{busy?c.loading:review?c.confirm:c.review}</button></div><a className="text-link" href="mailto:chentieshu520@gmail.com">{c.support}</a></form></Modal>;
}
