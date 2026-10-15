import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker, {scan} from '../wallet-dist/index.js';
import {confirmedTransfers,USDT_CONTRACT} from '../workers/wallet/src/tron.ts';

const tx='a'.repeat(64),from='1'.repeat(40),to='2'.repeat(40),origin='https://chinateam.org';
const topic='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const receipt=()=>({id:tx,blockNumber:123,blockTimeStamp:2000,receipt:{result:'SUCCESS'},log:[{address:'a614f803b6fd780986a42c78ec9c7f77e6ded13c',topics:[topic,'0'.repeat(24)+from,'0'.repeat(24)+to],data:(990000n).toString(16).padStart(64,'0')}]});
const env={SUPABASE_URL:'https://supabase.example.test',SUPABASE_PUBLISHABLE_KEY:'test-public',WALLET_GATEWAY_KEY:'test-only',TRONGRID_API_KEY:'test-only',ALLOWED_ORIGINS:origin,PAYOUT_LIMITER:{limit:async()=>({success:true})}};

test('only successful solidified USDt receipts yield exact integer transfers',()=>{
 assert.deepEqual(confirmedTransfers(receipt(),tx).transfers,[{index:0,from,to,amount:'990000'}]);
 for(const mutate of [r=>r.id='b'.repeat(64),r=>r.result='FAILED',r=>r.receipt.result='OUT_OF_ENERGY',r=>delete r.blockNumber,r=>r.log[0].data='bad',r=>r.log[0].topics[1]='f'.repeat(64)]){
  const r=receipt();mutate(r);assert.throws(()=>confirmedTransfers(r,tx));
 }
 for(const mutate of [r=>r.log[0].address='3'.repeat(40),r=>r.log[0].topics[0]='f'.repeat(64),r=>r.log[0].data='0'.repeat(64)]){
  const r=receipt();mutate(r);assert.equal(confirmedTransfers(r,tx).transfers.length,0);
 }
});

test('watcher probes finality, verifies receipts, resumes pages and never advances on uncertainty',async()=>{
 const original=globalThis.fetch,calls=[],finished=[],ingested=[];let bad=false,seen=false,probeFails=false;
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):{};calls.push(u.pathname);
  assert.equal(options.redirect,'manual');assert.ok(options.signal);
  if(u.hostname==='api.trongrid.io'){
   assert.equal(options.headers['TRON-PRO-API-KEY'],env.TRONGRID_API_KEY);
   assert.equal(options.headers['x-wallet-gateway-key'],undefined);
   if(u.pathname==='/walletsolidity/getblock'){assert.deepEqual(body,{detail:false});return Response.json(probeFails?{}:{blockID:'f'.repeat(64)});}
   if(u.pathname==='/walletsolidity/gettransactioninfobyid')return Response.json(bad?{}:receipt());
   assert.equal(u.searchParams.get('contract_address'),USDT_CONTRACT);assert.equal(u.searchParams.get('only_confirmed'),'true');
   return Response.json({success:true,data:[{transaction_id:tx,to:'test-address',block_timestamp:2000}],meta:{fingerprint:'next'}});
  }
  assert.equal(u.origin,env.SUPABASE_URL);assert.equal(options.headers['x-wallet-gateway-key'],env.WALLET_GATEWAY_KEY);
  if(u.pathname.endsWith('/omni_wallet_scan_targets'))return Response.json([{address:'test-address',hex:to,assigned_ms:1000,fingerprint:null,lease_token:'test-lease'}]);
  if(u.pathname.endsWith('/omni_wallet_seen_transactions'))return Response.json(seen?[tx]:[]);
  if(u.pathname.endsWith('/omni_wallet_ingest_tron')){ingested.push(body);return Response.json(1);}
  if(u.pathname.endsWith('/omni_wallet_scan_finish')){finished.push(body);return new Response(null,{status:204});}
  throw Error('Unexpected network call');
 };
 try{
  assert.equal((await scan({...env,TRONGRID_API_KEY:''})).status,'setup_required');assert.equal(calls.length,0);
  assert.equal((await scan(env)).credited,1);assert.equal(ingested[0].transfers[0].amount,'990000');assert.equal(finished[0].next_fingerprint,'next');
  bad=true;assert.equal((await scan(env)).failures,1);assert.equal(finished.length,1);assert.equal(ingested.length,1);
  seen=true;await scan(env);assert.equal(finished.length,2);assert.equal(ingested.length,1);
  probeFails=true;const before=calls.filter(p=>p.endsWith('scan_targets')).length;await assert.rejects(scan(env),/chain_unavailable/);assert.equal(calls.filter(p=>p.endsWith('scan_targets')).length,before,'bad node cannot refresh the enable heartbeat');
 }finally{globalThis.fetch=original;}
});

