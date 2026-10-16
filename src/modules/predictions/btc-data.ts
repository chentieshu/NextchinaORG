// Display-only one-second prices. Resolution continues to use verified 3m candles.
export const BTC_ROUND_MS=180000;
export type BtcPoint={time:number;price:string;open?:string;high?:string;low?:string};
export type BtcSnapshot={start:number;end:number;observed_at:number;last_at:number;complete:boolean;points:BtcPoint[]};
export function btcPrice(value:unknown):value is string{return typeof value==='string'&&/^\d{1,9}(\.\d{1,8})?$/.test(value)&&Number(value)>0;}
export function validBtcSnapshot(value:unknown,start:number):value is BtcSnapshot{
 const v=value as BtcSnapshot;if(!v||v.start!==start||v.end!==start+BTC_ROUND_MS||!Number.isSafeInteger(v.observed_at)||!Number.isSafeInteger(v.last_at)||v.observed_at<start||v.last_at>v.observed_at||typeof v.complete!=='boolean'||!Array.isArray(v.points)||!v.points.length||v.points.length>180)return false;
 let previous=start-1;for(const p of v.points){if(!Number.isSafeInteger(p.time)||p.time%1000!==0||p.time<start||p.time>=v.end||p.time<=previous||!btcPrice(p.price)||!validBtcOhlc(p))return false;previous=p.time;}
 return v.last_at>=previous&&v.last_at<=previous+999&&(!v.complete||v.last_at===v.end-1&&v.observed_at>=v.end);
}
export function validBtcStart(raw:string|null,now=Date.now()):number|null{
 if(!raw||!/^\d{13}$/.test(raw))return null;const start=Number(raw);
 return start%BTC_ROUND_MS===0&&start>=Date.UTC(2026,9,16)&&start<=Math.floor(now/BTC_ROUND_MS)*BTC_ROUND_MS?start:null;
}
export function btcSnapshot(rows:unknown,start:number,observed:number):BtcSnapshot{
 if(!Array.isArray(rows)||!rows.length||rows.length>180)throw Error('invalid_candles');
 const points:BtcPoint[]=[];let previous=start-1;
 for(const row of rows){if(!Array.isArray(row)||row.length<7||!Number.isSafeInteger(row[0])||row[0]%1000!==0||row[0]<start||row[0]>=start+BTC_ROUND_MS||row[0]<=previous||row[0]>observed||row[6]!==row[0]+999||![1,2,3,4].every(i=>btcPrice(row[i])))throw Error('invalid_candle');
  const [open,high,low,close]=[1,2,3,4].map(i=>Number(row[i]));if(low>high||open<low||open>high||close<low||close>high)throw Error('invalid_ohlc');points.push({time:row[0],price:row[4],open:row[1],high:row[2],low:row[3]});previous=row[0];
 }
 const end=start+BTC_ROUND_MS,last_at=Math.min(previous+999,observed);
 if(last_at<Math.min(observed,end-1)-10000)throw Error('stale_candles');
 return{start,end,observed_at:observed,last_at,complete:observed>=end&&last_at===end-1,points};
}

// Older cached line data remains readable; a candle requires all real OHLC fields.
export function validBtcOhlc(p:BtcPoint):boolean {
 if(p.open===undefined&&p.high===undefined&&p.low===undefined)return true;
 if(!btcPrice(p.open)||!btcPrice(p.high)||!btcPrice(p.low))return false;
 return Number(p.low)<=Math.min(Number(p.open),Number(p.price))&&Number(p.high)>=Math.max(Number(p.open),Number(p.price));
}
export function btcBars(points:BtcPoint[],step:1|5|15){
 const rows:{time:number;open:number;high:number;low:number;close:number}[]=[];
 for(const p of points){if(p.open===undefined||p.high===undefined||p.low===undefined)return [];const time=Math.floor(p.time/1000/step)*step,previous=rows.at(-1);
  if(previous?.time===time){previous.high=Math.max(previous.high,Number(p.high));previous.low=Math.min(previous.low,Number(p.low));previous.close=Number(p.price);}
  else rows.push({time,open:Number(p.open),high:Number(p.high),low:Number(p.low),close:Number(p.price)});
 }return rows;
}
