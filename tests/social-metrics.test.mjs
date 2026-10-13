import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../media-dist/index.js';
test('public GitHub totals paginate, exclude forks, deduplicate, and respect unlink; X costs are owner-gated',async()=>{
 const oldFetch=globalThis.fetch,objects=new Map(),calls=[];let linked=true,fail=false,pages=0,xEnabled=false,claimAllowed=true;
 const uid='92000000-0000-4000-8000-000000000001',accounts=[{provider:'github',provider_id:'123',handle:'old-name',url:'https://github.com/old-name'},{provider:'x',provider_id:'456',handle:'actual_x',url:'https://x.com/actual_x'}];
 const env={SUPABASE_URL:'https://supabase.example.test',SUPABASE_PUBLISHABLE_KEY:'public-key',ALLOWED_ORIGINS:'https://chinateam.org',PREVIEW_LIMITER:{limit:async()=>({success:true})},MEDIA:{get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,put:async(k,v)=>objects.set(k,v)}};
 globalThis.fetch=async(input,init)=>{const u=String(input);calls.push(u);if(u.includes('omni_public_connections'))return Response.json([{id:uid,accounts:linked?accounts:[]}]);if(u.endsWith('/auth/v1/user'))return Response.json({id:uid});if(u.includes('/omni_profiles'))return Response.json([{id:uid,disabled:false}]);if(u.includes('omni_claim_x_metric_sync'))return Response.json(claimAllowed);if(u.includes('api.x.com')){assert.ok(xEnabled);return Response.json({data:{id:'456',public_metrics:{followers_count:321}}});}if(fail)return new Response('',{status:429});if(u==='https://api.github.com/user/123')return Response.json({id:123,login:'new-name'});if(u.includes('/users/new-name/repos')){pages++;const repo=(id,stars,extra={})=>({id,stargazers_count:stars,owner:{id:123},private:false,fork:false,...extra});return Response.json(pages===1?[repo(1,5),repo(2,999,{fork:true}),repo(3,999,{owner:{id:999}}),repo(4,999,{private:true})]:[repo(1,5),repo(5,7)],{headers:pages===1?{Link:'<https://api.github.com/users/new-name/repos?page=2>; rel="next"'}:{}});}throw Error('Unexpected fetch '+u);};
 const get=()=>worker.fetch(new Request(`https://media.chinateam.org/v1/social-metrics?user=${uid}`),env,{waitUntil:()=>{}});
 try{
  let response=await get(),body=await response.json();assert.equal(response.status,200);assert.equal(body.metrics[0].count,12);assert.equal(body.metrics[0].handle,'new-name');assert.equal(body.metrics[1].status,'not_configured');assert.equal(pages,2);assert.ok(!calls.some(u=>u.includes('api.x.com')));
  await get();assert.equal(pages,2,'cached totals avoid repeated API queries');
  linked=false;assert.equal((await (await get()).json()).metrics.length,0,'unlinked accounts disappear even with cache');linked=true;
  const key='social-metrics/v2/github/123.json',cached=JSON.parse(objects.get(key));objects.set(key,JSON.stringify({...cached,expires_at:0}));fail=true;body=await(await get()).json();assert.equal(body.metrics[0].status,'stale');assert.equal(body.metrics[0].count,12);
  const sync=()=>worker.fetch(new Request('https://media.chinateam.org/v1/social-metrics/sync',{method:'POST',headers:{Origin:'https://chinateam.org',Authorization:'Bearer valid.token.value'}}),env,{waitUntil:()=>{}});
  assert.equal((await sync()).status,503);env.X_BEARER_TOKEN='server-only';xEnabled=true;
  assert.equal((await sync()).status,200);claimAllowed=false;assert.equal((await sync()).status,429);assert.equal(calls.filter(u=>u.includes('api.x.com')).length,1);
  body=await(await get()).json();assert.equal(body.metrics[1].count,321);assert.ok(!JSON.stringify(body).includes('server-only'));
 }finally{globalThis.fetch=oldFetch;}
});
