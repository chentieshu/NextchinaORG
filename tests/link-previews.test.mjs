import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../media-dist/index.js';
test('link previews use fixed provider endpoints, cached Cloudflare thumbnails and plain metadata',async()=>{
 const originalFetch=globalThis.fetch,oldCaches=globalThis.caches,cache=new Map(),calls=[],tasks=[];let redirect=false,limited=false;
 globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,value)=>{cache.set(key.url,value.clone());}}};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QAAAAABJRU5ErkJggg==','base64');
 globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(options.redirect,'manual');const u=new URL(url);if(redirect)return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/secrets'}});if(u.hostname==='api.github.com')return Response.json({private:false,full_name:'openai/example',description:'A repository',language:'TypeScript',stargazers_count:42,forks_count:8});if(u.hostname==='www.youtube.com')return Response.json({title:'Example video',author_name:'Example channel',html:'<script>evil()</script>',thumbnail_url:'http://127.0.0.1/secret'});if(u.hostname==='i.ytimg.com')return new Response(png);throw Error('Unexpected provider '+url);};
 const env={MEDIA_ORIGIN:'https://media.chinateam.org',ALLOWED_ORIGINS:'https://chinateam.org',PREVIEW_LIMITER:{limit:async()=>({success:!limited})}},ctx={waitUntil:p=>tasks.push(p)};
 const run=url=>worker.fetch(new Request(url,{headers:{Origin:'https://chinateam.org'}}),env,ctx);
 try{
  let response=await run('https://media.chinateam.org/v1/link-preview?url='+encodeURIComponent('https://github.com/openai/example'));let json=await response.json();assert.equal(json.title,'openai/example');assert.equal(json.stars,42);await Promise.all(tasks);
  await run('https://media.chinateam.org/v1/link-preview?url='+encodeURIComponent('https://github.com/openai/example'));assert.equal(calls.length,1,'metadata comes from cache');
  response=await run('https://media.chinateam.org/v1/link-preview?url='+encodeURIComponent('https://youtu.be/dQw4w9WgXcQ'));json=await response.json();assert.equal(json.title,'Example video');assert.equal(json.html,undefined);assert.equal(json.imageSource,undefined);assert.match(json.thumbnail_url,/^https:\/\/media.chinateam.org/);await Promise.all(tasks);
  response=await run(json.thumbnail_url);assert.equal(response.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);await Promise.all(tasks);
  const before=calls.length;response=await run('https://media.chinateam.org/v1/link-preview?url='+encodeURIComponent('https://127.0.0.1/private'));json=await response.json();assert.equal(json.available,false);assert.equal(calls.length,before);
  redirect=true;response=await run('https://media.chinateam.org/v1/link-preview?url='+encodeURIComponent('https://github.com/openai/redirect'));assert.equal((await response.json()).available,false);assert.ok(!calls.some(url=>url.includes('127.0.0.1')));
  limited=true;assert.equal((await run('https://media.chinateam.org/v1/link-preview?url=https://github.com/openai/example')).status,429);
 }finally{await Promise.allSettled(tasks);globalThis.fetch=originalFetch;globalThis.caches=oldCaches;}
});
