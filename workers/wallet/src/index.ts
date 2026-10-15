import {confirmedTransfers,USDT_CONTRACT,type Transfer} from './tron';
import {Trx} from 'tronweb';
const TRON_ORIGIN='https://api.trongrid.io';
type Target={address:string;hex:string;assigned_ms:number;fingerprint:string|null;lease_token:string};
type History={success?:boolean;data?:{transaction_id:string;to:string;block_timestamp:number}[];meta?:{fingerprint?:string}};
type Payout={id:string;to:string;from:string;amount:string;created_ms:number};

async function limitedJson(input:Request|Response,limit=2000000):Promise<unknown>{
 const reader=input.body?.getReader();if(!reader)throw Error('empty_response');const decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('response_too_large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel();}
}
async function rpc<T>(env:Env,name:string,body:unknown,authorization?:string):Promise<T>{
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{'x-wallet-gateway-key':env.WALLET_GATEWAY_KEY})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();throw Error(authorization?'authorization_or_request_failed':'ledger_unavailable');}
 // PostgREST returns 204 for SQL functions declared RETURNS void.
 if(response.status===204)return null as T;
 return await limitedJson(response) as T;
}
async function tron(env:Env,path:string,body?:unknown){
 const response=await fetch(TRON_ORIGIN+path,{method:body?'POST':'GET',redirect:'error',headers:{'TRON-PRO-API-KEY':env.TRONGRID_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();throw Error('chain_unavailable');}return limitedJson(response);
}
async function receipt(env:Env,tx:string){return confirmedTransfers(await tron(env,'/walletsolidity/gettransactioninfobyid',{value:tx}),tx);}
export async function scan(env:Env){
 if(!env.WALLET_GATEWAY_KEY||!env.TRONGRID_API_KEY)return{status:'setup_required'};
 // A successful solidified-node probe precedes the heartbeat used by the enable gate.
 const head=await tron(env,'/walletsolidity/getnowblock',{}) as {blockID?:string};if(!head.blockID||!/^[a-f0-9]{64}$/i.test(head.blockID))throw Error('chain_unavailable');
 const targets=await rpc<Target[]>(env,'omni_wallet_scan_targets',{});let budget=8,credited=0,failures=0;
 for(const target of targets){
  try{
   const query=new URLSearchParams({only_confirmed:'true',limit:'20',contract_address:USDT_CONTRACT,min_timestamp:String(target.assigned_ms)});if(target.fingerprint)query.set('fingerprint',target.fingerprint);
   const history=await tron(env,`/v1/accounts/${encodeURIComponent(target.address)}/transactions/trc20?${query}`) as History;
   if(history.success!==true||!Array.isArray(history.data)||history.data.length>20)throw Error('index_unavailable');
   const hashes=[...new Set(history.data.filter(t=>t.to===target.address&&t.block_timestamp>=target.assigned_ms&&/^[a-f0-9]{64}$/.test(t.transaction_id)).map(t=>t.transaction_id))];
   const seen=new Set(hashes.length?await rpc<string[]>(env,'omni_wallet_seen_transactions',{target_address:target.address,hashes}):[]);let complete=true;
   for(const tx of hashes){if(seen.has(tx))continue;if(budget<=0){complete=false;break;}budget--;
    const verified=await receipt(env,tx),transfers=verified.transfers.filter(t=>t.to===target.hex);
    if(verified.block_ms<target.assigned_ms||!transfers.length)throw Error('index_receipt_mismatch');
    credited+=await rpc<number>(env,'omni_wallet_ingest_tron',{target_address:target.address,tx,block_ms:verified.block_ms,transfers});
   }
   // Reuse the same page after a budget stop. After the final page, start another
   // complete historical pass so late indexing cannot permanently lose a deposit.
   await rpc(env,'omni_wallet_scan_finish',{target_address:target.address,lease:target.lease_token,next_fingerprint:complete?(history.meta?.fingerprint??null):target.fingerprint});
  }catch{failures++;/* Lease expires; the next pass retries without advancing. */}
 }
 const result={status:failures?'retry_pending':'ok',addresses:targets.length,credited,failures};console.log(JSON.stringify({event:'wallet_scan',...result}));return result;
}
export default {
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(scan(env).catch(()=>{console.error(JSON.stringify({event:'wallet_scan_failed'}));}));},
 async fetch(request:Request,env:Env):Promise<Response>{
  const origin=request.headers.get('Origin')??'',allowed=env.ALLOWED_ORIGINS.split(',').includes(origin),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(allowed){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:allowed?{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}:headers});
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return Response.json({service:'chinateam-wallet',status:env.WALLET_GATEWAY_KEY&&env.TRONGRID_API_KEY?'configured':'setup_required'},{headers});
  if(!['/v1/payout/verify','/v1/deposit/verify-address'].includes(url.pathname)||request.method!=='POST')return Response.json({error:'not_found'},{status:404,headers});
  if(!allowed)return Response.json({error:'origin_denied'},{status:403,headers});
  if(!env.WALLET_GATEWAY_KEY||url.pathname==='/v1/payout/verify'&&!env.TRONGRID_API_KEY)return Response.json({error:'setup_required'},{status:503,headers});
  if(!(await env.PAYOUT_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'unknown'})).success)return Response.json({error:'rate_limited'},{status:429,headers});
  try{
   const authorization=request.headers.get('Authorization');if(!authorization||!/^Bearer [\w.-]+$/.test(authorization))return Response.json({error:'authentication_required'},{status:401,headers});
   const input=await limitedJson(request,2048) as {withdrawal?:string;tx?:string;challenge?:string;signature?:string};
   if(url.pathname==='/v1/deposit/verify-address'){
    if(!input||!input.challenge||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.challenge)||typeof input.signature!=='string'||input.signature.length>132)return Response.json({error:'invalid_request'},{status:400,headers});
    // Consume first, in a separate committed RPC. Verify only the server's text,
    // never client-provided user IDs, messages or addresses. No private key needed.
    const challenge=await rpc<{id:string;address:string;message:string}>(env,'omni_wallet_consume_challenge',{challenge:input.challenge},authorization);
    let recovered:string;try{recovered=Trx.verifyMessageV2(challenge.message,input.signature);}catch{return Response.json({error:'signature_invalid'},{status:400,headers});}
    if(recovered!==challenge.address)return Response.json({error:'signature_invalid'},{status:400,headers});
    await rpc(env,'omni_wallet_confirm_payer',{challenge:challenge.id,verified_address:recovered});
    return Response.json({status:'verified',address:recovered},{headers});
   }
   if(!input||!input.withdrawal||!/^[0-9a-f-]{36}$/.test(input.withdrawal)||!input.tx||!/^[0-9a-f]{64}$/.test(input.tx))return Response.json({error:'invalid_request'},{status:400,headers});
   const expected=await rpc<Payout>(env,'omni_wallet_payout_target',{withdrawal:input.withdrawal},authorization);
   const verified=await receipt(env,input.tx),matching=verified.transfers.filter(t=>t.from===expected.from&&t.to===expected.to&&t.amount===expected.amount);
   if(verified.block_ms<expected.created_ms||matching.length!==1)return Response.json({error:'receipt_mismatch'},{status:409,headers});
   const transfer:Transfer=matching[0];await rpc(env,'omni_wallet_confirm_payout',{withdrawal:input.withdrawal,tx:input.tx,block_ms:verified.block_ms,transfer});
   return Response.json({status:'paid'},{headers});
  }catch(e){const authorization=(e as Error).message==='authorization_or_request_failed';return Response.json({error:authorization?'authorization_or_request_failed':'verification_pending'},{status:authorization?403:503,headers});}
 }
} satisfies ExportedHandler<Env>;
