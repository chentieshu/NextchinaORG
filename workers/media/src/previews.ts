import {externalContent} from '../../../src/lib/external-content';
import {imageType,readBounded,MediaError} from './image';
type Preview={provider:string;url:string;title:string;description?:string;author?:string;stars?:number;forks?:number;language?:string;thumbnail_url?:string;available:boolean};
type CachedPreview=Preview&{imageSource?:string};
const clean=(v:unknown,max=300)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
async function json(url:string,headers:Record<string,string>={}){
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'ChinaTeam-LinkPreview/1.0',...headers},redirect:'manual',signal:AbortSignal.timeout(6000)});
 if(!response.ok||response.status>=300){await response.body?.cancel();throw Error('unavailable');}
 return JSON.parse(new TextDecoder().decode(await readBounded(response.body,128*1024))) as Record<string,unknown>;
}
function spotifyImage(value:unknown){if(typeof value!=='string')return;try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname==='i.scdn.co'&&/^\/image\/[a-z0-9]+$/i.test(u.pathname))return u.href;}catch{}}
export async function previewResponse(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const query=new URL(request.url),raw=query.searchParams.get('url'),data=externalContent(raw);if(!data)throw new MediaError(400,'invalid_url');
 const thumbnail=query.pathname==='/v1/link-thumbnail',cache=caches.default,canonical=new Request(`${env.MEDIA_ORIGIN}/_cache/link-v1?url=${encodeURIComponent(data.url)}`),cached=await cache.match(canonical);
 let meta:CachedPreview;
 if(cached)meta=await cached.json();else{
  meta={provider:data.provider,url:data.url,title:data.label,available:false};
  try{
   if(data.provider==='github'&&new URL(data.url).hostname==='github.com'){
    const [owner,repo]=new URL(data.url).pathname.split('/').filter(Boolean);if(!/^[a-z0-9_.-]+$/i.test(owner)||!/^[a-z0-9_.-]+$/i.test(repo)||['.','..'].includes(owner)||['.','..'].includes(repo))throw Error('invalid');
    const r=await json(`https://api.github.com/repos/${owner}/${repo.replace(/\.git$/,'')}`,{'X-GitHub-Api-Version':'2026-03-10'});
    if(r.private!==false||r.visibility&&r.visibility!=='public')throw Error('unavailable');
    meta={...meta,title:clean(r.full_name,160)||data.label,description:clean(r.description,400),language:clean(r.language,40),stars:typeof r.stargazers_count==='number'?r.stargazers_count:0,forks:typeof r.forks_count==='number'?r.forks_count:0,available:true};
   }else if(data.provider==='youtube'&&data.id){
    const r=await json(`https://www.youtube.com/oembed?url=${encodeURIComponent(data.url)}&format=json`);
    meta={...meta,title:clean(r.title)||data.label,author:clean(r.author_name,100),imageSource:`https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,available:true};
   }else if(data.provider==='spotify'){
    const r=await json(`https://open.spotify.com/oembed?url=${encodeURIComponent(data.url)}`);
    meta={...meta,title:clean(r.title)||data.label,imageSource:spotifyImage(r.thumbnail_url),available:true};
   }
  }catch{/* Private, blocked, removed and unavailable resources all retain their original link. */}
  if(meta.imageSource)meta.thumbnail_url=`${env.MEDIA_ORIGIN}/v1/link-thumbnail?url=${encodeURIComponent(data.url)}`;
  // Short negative caching also protects provider quotas; metadata never includes oEmbed HTML.
  const response=Response.json(meta,{headers:{'Cache-Control':`public, max-age=${meta.available?3600:300}`}});
  ctx.waitUntil(cache.put(canonical,response).catch(()=>console.error('preview_cache_failed')));
 }
 if(thumbnail){
  if(!meta.imageSource)return new Response(null,{status:404});
  const key=new Request(`${env.MEDIA_ORIGIN}/_cache/link-image-v1?url=${encodeURIComponent(data.url)}`),hit=await cache.match(key);if(hit)return hit;
  // imageSource is derived only from fixed provider endpoints, never from the submitted URL.
  const source=new URL(meta.imageSource);if(!['i.ytimg.com','i.scdn.co'].includes(source.hostname)||source.protocol!=='https:'||source.port||source.username||source.password)throw new MediaError(400,'invalid_image');
  const fetched=await fetch(source.href,{redirect:'manual',signal:AbortSignal.timeout(6000)});if(!fetched.ok||fetched.status>=300){await fetched.body?.cancel();return new Response(null,{status:404});}
  const bytes=await readBounded(fetched.body,1024*1024),type=imageType(bytes),response=new Response(bytes,{headers:{'Content-Type':type.mime,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  ctx.waitUntil(cache.put(key,response.clone()).catch(()=>console.error('preview_image_cache_failed')));return response;
 }
 const{imageSource,...publicMeta}=meta;
 return Response.json(publicMeta,{headers:{'Cache-Control':`public, max-age=${meta.available?3600:300}`}});
}
