export type Candle={time:number;open:number;high:number;low:number;close:number;volume:string;trades:string};
export type History={rows:Candle[];has_more:boolean;next_before:string|null;step:number;server_time:string;from_time:string|null};
export type Period='1h'|'1d'|'1w'|'all';
export const HISTORY_LIMIT=6000;
export function validHistory(value:unknown):value is History {
 const x=value as History;
 const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 return !!x&&Array.isArray(x.rows)&&x.rows.length<=300&&typeof x.has_more==='boolean'&&date(x.server_time)&&(x.next_before===null||date(x.next_before))&&(x.from_time===null||date(x.from_time))&&[60,3600,86400].includes(x.step)&&x.rows.every((r,i)=>!!r&&Number.isSafeInteger(r.time)&&r.time>0&&(!i||r.time>x.rows[i-1].time)&&[r.open,r.high,r.low,r.close].every(v=>Number.isInteger(v)&&v>=1&&v<=99)&&r.low<=r.open&&r.low<=r.close&&r.high>=r.open&&r.high>=r.close&&typeof r.volume==='string'&&/^\d{1,19}$/.test(r.volume)&&typeof r.trades==='string'&&/^\d{1,19}$/.test(r.trades));
}
export function mergeCandles(old:Candle[],fresh:Candle[],from:number=0):Candle[]{
 const map=new Map(old.map(p=>[p.time,p]));for(const p of fresh)map.set(p.time,p);
 return [...map.values()].filter(p=>p.time>=from).sort((a,b)=>a.time-b.time).slice(-HISTORY_LIMIT);
}
export function chartUpdateKind(old:Candle[],next:Candle[]):'replace'|'update'|'none'{
 if(!old.length||!next.length||old[0].time!==next[0].time||next.length<old.length)return 'replace';
 for(let i=0;i<old.length-1;i++)if(JSON.stringify(old[i])!==JSON.stringify(next[i]))return 'replace';
 return old.length===next.length&&JSON.stringify(old.at(-1))===JSON.stringify(next.at(-1))?'none':'update';
}
