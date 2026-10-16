'use client';
import {useEffect,useState} from 'react';
import {useApp} from '@/components/Provider';
import {EmailVerification} from '@/components/EmailVerification';
import {formatPoints,parsePoints} from '../wallet/money';
import {useExchangeAction} from './use-exchange';
import {ExecutionEstimate,useQuote} from './ProductFeatures';
import {useServerNow} from './BtcDetail';
import {orderLevels,validQuote,type Quote} from './pricing';
import {tradeCopy} from './trade-copy';
import {exchangeCopy} from './exchange-copy';
import {btcCopy} from './btc-copy';
import {chartCopy} from './chart-copy';
import {officialCopy} from './official-copy';
import {productCopy} from './product-copy';
import type {Market,Outcome,Snapshot} from './types';
import './trade.css';

export type PriceSelection={outcome:Outcome;side:'buy'|'sell';price:number;nonce:number;quantity?:string};
type BudgetQuote=Omit<Quote,'unfilled'>&{unspent:string};
function useBudgetQuote(market:string,outcome:Outcome,price:number,budget:bigint|null,enabled:boolean){
 const{db,user,online}=useApp(),key=JSON.stringify([market,outcome,price,String(budget),user?.id]),[state,setState]=useState<{key:string;quote:BudgetQuote|null;error:boolean}|null>(null);
 useEffect(()=>{if(!db||!online||!enabled||budget===null)return;let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,flight:AbortController|null=null;
  const load=async()=>{if(disposed||flight||document.visibilityState!=='visible')return;flight=new AbortController();try{const r=await db.rpc('omni_exchange_budget_quote',{target:market,outcome_value:outcome,limit_price:price,budget:String(budget)}).abortSignal(AbortSignal.any([flight.signal,AbortSignal.timeout(8000)]));const q=r.data as BudgetQuote;if(r.error||!q||!validQuote({...q,unfilled:'0'})||!/^\d{1,19}$/.test(q.unspent)||BigInt(q.units)+BigInt(q.unspent)!==budget||BigInt(q.filled)>1000000n)throw Error();if(!disposed&&!flight.signal.aborted)setState({key,quote:q,error:false});}catch{if(!disposed&&!flight?.signal.aborted)setState({key,quote:null,error:true});}finally{flight=null;if(!disposed)timer=setTimeout(()=>void load(),10000);}};
  const visible=()=>{clearTimeout(timer);if(document.visibilityState==='visible')void load();else{flight?.abort();setState(null);}};
  timer=setTimeout(()=>void load(),350);document.addEventListener('visibilitychange',visible);return()=>{disposed=true;clearTimeout(timer);flight?.abort();document.removeEventListener('visibilitychange',visible);};
 },[db,online,key,market,outcome,price,budget,enabled]);
 return enabled&&online&&state?.key===key?state:{key,quote:null,error:false};
}
const inputPoints=(n:bigint)=>`${n/10000n}.${String(n%10000n).padStart(4,'0')}`;
export function TradeTicket({market:m,data,actions,selection,stale}:{market:Market;data:Snapshot;actions:ReturnType<typeof useExchangeAction>;selection:PriceSelection|null;stale:boolean}){
 const{locale,user,online,setAuthOpen,t}=useApp(),c=exchangeCopy[locale],tc=tradeCopy[locale],bc=btcCopy[locale],h=chartCopy[locale],pc=productCopy[locale],official=m.series_id==='btc-3m';
 const[side,setSide]=useState<'buy'|'sell'>('buy'),[outcome,setOutcome]=useState<Outcome>('yes'),[mode,setMode]=useState<'instant'|'limit'>('instant'),[amount,setAmount]=useState(''),[quantity,setQuantity]=useState(''),[price,setPrice]=useState(''),[postOnly,setPostOnly]=useState(false),[fok,setFok]=useState(false);
 const best=(v:Outcome,s=side)=>(s==='buy'?orderLevels(data.book,v).asks:orderLevels(data.book,v).bids)[0]?.price??null;
 useEffect(()=>{if(selection){setSide(selection.side);setOutcome(selection.outcome);setMode('limit');setPrice((selection.price/100).toFixed(2));if(selection.quantity)setQuantity(selection.quantity);}},[selection]);
 const budgetMode=side==='buy'&&mode==='instant',defaultPrice=mode==='instant'?(side==='buy'?Math.min(99,(best(outcome)??94)+5):Math.max(1,(best(outcome)??6)-5)):best(outcome)??50;
 const priceValue=price||((defaultPrice)/100).toFixed(2),cents=/^0\.[0-9]{1,2}$/.test(priceValue)?Number(priceValue.split('.')[1].padEnd(2,'0')):0,qty=/^[1-9][0-9]{0,6}$/.test(quantity)?Number(quantity):0;
 const budget=parsePoints(amount.replace(',','.')),available=BigInt(data.balance?.purchased??0)+BigInt(data.balance?.earned??0),position=data.positions?.find(p=>p.market_id===m.id&&p.outcome===outcome),stock=BigInt(position?.quantity??0)-BigInt(position?.reserved??0);
 const valid=cents>=1&&cents<=99&&(budgetMode?budget!==null&&budget>=100n&&budget<=9900000000n:qty>=1&&qty<=1000000),total=budgetMode?budget??0n:BigInt(qty*cents*100),canPay=side==='buy'?available>=total:stock>=BigInt(qty),now=useServerNow(data.server_time),closed=m.state!=='open'||Date.parse(m.closes_at)<=now||!!m.series_id&&(!m.source_ready||Date.parse(m.opens_at!)>now);
 const budgetState=useBudgetQuote(m.id,outcome,cents,budget,budgetMode&&valid&&!closed&&!stale&&!actions.busy),shareState=useQuote(m.id,side,outcome,cents,qty,data.server_time,!budgetMode&&valid&&!closed&&!stale&&!actions.busy),q=budgetMode?budgetState.quote:shareState.quote;
 const quoteBlocked=mode==='instant'&&(!q||q.limited||q.filled==='0'||!budgetMode&&fok&&(shareState.quote?.unfilled!=='0'))||mode==='limit'&&postOnly&&!!q&&q.filled!=='0';
 const label=(v:Outcome)=>official?bc[v==='yes'?'up':'down']:c[v],payout=q?BigInt(q.filled)*10000n:0n,max=side==='buy'?(budgetMode?(available<9900000000n?available:9900000000n):cents>0?available/BigInt(cents*100):0n):stock;
 function submit(){if(!user){setAuthOpen(true);return;}if(!valid||!canPay||closed||stale||!online||quoteBlocked||actions.busy)return;
  const payload={market:m.id,side,outcome,price:String(cents),...(budgetMode?{budget_units:String(budget)}:{quantity:String(qty)}),tif:mode==='limit'?'gtc':!budgetMode&&fok?'fok':'ioc',...(mode==='limit'&&postOnly?{post_only:true}:{})};
  const summary=[m.title,`${c[side]} · ${label(outcome)}`,`${budgetMode?tc.orderAmount:c.quantity}: ${budgetMode?formatPoints(total,locale)+' '+c.points:qty.toLocaleString(locale)}`,`${side==='buy'?tc.protection:bc.sellLimit}: ${cents/100}`,!budgetMode?`${side==='buy'?c.cost:c.proceeds}: ${formatPoints(total,locale)} ${c.points}`:'',q?`${tc.estimate}: ${q.filled}\n${side==='buy'?tc.spend:c.proceeds}: ${formatPoints(q.units,locale)} ${c.points}`:'',budgetMode?`${tc.payout}: ${formatPoints(payout,locale)} ${c.points}\n${tc.profit}: ${formatPoints(payout-BigInt(q?.units??0),locale)} ${c.points}\n${tc.budgetNote}`:mode==='limit'?c.limit:fok?pc.fok:c.ioc].filter(Boolean).join('\n');actions.stage('order',payload,summary);
 }
 return <section id="prediction-ticket" data-outcome={outcome} className="exchange-panel trade-ticket amount-ticket" aria-label={h.trade}>
  <div className="ticket-controls"><div className="exchange-tabs">{(['buy','sell'] as const).map(v=><button key={v} aria-pressed={side===v} disabled={actions.busy} onClick={()=>{setSide(v);setPrice('');}}>{c[v]}</button>)}</div><select aria-label={h.moreOptions} value={mode} disabled={actions.busy} onChange={e=>{setMode(e.target.value as typeof mode);setPrice('');setPostOnly(false);}}><option value="instant">{side==='buy'?tc.instant:pc.marketMode}</option><option value="limit">{tc.limit}</option></select></div>
  <div className="exchange-outcomes">{(['yes','no'] as const).map(v=><button type="button" key={v} className={`outcome-${v}`} aria-pressed={outcome===v} disabled={actions.busy||closed||stale} onClick={()=>{setOutcome(v);setPrice('');}}><b>{official?(v==='yes'?'↑ ':'↓ '):''}{label(v)}</b><small>{best(v)===null?bc.noQuote:`${(best(v)!/100).toLocaleString(locale)} ${c.points}`}</small></button>)}</div>
  <form onSubmit={e=>{e.preventDefault();submit();}}>
   <label className="amount-input">{budgetMode?tc.amount:c.quantity}<input aria-label={budgetMode?tc.amount:c.quantity} inputMode={budgetMode?'decimal':'numeric'} value={budgetMode?amount:quantity} placeholder="0" maxLength={14} disabled={actions.busy} onChange={e=>budgetMode?setAmount(e.target.value):setQuantity(e.target.value)}/></label>
   <div className="amount-quick" role="group" aria-label={bc.quick}>{[10,50,100].map(n=><button type="button" key={n} disabled={actions.busy||closed} onClick={()=>budgetMode?setAmount(String(n)):setQuantity(String(n))}>{n}</button>)}<button type="button" disabled={!user||actions.busy||max<=0n||stale} onClick={()=>budgetMode?setAmount(inputPoints(max)):setQuantity(String(max>1000000n?1000000n:max))}>{h.max}</button></div>
   <p className="ticket-available">{side==='buy'?c.available:h.availableShares} <b>{side==='buy'?formatPoints(available,locale):stock.toLocaleString(locale)}</b></p>
   {mode==='limit'&&<label>{c.price}<input value={priceValue} inputMode="decimal" disabled={actions.busy} onChange={e=>setPrice(e.target.value.replace(',','.'))}/></label>}
   {budgetMode?<div className="budget-estimate" aria-live="polite"><dl className="ticket-summary">{[[tc.estimate,q?BigInt(q.filled).toLocaleString(locale):'—'],[tc.spend,q?formatPoints(q.units,locale):'—'],[tc.payout,q?formatPoints(payout,locale):'—'],[tc.profit,q?formatPoints(payout-BigInt(q.units),locale):'—']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{budgetState.quote&&BigInt(budgetState.quote.unspent)>0n&&<small>{tc.unused}: {formatPoints(budgetState.quote.unspent,locale)}</small>}{valid&&!q&&<small>{budgetState.error?pc.quoteError:pc.quoteLoading}</small>}{q?.filled==='0'&&<p className="history-warning">{tc.noLiquidity}</p>}{q?.limited&&<p className="history-warning">{pc.liquidity}</p>}</div>:<><dl className="ticket-summary"><div><dt>{side==='buy'?c.cost:c.proceeds}</dt><dd>{formatPoints(total,locale)} {c.points}</dd></div></dl>{valid&&<ExecutionEstimate state={shareState}/>}</>}
   {user&&valid&&!canPay&&<p className="inline-error">{c.stock}</p>}{closed&&<p className="form-note">{m.series_id&&Date.parse(m.opens_at!)>now?officialCopy[locale].notStarted:m.series_id&&!m.opening_price?bc.pendingOpening:c.closedNote}</p>}{stale&&<p className="inline-error">{h.stale}</p>}
   <button type="submit" className="button primary trade-submit" disabled={actions.busy||!online||closed||stale||!!user&&(!valid||!canPay||quoteBlocked)}>{user?(official||budgetMode?`${side==='buy'?tc.review:bc.reviewSell} · ${label(outcome)}`:c.submit):t.login}</button>
   <details className="trade-options"><summary>{h.moreOptions}{mode==='instant'?` · ${side==='buy'?tc.protection:bc.sellLimit} ${priceValue}`:''}</summary>{mode==='instant'?<><label>{side==='buy'?tc.protection:bc.sellLimit}<input value={priceValue} inputMode="decimal" disabled={actions.busy} onChange={e=>setPrice(e.target.value.replace(',','.'))}/></label>{!budgetMode&&<label className="checkbox-label"><input type="checkbox" checked={fok} disabled={actions.busy} onChange={e=>setFok(e.target.checked)}/>{pc.fok}</label>}</>:<label className="checkbox-label"><input type="checkbox" checked={postOnly} disabled={actions.busy} onChange={e=>setPostOnly(e.target.checked)}/>{pc.postOnly}</label>}<p className="form-note">{budgetMode?tc.budgetNote:c.slippage}</p><p className="form-note">{tc.whole} {c.fee}</p>{official&&<p className="form-note">{bc.ties}</p>}</details>
  </form>{user&&<details className="trade-options"><summary>{c.email}</summary><EmailVerification/></details>}
 </section>;
}
