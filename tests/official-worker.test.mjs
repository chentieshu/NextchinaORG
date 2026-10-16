import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOfficial,validCandle} from '../wallet-dist/index.js';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const step=180000,bar=(start)=>[start,'65000.00000000','65020.00000000','64990.00000000','65010.00000000','100.00000000',start+step-1,'6500000.00000000',100,'50.00000000','3250000.00000000','0'];
test('official candle parser rejects missing, malformed, future alignment and impossible OHLC',()=>{
 const start=Math.floor(Date.now()/step)*step,c=bar(start);assert.equal(validCandle(c,start),true);
 for(const v of [null,{},[],[...c,1],bar(start+1),c.map((v,i)=>i===0?String(v):v),c.map((v,i)=>i===1?null:v),c.map((v,i)=>i===3?'999999':v),c.map((v,i)=>i===8?0:v),c.map((v,i)=>i===4?'1e8':v)])assert.equal(validCandle(v),false);
 assert.equal(validCandle(c,start-step),false);
});
test('official scheduler uses a fixed public source, verifies closed rounds and releases its lease',async(t)=>{
 const now=Date.now(),start=Math.floor(now/step)*step,past=start-step*2,calls=[],fetches=[];
 const rpc=async(name,body)=>{calls.push({name,body});if(name.endsWith('_plan'))return {lease:'local-lease',tasks:[{id:'reviewed',state:'resolving',start_ms:past-step},{id:'closed',state:'open',start_ms:past}]};return {ok:true};};
 t.mock.method(globalThis,'fetch',async(url,options)=>{fetches.push(url);const u=new URL(url);assert.equal(u.origin,'https://api-gcp.binance.com');assert.equal(options.redirect,'manual');assert.deepEqual(Object.keys(options.headers),['Accept']);return Response.json(u.pathname.endsWith('/time')?{serverTime:now}:[bar(past),bar(start-step),bar(start)]);});
 await runOfficial(rpc);assert.equal(fetches.length,2);assert.deepEqual(calls.map(c=>c.name.split('_').at(-1)),['plan','advance','advance','tick','advance','finish']);assert.equal(calls[1].body.action,'finalize');assert.equal(calls[2].body.action,'close');assert.equal(calls[4].body.action,'observe');assert.equal(calls.at(-1).body.error_code,null);
});
test('official source failures preserve prior verified finalization, use backoff and never fabricate an observation',async(t)=>{
 const calls=[],rpc=async(name,body)=>{calls.push({name,body});return name.endsWith('_plan')?{lease:'lease',tasks:[{id:'review',state:'resolving'},{id:'old',state:'open'}]}:{};};
 t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:429,headers:{'Retry-After':'600'}}));
 await runOfficial(rpc);assert.equal(calls.at(-1).body.error_code,'rate_limited');assert.equal(calls.at(-1).body.retry_seconds,600);assert.ok(calls.some(c=>c.body.action==='finalize'));assert.ok(calls.some(c=>c.body.action==='close'));assert.ok(!calls.some(c=>c.name.endsWith('_tick')||c.body.action==='observe'));
});
test('official source rejects oversized, stale or malformed data and inactive lease makes no external request',async(t)=>{
 let mode='large',requests=0,last;
 const rpc=async(name,body)=>{if(name.endsWith('_plan'))return {lease:'lease',tasks:[]};if(name.endsWith('_finish'))last=body;return {};};
 t.mock.method(globalThis,'fetch',async(url)=>{requests++;if(mode==='large')return new Response(' '.repeat(64001));if(mode==='stale')return Response.json({serverTime:Date.now()-120000});return Response.json(url.endsWith('/time')?{serverTime:Date.now()}:[{bad:true}]);});
 await runOfficial(rpc);assert.equal(last.error_code,'invalid_source');mode='stale';await runOfficial(rpc);assert.equal(last.error_code,'clock_skew');mode='bad';await runOfficial(rpc);assert.equal(last.error_code,'invalid_source');const before=requests;await runOfficial(async()=>({lease:null,tasks:[]}));assert.equal(requests,before);
});

test('the real Workers runtime can fetch and parse official public candles without credential forwarding',async()=>{
 const worker=await readFile('wallet-dist/index.js','utf8'),start=Math.floor(Date.now()/step)*step,requests=[];
 const runtime=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2026-10-13',compatibilityFlags:['nodejs_compat'],modules:[{type:'ESModule',path:'entry.js',contents:`import {runOfficial} from './wallet.js';export default {async fetch(){const calls=[];await runOfficial(async(name,body)=>{calls.push({name,body});return name.endsWith('_plan')?{lease:'test-lease',tasks:[]}:{};});return Response.json(calls);}}`},{type:'ESModule',path:'wallet.js',contents:worker}],outboundService:async request=>{requests.push(request.url);assert.equal(new URL(request.url).hostname,'api-gcp.binance.com');assert.equal(request.headers.get('x-wallet-gateway-key'),null);return Response.json(request.url.includes('/time')?{serverTime:Date.now()}:[bar(start-step*2),bar(start-step),bar(start)]);}}));
 try{const r=await runtime.dispatchFetch('http://localhost/'),calls=await r.json();assert.equal(calls.at(-1).body.error_code,null);assert.equal(requests.length,2);assert.ok(calls.some(c=>c.name.endsWith('_tick')));}finally{await runtime.dispose();}
});
