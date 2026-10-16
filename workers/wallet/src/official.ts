const SOURCE='https://data-api.binance.vision';
const STEP=180000;
type Rpc=<T>(name:string,body:unknown)=>Promise<T>;
type Task={id:string;start_ms:number;state:string};
type Plan={lease:string|null;tasks:Task[]};
export class SourceError extends Error{constructor(readonly code:'network'|'rate_limited'|'invalid_source'|'source_unavailable'|'clock_skew',readonly retry=60){super(code);}}
export function validCandle(value:unknown,expected?:number):value is (number|string)[]{
 if(!Array.isArray(value)||value.length!==12)return false;
 const [start,open,high,low,close,volume,end,,trades]=value;
 if(!Number.isSafeInteger(start)||start%STEP!==0||!Number.isSafeInteger(end)||end!==start+STEP-1||expected!==undefined&&start!==expected||!Number.isSafeInteger(trades)||trades<=0)return false;
 const price=(v:unknown)=>typeof v==='string'&&/^\d{1,12}(\.\d{1,8})?$/.test(v)&&Number(v)>0;
 if(![open,high,low,close,volume].every(price))return false;
 return Number(low)<=Math.min(Number(open),Number(close))&&Number(high)>=Math.max(Number(open),Number(close));
}
async function json(path:string){
 let r:Response;try{r=await fetch(SOURCE+path,{redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000),cache:'no-store'});}catch{throw new SourceError('network');}
 if(!r.ok){const retry=Number(r.headers.get('Retry-After'));await r.body?.cancel();throw new SourceError(r.status===429||r.status===418?'rate_limited':'source_unavailable',Number.isFinite(retry)&&retry>0?Math.min(86400,retry):60);}
 const reader=r.body?.getReader();if(!reader)throw new SourceError('invalid_source');let bytes=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>64000)throw new SourceError('invalid_source');text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode()) as unknown;}catch(e){throw e instanceof SourceError?e:new SourceError('invalid_source');}finally{await reader.cancel();}
}
export async function runOfficial(rpc:Rpc){
 const plan=await rpc<Plan>('omni_exchange_official_plan',{});if(!plan.lease)return;
 let failure:SourceError|null=null;
 try{
  // Finalize already verified rounds even during a later source outage.
  for(const task of plan.tasks.filter(t=>t.state==='resolving'))await rpc('omni_exchange_official_advance',{target:task.id,action:'finalize'});
  for(const task of plan.tasks.filter(t=>t.state!=='resolving'))await rpc('omni_exchange_official_advance',{target:task.id,action:'close'});
  const time=await json('/api/v3/time') as {serverTime?:number},server=time?.serverTime;
  if(!Number.isSafeInteger(server)||Math.abs(server!-Date.now())>90000)throw new SourceError('clock_skew');
  const current=Math.floor(server!/STEP)*STEP;
  const recent=await json('/api/v3/klines?symbol=BTCUSDT&interval=3m&timeZone=0&limit=3');
  if(!Array.isArray(recent)||recent.length<1||recent.length>3||!recent.every(c=>validCandle(c)))throw new SourceError('invalid_source');
  const live=recent.at(-1);if(!live||Number(live[0])<current-STEP||Number(live[0])>current)throw new SourceError('invalid_source');
  await rpc('omni_exchange_official_tick',{token:plan.lease,server_ms:server,candle:live});
  for(const task of plan.tasks.filter(t=>t.state!=='resolving')){
   if(server!<task.start_ms+STEP+10000)continue;
   let candle=recent.find(c=>c[0]===task.start_ms);
   if(!candle){const rows=await json(`/api/v3/klines?symbol=BTCUSDT&interval=3m&timeZone=0&startTime=${task.start_ms}&endTime=${task.start_ms+STEP-1}&limit=1`);if(!Array.isArray(rows)||rows.length!==1)throw new SourceError('invalid_source');candle=rows[0];}
   if(!validCandle(candle,task.start_ms))throw new SourceError('invalid_source');
   await rpc('omni_exchange_official_advance',{target:task.id,action:'observe',server_ms:server,candle});
  }
 }catch(e){failure=e instanceof SourceError?e:new SourceError('source_unavailable');console.error(JSON.stringify({event:'official_btc_retry',reason:failure.code}));}
 finally{await rpc('omni_exchange_official_finish',{token:plan.lease,error_code:failure?.code??null,retry_seconds:failure?.retry??60});}
}
