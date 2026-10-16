import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../prices-dist/index.js';

test('private price service accepts only fixed BTC read paths and strips all credentials',async(t)=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json({serverTime:Date.now()});});
 for(const path of ['https://evil.example/api/v3/time','https://api-gcp.binance.com/api/v3/order','https://api-gcp.binance.com/api/v3/time?secret=a','https://api-gcp.binance.com/api/v3/klines?symbol=ETHUSDT&interval=3m&timeZone=0&limit=3','https://api-gcp.binance.com/api/v3/klines?symbol=BTCUSDT&interval=3m&timeZone=0&limit=1000'])assert.equal((await worker.fetch(new Request(path))).status,400);
 assert.equal((await worker.fetch(new Request('https://api-gcp.binance.com/api/v3/time',{method:'POST'}))).status,400);assert.equal(calls.length,0);
 assert.equal((await worker.fetch(new Request('https://api-gcp.binance.com/api/v3/time',{headers:{Authorization:'private-test','x-wallet-gateway-key':'private-test'}}))).status,200);assert.deepEqual(calls[0].init.headers,{Accept:'application/json'});assert.equal(calls[0].init.redirect,'manual');assert.equal(calls[0].init.cache,'no-store');
});
test('private price service refuses large responses, preserves rate backoff and does not follow redirects',async(t)=>{
 let mode='limit';t.mock.method(globalThis,'fetch',async()=>mode==='limit'?new Response(' '.repeat(64001)):mode==='rate'?new Response('Rate limited',{status:429,headers:{'Retry-After':'600','Set-Cookie':'secret=discard'}}):new Response(null,{status:302,headers:{Location:'https://evil.example'}}));
 const req=()=>new Request('https://api-gcp.binance.com/api/v3/time');assert.equal((await worker.fetch(req())).status,502);mode='rate';const limited=await worker.fetch(req());assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'600');assert.equal(limited.headers.get('Set-Cookie'),null);mode='redirect';const redirect=await worker.fetch(req());assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),null);
});