test('payout verifier requires owner MFA RPC approval and exact net receipt, never signs or sends',async()=>{
 const original=globalThis.fetch;let denied=false,mismatch=false,pending=false,settled=0,chainCalls=0;
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);if(u.hostname==='api.trongrid.io'){chainCalls++;assert.equal(u.pathname,'/walletsolidity/gettransactioninfobyid');const r=receipt();if(mismatch)r.log[0].data=(1000000n).toString(16).padStart(64,'0');return Response.json(pending?{}:r);}
  if(u.pathname.endsWith('/omni_wallet_payout_target')){assert.equal(options.headers.Authorization,'Bearer valid.jwt.token');assert.equal(options.headers['x-wallet-gateway-key'],undefined);return denied?Response.json({}, {status:403}):Response.json({from,to,amount:'990000',created_ms:1000});}
  if(u.pathname.endsWith('/omni_wallet_confirm_payout')){assert.equal(options.headers['x-wallet-gateway-key'],env.WALLET_GATEWAY_KEY);settled++;return new Response(null,{status:204});}
  throw Error('Unexpected network call');
 };
 const run=(headers={},environment=env)=>worker.fetch(new Request('https://wallet.chinateam.org/v1/payout/verify',{method:'POST',headers:{Origin:origin,Authorization:'Bearer valid.jwt.token',...headers},body:JSON.stringify({withdrawal:'10000000-0000-4000-8000-000000000001',tx})}),environment);
 try{
  assert.equal((await run({Origin:'https://evil.test'})).status,403);
  assert.equal((await run({}, {...env,PAYOUT_LIMITER:{limit:async()=>({success:false})}})).status,429);
  denied=true;assert.equal((await run()).status,403);assert.equal(chainCalls,0);denied=false;
  pending=true;assert.equal((await run()).status,503);pending=false;
  mismatch=true;assert.equal((await run()).status,409);assert.equal(settled,0);mismatch=false;
  assert.equal((await run()).status,200);assert.equal(settled,1);
 }finally{globalThis.fetch=original;}
});

test('retired payer verification endpoint never accesses the ledger or chain',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected request');};
 try{const response=await worker.fetch(new Request('https://wallet.chinateam.org/v1/deposit/verify-address',{method:'POST',headers:{Origin:origin}}),env);assert.equal(response.status,404);}finally{globalThis.fetch=original;}
});

test('failed scheduled queries identify their stage without logging upstream bodies or credentials',async()=>{
 const original=globalThis.fetch,originalError=console.error,logs=[],waits=[];
 globalThis.fetch=async()=>Response.json({message:'sensitive upstream response'},{status:401});
 console.error=value=>logs.push(JSON.parse(value));
 try{await worker.scheduled({},env,{waitUntil:promise=>{waits.push(promise);}});await Promise.all(waits);
  assert.deepEqual(logs.sort((a,b)=>a.event.localeCompare(b.event)),[{event:'c2c_expiry_failed',stage:'omni_wallet_c2c_expire',http_status:401,reason:'http'},{event:'wallet_scan_failed',stage:'chain_head',http_status:401,reason:'http'}]);
 }finally{globalThis.fetch=original;console.error=originalError;}
});
