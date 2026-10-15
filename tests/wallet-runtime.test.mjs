import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('the real Workers runtime scans through fixed upstreams and never follows credential-bearing redirects',async()=>{
 const calls=[];let redirect=false;
 const worker=await readFile('wallet-dist/index.js','utf8');
 const runtime=new Miniflare(convertV4MiniflareOptions({
  // The lockfile's workerd binary supports this date. Production also receives
  // a live Cron/heartbeat check; Node's Fetch implementation is not sufficient.
  compatibilityDate:'2026-10-13',compatibilityFlags:['nodejs_compat'],
  modules:[{type:'ESModule',path:'entry.js',contents:`import {scan} from './wallet.js';export default {async fetch(request,env){try{return Response.json(await scan(env));}catch{return Response.json({error:'unavailable'},{status:503});}}}`},{type:'ESModule',path:'wallet.js',contents:worker}],
  bindings:{TRONGRID_API_KEY:'test-chain-key',WALLET_GATEWAY_KEY:'test-gateway-key',SUPABASE_URL:'https://ledger.example.test',SUPABASE_PUBLISHABLE_KEY:'test-public'},
  outboundService:async request=>{
   const url=new URL(request.url);calls.push(url.href);
   assert.ok(['api.trongrid.io','ledger.example.test'].includes(url.hostname));
   if(redirect)return new Response(null,{status:302,headers:{Location:'https://untrusted.example.test/'}});
   if(url.hostname==='api.trongrid.io'){
    assert.equal(request.headers.get('TRON-PRO-API-KEY'),'test-chain-key');assert.equal(request.headers.get('x-wallet-gateway-key'),null);
    if(url.pathname==='/walletsolidity/getblock'){assert.deepEqual(await request.json(),{detail:false});return Response.json({blockID:'a'.repeat(64)});}
    return Response.json({success:true,data:[]});
   }
   assert.equal(request.headers.get('x-wallet-gateway-key'),'test-gateway-key');assert.equal(request.headers.get('TRON-PRO-API-KEY'),null);
   if(url.pathname.endsWith('/omni_wallet_scan_targets'))return Response.json([{address:'test-address',hex:'1'.repeat(40),assigned_ms:1000,fingerprint:null,lease_token:'test-lease'}]);
   assert.ok(url.pathname.endsWith('/omni_wallet_scan_finish'));return new Response(null,{status:204});
  }
 }));
 try{
  const result=await runtime.dispatchFetch('http://localhost/');assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'ok',addresses:1,credited:0,failures:0});assert.equal(calls.length,4);
  redirect=true;calls.length=0;assert.equal((await runtime.dispatchFetch('http://localhost/')).status,503);assert.equal(calls.length,1,'a redirect cannot forward either secret');
 }finally{await runtime.dispose();}
});
