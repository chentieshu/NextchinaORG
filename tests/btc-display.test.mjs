import {test} from 'node:test';
import assert from 'node:assert/strict';
import {btcSnapshot,validBtcSnapshot,validBtcStart,btcBars} from '../src/modules/predictions/btc-data.ts';
import prices from '../prices-dist/index.js';
import wallet from '../wallet-dist/index.js';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const step=180000,bar=(start,price='65010.00000000')=>[start,'65000.00000000','65020.00000000','64990.00000000',price,'1',start+999];
function cacheFixture(t){const entries=new Map(),pending=[];const old=globalThis.caches;globalThis.caches={default:{match:async k=>entries.get(k.url)?.clone(),put:async(k,r)=>{entries.set(k.url,r.clone());}}};t.after(()=>{globalThis.caches=old;});return{entries,ctx:{waitUntil:p=>pending.push(p)},flush:()=>Promise.all(pending)};}

test('BTC display validates bounded round prices and distinguishes final reference data from settlement',()=>{
 const start=Math.floor(Date.now()/step)*step,now=start+20999,rows=Array.from({length:21},(_,i)=>bar(start+i*1000)),d=btcSnapshot(rows,start,now);
 assert.equal(validBtcSnapshot(d,start),true);assert.equal(d.complete,false);assert.equal(d.points.length,21);assert.equal(d.last_at,now);
 assert.equal(validBtcSnapshot(d,start+step),false);assert.equal(validBtcSnapshot({...d,points:[...d.points,d.points[0]]},start),false);assert.equal(validBtcSnapshot({...d,complete:true},start),false);
 for(const rows of [[],[bar(start+1)],[bar(start,'NaN')],[bar(start,'999999')],[bar(start),bar(start)],[bar(start+step)]])assert.throws(()=>btcSnapshot(rows,start,now));
 assert.throws(()=>btcSnapshot([bar(start)],start,now));
 const closed=btcSnapshot(Array.from({length:180},(_,i)=>bar(start+i*1000)),start,start+step+5000);assert.equal(closed.complete,true);assert.equal(validBtcSnapshot(closed,start),true);
 assert.equal(validBtcStart(String(start),now),start);for(const v of [String(start+1),String(start+step),'65000','1792100000000','1e12'])assert.equal(validBtcStart(v,now),null);
});

test('private BTC display shares cache, fixes upstream scope and forwards no user credentials',async(t)=>{
 if(!('caches'in globalThis))Object.defineProperty(globalThis,'caches',{value:{},configurable:true,writable:true});
 const cache=cacheFixture(t),start=Math.floor(Date.now()/step)*step-step,calls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json(Array.from({length:180},(_,i)=>bar(start+i*1000)));});
 const req=()=>new Request(`https://prices.internal/v1/btc?start=${start}`,{headers:{Authorization:'fixture-secret',Cookie:'fixture-cookie'}});
 const r=await prices.fetch(req(),{},cache.ctx);assert.equal(r.status,200);const d=await r.json();assert.equal(d.complete,true);assert.equal(d.points.length,180);assert.equal(r.headers.get('Cache-Control'),'public, max-age=86400');await cache.flush();
 assert.equal((await prices.fetch(req(),{},cache.ctx)).status,200);assert.equal(calls.length,1);assert.deepEqual(calls[0].init.headers,{Accept:'application/json'});const u=new URL(calls[0].url);assert.equal(u.origin,'https://api-gcp.binance.com');assert.equal(u.searchParams.get('interval'),'1s');assert.equal(u.searchParams.get('limit'),'180');assert.equal(calls[0].init.redirect,'manual');
 assert.equal((await prices.fetch(new Request(req().url+'&symbol=ETH'),{},cache.ctx)).status,400);
});

