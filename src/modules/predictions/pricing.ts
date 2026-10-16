import type {Market,Outcome,Snapshot} from './types';
export function orderLevels(book:Snapshot['book'],outcome:Outcome){
 const prices=new Map<string,bigint>();
 for(const r of book??[]){if(r.outcome!==outcome&&r.side==='sell')continue;const side=r.outcome===outcome?r.side:'sell',price=r.outcome===outcome?r.price:100-r.price,k=`${side}:${price}`;prices.set(k,(prices.get(k)??0n)+BigInt(r.quantity));}
 const rows=(side:string)=>[...prices].flatMap(([k,quantity])=>{const[s,p]=k.split(':');return s===side?[{price:Number(p),quantity}]:[];}).sort((a,b)=>side==='buy'?b.price-a.price:a.price-b.price);
 return{bids:rows('buy'),asks:rows('sell')};
}
export function referencePrice(m:Market):number|null {
 if(m.state==='resolved')return m.result==='void'?50:m.result==='yes'?100:0;
 const bid=m.best_yes_bid,ask=m.best_yes_ask;
 return bid!=null&&ask!=null&&ask>=bid&&ask-bid<=10?(ask+bid)/2:m.last_yes;
}
export type Quote={filled:string;unfilled:string;units:string;worst:number|null;limited:boolean;server_time:string};
export function validQuote(v:unknown):v is Quote{const q=v as Quote;return !!q&&['filled','unfilled','units'].every(k=>typeof q[k as keyof Quote]==='string'&&/^\d{1,19}$/.test(String(q[k as keyof Quote])))&&typeof q.limited==='boolean'&&(q.worst===null||Number.isInteger(q.worst)&&q.worst>=1&&q.worst<=99)&&Number.isFinite(Date.parse(q.server_time));}
