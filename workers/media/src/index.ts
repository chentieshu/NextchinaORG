import {MediaError,imageType,providerImageUrl,readBounded} from './image';
type User={id:string;identities?:{provider:string;last_sign_in_at?:string;identity_data?:Record<string,unknown>}[]};
type Profile={id:string;display_name:string;avatar_key:string|null;avatar_source:string;updated_at:string;disabled:boolean};
type Asset={object_key:string};
type Settings={display_name?:string;mode?:'keep'|'custom'|'provider'|'none';expected_updated_at?:string;automatic?:boolean};
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',objectPath=new RegExp(`^/(avatars|content)/${UUID}/${UUID}\\.(webp|png|jpg)$`);
async function api<T>(env:Env,token:string,path:string,body?:unknown):Promise<T>{
 const response=await fetch(`${env.SUPABASE_URL}${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!response.ok){const status=response.status;await response.body?.cancel();throw new MediaError(status===409?409:status===429?429:status===401||status===403?401:502,status===409?'profile_conflict':status===429?'upload_limit':'account_unavailable');}
 return response.json() as Promise<T>;
}
async function importedAvatar(user:User){
 const candidates=(user.identities??[]).filter(i=>['google','github','x','twitter'].includes(i.provider)).sort((a,b)=>(Date.parse(b.last_sign_in_at??'')||0)-(Date.parse(a.last_sign_in_at??'')||0));
 let current=candidates.flatMap(i=>[i.identity_data?.avatar_url,i.identity_data?.picture,i.identity_data?.profile_image_url_https].map(providerImageUrl)).find(Boolean);
 if(!current)throw new MediaError(422,'provider_avatar_unavailable');
 for(let i=0;i<4;i++){
  const response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'image/webp,image/png,image/jpeg'}});
  if(response.status>=300&&response.status<400){const target=providerImageUrl(new URL(response.headers.get('Location')??'',current).href);await response.body?.cancel();if(!target)throw new MediaError(422,'provider_avatar_unavailable');current=target;continue;}
  if(!response.ok){await response.body?.cancel();throw new MediaError(422,'provider_avatar_unavailable');}
  return readBounded(response.body,2*1024*1024);
 }
 throw new MediaError(422,'provider_avatar_unavailable');
}
async function storeImage(env:Env,token:string,kind:'avatar'|'content',bytes:Uint8Array){
 const type=imageType(bytes);
 const asset=await api<Asset>(env,token,'/rest/v1/rpc/omni_reserve_media',{media_kind:kind,media_bytes:bytes.length,media_extension:type.extension});
 await env.MEDIA.put(asset.object_key,bytes,{httpMetadata:{contentType:type.mime,cacheControl:'public, max-age=86400'},customMetadata:{kind}});
 return asset.object_key;
}
async function handle(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const url=new URL(request.url),origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGINS.split(',').includes(origin??'');
 if(request.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:allowed?{'Access-Control-Allow-Origin':origin!,'Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Profile-Settings','Access-Control-Max-Age':'600','Vary':'Origin'}:{}});
 if(['GET','HEAD'].includes(request.method)&&objectPath.test(url.pathname)){
  const file=await env.MEDIA.get(url.pathname.slice(1));if(!file)return new Response('Not found',{status:404});
  const headers=new Headers({'Content-Type':file.httpMetadata?.contentType??'application/octet-stream','Content-Length':String(file.size),'Cache-Control':'public, max-age=86400','ETag':file.httpEtag,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Access-Control-Allow-Origin':'*'});
  if(request.headers.get('If-None-Match')===file.httpEtag)return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:file.body,{headers});
 }
 if(url.pathname==='/health'&&request.method==='GET')return Response.json({ok:true});
 if(request.method!=='POST'||!['/v1/profile','/v1/images'].includes(url.pathname))throw new MediaError(404,'not_found');
 if(!allowed)throw new MediaError(403,'origin_not_allowed');
 const token=request.headers.get('Authorization')??'';if(!/^Bearer [\w.-]+$/.test(token))throw new MediaError(401,'login_required');
 const user=await api<User>(env,token,'/auth/v1/user');
 const profiles=await api<Profile[]>(env,token,`/rest/v1/omni_profiles?id=eq.${encodeURIComponent(user.id)}&select=id,display_name,avatar_key,avatar_source,updated_at,disabled`),profile=profiles[0];
 if(!profile||profile.disabled)throw new MediaError(403,'account_disabled');
 if(!(await env.UPLOAD_LIMITER.limit({key:user.id})).success)throw new MediaError(429,'upload_limit');
 if(url.pathname==='/v1/images'){
  const bytes=await readBounded(request.body,4*1024*1024),key=await storeImage(env,token,'content',bytes);
  return Response.json({url:`${env.MEDIA_ORIGIN}/${key}`});
 }
 const header=request.headers.get('X-Profile-Settings');if(!header||header.length>3000)throw new MediaError(400,'invalid_profile');
 let settings:Settings;try{settings=JSON.parse(decodeURIComponent(header));}catch{throw new MediaError(400,'invalid_profile');}
 const mode=settings.mode??'keep';if(!['keep','custom','provider','none'].includes(mode)||typeof settings.expected_updated_at!=='string')throw new MediaError(400,'invalid_profile');
 if(settings.automatic&&(profile.avatar_key||profile.avatar_source!=='provider'))return Response.json({profile});
 if(settings.expected_updated_at!==profile.updated_at)throw new MediaError(409,'profile_conflict');
 const name=settings.automatic?profile.display_name:settings.display_name;
 if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[\u0000-\u001f\u007f]/.test(name))throw new MediaError(400,'invalid_profile');
 let uploaded:string|null=null;
 try{
  if(mode==='custom'||mode==='provider'){const bytes=mode==='custom'?await readBounded(request.body,2*1024*1024):await importedAvatar(user);uploaded=await storeImage(env,token,'avatar',bytes);}
  const updated=await api<Profile>(env,token,'/rest/v1/rpc/omni_save_profile',{new_name:name.trim(),new_avatar_key:uploaded,new_source:mode,expected_updated_at:settings.expected_updated_at});
  if(mode!=='keep'&&profile.avatar_key&&profile.avatar_key!==updated.avatar_key){const old=profile.avatar_key;if(old.startsWith(`avatars/${user.id}/`))ctx.waitUntil(env.MEDIA.delete(old).catch(()=>console.error('avatar_cleanup_failed')));}
  return Response.json({profile:updated});
 }catch(error){
  // A lost RPC response can follow a committed save. Confirm ownership before cleanup;
  // on an ambiguous database failure retain the object instead of deleting a live avatar.
  if(uploaded){const key=uploaded;ctx.waitUntil((async()=>{
   const latest=await api<Profile[]>(env,token,`/rest/v1/omni_profiles?id=eq.${encodeURIComponent(user.id)}&select=avatar_key`);
   if(latest[0]&&latest[0].avatar_key!==key)await env.MEDIA.delete(key);
  })().catch(()=>console.error('avatar_rollback_deferred')));}
  throw error;
 }
}
export default {
 async fetch(request,env,ctx){
  let response:Response;
  try{response=await handle(request,env,ctx);}catch(error){const known=error instanceof MediaError;if(!known)console.error('media_request_failed');response=Response.json({error:known?error.code:'upload_failed'},{status:known?error.status:500});}
  const origin=request.headers.get('Origin');if(origin&&env.ALLOWED_ORIGINS.split(',').includes(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');}
  if(new URL(request.url).pathname.startsWith('/v1/'))response.headers.set('Cache-Control','no-store');
  response.headers.set('X-Content-Type-Options','nosniff');return response;
 }
} satisfies ExportedHandler<Env>;