test('private BTC display fails closed on upstream failures and caches rate backoff',async(t)=>{
 if(!('caches'in globalThis))Object.defineProperty(globalThis,'caches',{value:{},configurable:true,writable:true});
 const cache=cacheFixture(t),start=Math.floor(Date.now()/step)*step-step;let mode='bad',calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return mode==='large'?new Response(' '.repeat(64001)):mode==='rate'?new Response(null,{status:429,headers:{'Retry-After':'120'}}):mode==='redirect'?new Response(null,{status:302,headers:{Location:'https://evil.test'}}):Response.json([bar(start)]);});
 const req=()=>new Request(`https://prices.internal/v1/btc?start=${start}`);
 for(const m of ['bad','large','redirect']){mode=m;cache.entries.clear();assert.equal((await prices.fetch(req(),{},cache.ctx)).status,503);}
 cache.entries.clear();mode='rate';const r=await prices.fetch(req(),{},cache.ctx);assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'public, max-age=120');await cache.flush();const before=calls;await prices.fetch(req(),{},cache.ctx);assert.equal(calls,before);
});

test('wallet public price endpoint rate limits, strips credentials and never calls the ledger',async(t)=>{
 const calls=[],start=Math.floor(Date.now()/step)*step-step;let limited=false;
 t.mock.method(globalThis,'fetch',async()=>{throw Error('No database/network calls allowed');});
 const env={ALLOWED_ORIGINS:'https://omniremix.pages.dev',PRICE_LIMITER:{limit:async()=>({success:!limited})},PRICE_SOURCE:{fetch:async u=>{calls.push(u);return Response.json({test:'price'});}},WALLET_GATEWAY_KEY:'fixture-secret'};
 const req=(suffix='',origin='https://omniremix.pages.dev')=>new Request(`https://chinateam-wallet.chentieshu520.workers.dev/v1/markets/btc?start=${start}${suffix}`,{headers:{Origin:origin,Authorization:'Bearer fixture-secret'}});
 const r=await wallet.fetch(req(),env);assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://omniremix.pages.dev');assert.equal(calls[0],`https://prices.internal/v1/btc?start=${start}`);assert.equal((await wallet.fetch(req('&evil=1'),env)).status,400);assert.equal((await wallet.fetch(req('','https://evil.test'),env)).status,403);
 limited=true;assert.equal((await wallet.fetch(req(),env)).status,429);assert.equal(calls.length,1);
});

test('real Workers runtime serves BTC snapshots through Cache API without refetching closed rounds',async()=>{
 const start=Math.floor(Date.now()/step)*step-step,requests=[];
 const runtime=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2026-10-13',modules:true,script:await readFile('prices-dist/index.js','utf8'),outboundService:async request=>{requests.push(request.url);return Response.json(Array.from({length:180},(_,i)=>bar(start+i*1000)));}}));
 try{const url=`https://prices.internal/v1/btc?start=${start}`,a=await runtime.dispatchFetch(url);assert.equal(a.status,200);assert.equal((await a.json()).points.length,180);const b=await runtime.dispatchFetch(url);assert.equal(b.status,200);assert.equal((await b.json()).complete,true);assert.equal(requests.length,1);}finally{await runtime.dispose();}
});

test('BTC OHLC views retain true highs/lows and aggregate only observed candles',()=>{const start=Math.floor(Date.now()/180000)*180000,rows=Array.from({length:7},(_,i)=>[start+i*1000,'65000.00000000',String(65020+i)+'.00000000',String(64990-i)+'.00000000','65010.00000000','1',start+i*1000+999]),d=btcSnapshot(rows,start,start+6999);assert.equal(d.points[0].high,'65020.00000000');const bars=btcBars(d.points,5);assert.equal(bars.length,2);assert.deepEqual(bars[0],{time:start/1000,open:65000,high:65024,low:64986,close:65010});assert.equal(bars[1].high,65026);assert.deepEqual(btcBars([{time:start,price:'65010'}],1),[]);assert.equal(validBtcSnapshot({...d,points:d.points.map((p,i)=>i? p:{...p,high:'64000'})},start),false);});
