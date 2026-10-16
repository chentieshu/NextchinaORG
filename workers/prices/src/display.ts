import {btcSnapshot,validBtcStart} from '../../../src/modules/predictions/btc-data';

export async function displayPrices(request:Request,ctx:ExecutionContext):Promise<Response>{
 const url=new URL(request.url),start=validBtcStart(url.searchParams.get('start'));
 if(request.method!=='GET'||start===null||[...url.searchParams.keys()].length!==1)return Response.json({error:'invalid_round'},{status:400});
 // Shared, bounded public snapshot; never cached with user headers or credentials.
 const key=new Request(`https://teamcn.org/__btc-price-cache/v2?start=${start}`),cache=caches.default,cached=await cache.match(key);
 if(cached)return cached;
 try{
  const source=`https://api-gcp.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1s&timeZone=0&limit=180&startTime=${start}&endTime=${start+179999}`;
  const response=await fetch(source,{headers:{Accept:'application/json'},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok){await response.body?.cancel();const seconds=Number(response.headers.get('Retry-After'));const failed=Response.json({error:'price_unavailable'},{status:503,headers:{'Cache-Control':`public, max-age=${Number.isFinite(seconds)&&seconds>0?Math.min(300,Math.max(10,seconds)):10}`,'Retry-After':'10'}});ctx.waitUntil(cache.put(key,failed.clone()));return failed;}
  const reader=response.body?.getReader();if(!reader)throw Error('empty');let size=0,text='';const decoder=new TextDecoder();
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>64000)throw Error('size');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
  const data=btcSnapshot(JSON.parse(text),start,Date.now());
  const result=Response.json(data,{headers:{'Cache-Control':`public, max-age=${data.complete?86400:5}`,'X-Content-Type-Options':'nosniff'}});
  ctx.waitUntil(cache.put(key,result.clone()));return result;
 }catch{return Response.json({error:'price_unavailable'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'10'}});}
}
