// Private service binding only. No wallet credentials, database access or public route.
// Placement applies to fetch handlers, not Cron handlers.
import {displayPrices} from './display';
export default {
 async fetch(request:Request,_env:unknown,ctx:ExecutionContext):Promise<Response>{
  const u=new URL(request.url),q=u.searchParams;
  if(u.origin==='https://prices.internal'&&u.pathname==='/v1/btc')return displayPrices(request,ctx);
  const allowed=request.method==='GET'&&['https://api-gcp.binance.com','https://data-api.binance.vision'].includes(u.origin)&&(
   u.pathname==='/api/v3/time'&&!u.search||
   u.pathname==='/api/v3/klines'&&q.get('symbol')==='BTCUSDT'&&q.get('interval')==='3m'&&q.get('timeZone')==='0'&&['1','3'].includes(q.get('limit')??'')&&
   [...q.keys()].every(k=>['symbol','interval','timeZone','limit','startTime','endTime'].includes(k)&&q.getAll(k).length===1)&&
   ['startTime','endTime'].every(k=>!q.has(k)||/^\d{13}$/.test(q.get(k)!)));
  if(!allowed)return new Response(null,{status:400});
  try{
   const r=await fetch(u.href,{headers:{Accept:'application/json'},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8000)});
   const reader=r.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
   if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64000)return new Response(null,{status:502});chunks.push(value);}}finally{await reader.cancel();}
   const body=new Uint8Array(size);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.length;}
   const headers=new Headers({'Cache-Control':'no-store','Content-Type':r.headers.get('Content-Type')??'application/json','X-Price-Placement':request.headers.get('cf-placement')??'unknown'});
   const retry=r.headers.get('Retry-After');if(retry&&/^\d{1,6}$/.test(retry))headers.set('Retry-After',retry);
   if(!r.ok)console.error(JSON.stringify({event:'price_source_http',http_status:r.status}));
   return new Response(body,{status:r.status,headers});
  }catch{return new Response(null,{status:503});}
 }
} satisfies ExportedHandler;
