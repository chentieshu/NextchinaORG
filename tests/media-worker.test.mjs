import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../media-dist/index.js';
const actor='50000000-0000-4000-8000-000000000001',id='50000000-0000-4000-8000-000000000002',origin='https://nextchina.org';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QAAAAABJRU5ErkJggg==','base64');
test('media gateway authenticates uploads, stores raster files, rolls back conflicts and blocks unsafe provider redirects',async()=>{
 const originalFetch=globalThis.fetch,objects=new Map(),deleted=[],tasks=[],calls=[];let disabled=false,conflict=false,lostResponse=false,redirect=false,counter=0;
 const old=`avatars/${actor}/${id}.png`;
 const profile={id:actor,display_name:'Writer',avatar_key:old,avatar_source:'custom',updated_at:'2026-10-13T00:00:00+00:00',disabled:false,role:'member'};
 globalThis.fetch=async(url,options={})=>{
  calls.push(String(url));const parsed=new URL(url);
  if(parsed.hostname==='lh3.googleusercontent.com')return redirect?new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}):new Response(png);
  assert.equal(parsed.origin,'https://supabase.example.test');
  if(options.headers.Authorization!=='Bearer valid.token.value')return Response.json({error:'bad token'},{status:401});
  if(parsed.pathname==='/auth/v1/user')return Response.json({id:actor,identities:[{provider:'google',identity_data:{picture:'https://lh3.googleusercontent.com/photo'}}]});
  if(parsed.pathname==='/rest/v1/omni_profiles')return Response.json([{...profile,disabled}]);
  if(parsed.pathname.endsWith('/omni_reserve_media')){const value=JSON.parse(options.body);return Response.json({object_key:`${value.media_kind==='avatar'?'avatars':'content'}/${actor}/50000000-0000-4000-8000-${String(++counter).padStart(12,'0')}.${value.media_extension}`});}
  if(parsed.pathname.endsWith('/omni_save_profile')){if(conflict)return Response.json({message:'Conflict'},{status:409});const value=JSON.parse(options.body);Object.assign(profile,{display_name:value.new_name,avatar_key:value.new_source==='none'?null:value.new_source==='keep'?profile.avatar_key:value.new_avatar_key,avatar_source:value.new_source==='keep'?profile.avatar_source:value.new_source,updated_at:'2026-10-13T01:00:00+00:00'});if(lostResponse)throw new TypeError('Connection closed after commit');return Response.json(profile);}
  throw Error('Unexpected request '+url);
 };
 const env={SUPABASE_URL:'https://supabase.example.test',SUPABASE_PUBLISHABLE_KEY:'public-test-key',MEDIA_ORIGIN:'https://media.nextchina.org',ALLOWED_ORIGINS:origin,UPLOAD_LIMITER:{limit:async()=>({success:true})},MEDIA:{put:async(key,bytes,options)=>objects.set(key,{bytes,options}),delete:async key=>{deleted.push(key);objects.delete(key);},get:async key=>{const stored=objects.get(key);return stored?{body:stored.bytes,size:stored.bytes.length,httpMetadata:stored.options.httpMetadata,httpEtag:'"etag"'}:null;}}};
 const context={waitUntil:promise=>tasks.push(promise)};
 async function run(path,body=png,settings,headers={}){return worker.fetch(new Request(`https://media.nextchina.org${path}`,{method:'POST',headers:{Origin:origin,Authorization:'Bearer valid.token.value',...(settings?{'X-Profile-Settings':encodeURIComponent(JSON.stringify(settings))}:{}),...headers},body}),env,context);}
 try{
  assert.equal((await run('/v1/images',png,null,{Origin:'https://evil.test'})).status,403);
  assert.equal((await run('/v1/images',png,null,{Authorization:'Bearer bad'})).status,401);
  disabled=true;assert.equal((await run('/v1/images')).status,403);disabled=false;
  assert.equal((await run('/v1/images',Buffer.from('<svg onload="alert(1)">attack</svg>'))).status,415);
  assert.equal((await run('/v1/images',new Uint8Array(4*1024*1024+1))).status,413);assert.equal(objects.size,0);
  let response=await run('/v1/profile',png,{display_name:'New writer',mode:'custom',expected_updated_at:profile.updated_at});assert.equal(response.status,200);await Promise.all(tasks);assert.ok(deleted.includes(old));assert.equal(profile.display_name,'New writer');assert.equal(objects.size,1);
  const avatar=profile.avatar_key;response=await worker.fetch(new Request(`https://media.nextchina.org/${avatar}`),env,context);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  conflict=true;response=await run('/v1/profile',png,{display_name:'Conflict',mode:'custom',expected_updated_at:profile.updated_at});assert.equal(response.status,409);await Promise.all(tasks);assert.equal(objects.size,1);assert.ok(objects.has(avatar));conflict=false;
  redirect=true;response=await run('/v1/profile',null,{display_name:'New writer',mode:'provider',expected_updated_at:profile.updated_at});assert.equal(response.status,422);assert.ok(!calls.some(url=>url.includes('127.0.0.1')));
  response=await run('/v1/profile',null,{display_name:'New writer',mode:'provider',automatic:true,expected_updated_at:profile.updated_at});assert.equal(response.status,200);assert.equal(profile.avatar_key,avatar,'automatic provider import must preserve a custom avatar');
  response=await run('/v1/images');assert.equal(response.status,200);assert.match((await response.json()).url,/^https:\/\/media.nextchina.org\/content\//);
  lostResponse=true;response=await run('/v1/profile',png,{display_name:'Committed',mode:'custom',expected_updated_at:profile.updated_at});assert.equal(response.status,500);await Promise.all(tasks);assert.ok(objects.has(profile.avatar_key),'a lost response must not delete a successfully committed avatar');lostResponse=false;
 }finally{globalThis.fetch=originalFetch;await Promise.all(tasks);}
});
