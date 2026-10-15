import {confirmedTransfers,USDT_CONTRACT,type Transfer} from './tron';
const TRON_ORIGIN='https://api.trongrid.io';
type Target={address:string;hex:string;assigned_ms:number;fingerprint:string|null;lease_token:string};
type History={success?:boolean;data?:{transaction_id:string;to:string;block_timestamp:number}[];meta?:{fingerprint?:string}};
type Payout={id:string;to:string;from:string;amount:string;created_ms:number};
class GatewayFailure extends Error {
 constructor(message:string,readonly stage:string,readonly status:number,readonly reason='http'){super(message);}
}
// Diagnostics contain only fixed operation names and HTTP status codes, never
// response bodies, request headers, tokens, wallet addresses or transaction data.
function safeReason(error:unknown){if(error instanceof Error){if(error.name==='TimeoutError')return 'timeout';if(error.name==='TypeError')return 'network_or_headers';if(error.message==='response_too_large')return 'response_too_large';}return 'invalid_response';}
function failureContext(error:unknown){return error instanceof GatewayFailure?{stage:error.stage,http_status:error.status,reason:error.reason}:{stage:'response_or_network',reason:safeReason(error)};}

async function limitedJson(input:Request|Response,limit=2000000):Promise<unknown>{
 const reader=input.body?.getReader();if(!reader)throw Error('empty_response');const decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('response_too_large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{await reader.cancel();}
}
async function rpc<T>(env:Env,name:string,body:unknown,authorization?:string):Promise<T>{
 try{
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',redirect:'manual',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{'x-wallet-gateway-key':env.WALLET_GATEWAY_KEY})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();throw new GatewayFailure(authorization?'authorization_or_request_failed':'ledger_unavailable',name,response.status);}
 // PostgREST returns 204 for SQL functions declared RETURNS void.
 if(response.status===204)return null as T;
 return await limitedJson(response) as T;
 }catch(e){throw e instanceof GatewayFailure?e:new GatewayFailure('ledger_unavailable',name,0,safeReason(e));}
}
async function tron(env:Env,path:string,body?:unknown){
 const stage=path.startsWith('/walletsolidity/getblock')?'chain_head':path.startsWith('/walletsolidity/gettransactioninfobyid')?'chain_receipt':'chain_history';
 try{
 const response=await fetch(TRON_ORIGIN+path,{method:body?'POST':'GET',redirect:'manual',headers:{'TRON-PRO-API-KEY':env.TRONGRID_API_KEY,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 if(!response.ok){await response.body?.cancel();throw new GatewayFailure('chain_unavailable',stage,response.status);}return await limitedJson(response);
 }catch(e){throw e instanceof GatewayFailure?e:new GatewayFailure('chain_unavailable',stage,0,safeReason(e));}
}
async function receipt(env:Env,tx:string){return confirmedTransfers(await tron(env,'/walletsolidity/gettransactioninfobyid',{value:tx}),tx);}
export async function scan(env:Env){
 if(!env.WALLET_GATEWAY_KEY||!env.TRONGRID_API_KEY)return{status:'setup_required'};
 // A successful solidified-node probe precedes the heartbeat used by the enable gate.
 const head=await tron(env,'/walletsolidity/getblock',{detail:false}) as {blockID?:string};if(!head.blockID||!/^[a-f0-9]{64}$/i.test(head.blockID))throw new GatewayFailure('chain_unavailable','chain_head',200,'invalid_response');
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
  }catch(e){failures++;console.error(JSON.stringify({event:'wallet_scan_target_failed',...failureContext(e)}));/* Lease expires; the next pass retries without advancing. */}
 }
 const result={status:failures?'retry_pending':'ok',addresses:targets.length,credited,failures};console.log(JSON.stringify({event:'wallet_scan',...result}));return result;
}
export default {
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(scan(env).catch(e=>{console.error(JSON.stringify({event:'wallet_scan_failed',...failureContext(e)}));}));},
 async fetch(request:Request,env:Env):Promise<Response>{
  const origin=request.headers.get('Origin')??'',allowed=env.ALLOWED_ORIGINS.split(',').includes(origin),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(allowed){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
  if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:allowed?{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}:headers});
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return Response.json({service:'chinateam-wallet',status:env.WALLET_GATEWAY_KEY&&env.TRONGRID_API_KEY?'configured':'setup_required'},{headers});
  if(url.pathname!=='/v1/payout/verify'||request.method!=='POST')return Response.json({error:'not_found'},{status:404,headers});
  if(!allowed)return Response.json({error:'origin_denied'},{status:403,headers});
  if(!env.WALLET_GATEWAY_KEY||!env.TRONGRID_API_KEY)return Response.json({error:'setup_required'},{status:503,headers});
  if(!(await env.PAYOUT_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'unknown'})).success)return Response.json({error:'rate_limited'},{status:429,headers});
  try{
   const authorization=request.headers.get('Authorization');if(!authorization||!/^Bearer [\w.-]+$/.test(authorization))return Response.json({error:'authentication_required'},{status:401,headers});
   const input=await limitedJson(request,2048) as {withdrawal?:string;tx?:string};
   if(!input||!input.withdrawal||!/^[0-9a-f-]{36}$/.test(input.withdrawal)||!input.tx||!/^[0-9a-f]{64}$/.test(input.tx))return Response.json({error:'invalid_request'},{status:400,headers});
   const expected=await rpc<Payout>(env,'omni_wallet_payout_target',{withdrawal:input.withdrawal},authorization);
   const verified=await receipt(env,input.tx),matching=verified.transfers.filter(t=>t.from===expected.from&&t.to===expected.to&&t.amount===expected.amount);
   if(verified.block_ms<expected.created_ms||matching.length!==1)return Response.json({error:'receipt_mismatch'},{status:409,headers});
   const transfer:Transfer=matching[0];await rpc(env,'omni_wallet_confirm_payout',{withdrawal:input.withdrawal,tx:input.tx,block_ms:verified.block_ms,transfer});
   return Response.json({status:'paid'},{headers});
  }catch(e){const authorization=(e as Error).message==='authorization_or_request_failed';return Response.json({error:authorization?'authorization_or_request_failed':'verification_pending'},{status:authorization?403:503,headers});}
 }
} satisfies ExportedHandler<Env>;
