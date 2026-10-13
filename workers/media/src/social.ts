import {MediaError,readBounded} from './image';
type Account={provider:'github'|'x';provider_id:string;handle:string;url:string};
type Metric=Account&{status:'ok'|'stale'|'unavailable'|'not_synced'|'not_configured'|'partial';count:number|null;checked_at:string|null;can_sync?:boolean};
type Stored=Metric&{expires_at:number};
const day=86400000;
const numeric=/^[0-9]{1,22}$/;
export async function publicConnections(env:Env,id:string):Promise<Account[]>{
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/omni_public_connections`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({profile_ids:[id]}),signal:AbortSignal.timeout(8000)});
 if(!response.ok){await response.body?.cancel();throw new MediaError(502,'account_unavailable');}
 const rows=await response.json() as {id:string;accounts:Account[]}[];
 return [...new Map((rows.find(p=>p.id===id)?.accounts??[]).filter(a=>numeric.test(a.provider_id)&&['github','x'].includes(a.provider)).map(a=>[a.provider,a])).values()];
}
function key(account:Account){return `social-metrics/v2/${account.provider}/${account.provider_id}.json`;}
async function read(env:Env,a:Account){try{const object=await env.MEDIA.get(key(a));return object?await object.json<Stored>():null;}catch{return null;}}
async function save(env:Env,a:Account,m:Metric,ttl:number){await env.MEDIA.put(key(a),JSON.stringify({...m,expires_at:Date.now()+ttl}),{httpMetadata:{contentType:'application/json'}});}
const missing=(a:Account,status:Metric['status']='unavailable'):Metric=>({...a,status,count:null,checked_at:null});
async function json(url:string,headers:Record<string,string>,signal:AbortSignal){
 const response=await fetch(url,{headers,signal,redirect:'manual'});
 if(!response.ok){await response.body?.cancel();throw Error(`upstream_http_${response.status}`);}
 const bytes=await readBounded(response.body,4*1024*1024);
 return {data:JSON.parse(new TextDecoder().decode(bytes)),next:response.headers.get('Link')?.includes('rel="next"')??false};
}
async function github(a:Account,env:Env):Promise<Metric>{
 const signal=AbortSignal.timeout(18000),headers:Record<string,string>={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'ChinaTeam-social-metrics'};
 if(env.GITHUB_PUBLIC_TOKEN)headers.Authorization=`Bearer ${env.GITHUB_PUBLIC_TOKEN}`;
 const {data:user}=await json(`https://api.github.com/user/${a.provider_id}`,headers,signal);
 if(String(user.id)!==a.provider_id||typeof user.login!=='string'||!/^[a-zA-Z0-9-]{1,39}$/.test(user.login))throw Error('identity_mismatch');
 let stars=0;const seen=new Set<number>();const account={...a,handle:user.login,url:`https://github.com/${user.login}`};
 // A hard budget prevents one huge account monopolizing a request. Partial sums are never advertised as totals.
 for(let page=1;page<=20;page++){
  const {data:repos,next}=await json(`https://api.github.com/users/${encodeURIComponent(user.login)}/repos?type=owner&per_page=100&sort=full_name&direction=asc&page=${page}`,headers,signal);
  if(!Array.isArray(repos))throw Error('invalid_repos');
  for(const repo of repos){if(String(repo.owner?.id)!==a.provider_id||repo.private!==false||repo.fork!==false||seen.has(repo.id))continue;if(!Number.isSafeInteger(repo.id)||!Number.isSafeInteger(repo.stargazers_count)||repo.stargazers_count<0)throw Error('invalid_count');seen.add(repo.id);stars+=repo.stargazers_count;}
  if(!next){if(!Number.isSafeInteger(stars))throw Error('invalid_total');return {...account,status:'ok',count:stars,checked_at:new Date().toISOString()};}
 }
 return missing(account,'partial');
}
export async function socialMetrics(env:Env,id:string){
 const accounts=await publicConnections(env,id);
 const metrics=await Promise.all(accounts.map(async a=>{
  const stored=await read(env,a);
  if(a.provider==='x'){
   const valid=stored?.provider_id===a.provider_id&&stored.checked_at&&Date.now()-Date.parse(stored.checked_at)<day;
   return {...(valid?stored:missing(a,env.X_BEARER_TOKEN?'not_synced':'not_configured')),can_sync:!!env.X_BEARER_TOKEN};
  }
  if(stored&&stored.expires_at>Date.now())return stored;
  let result:Metric;
  try{result=await github(a,env);}catch(error){console.warn('social_metric_unavailable',{provider:'github',reason:error instanceof Error?error.message.slice(0,120):'unknown'});result=stored?.count!=null&&stored.checked_at&&Date.now()-Date.parse(stored.checked_at)<7*day?{...stored,status:'stale'}:missing(a);}
  await save(env,a,result,result.status==='ok'?6*3600000:15*60000);
  return result;
 }));
 // Recheck after upstream reads: unlinking or disabling during a slow request must hide the data.
 const latest=await publicConnections(env,id);
 return {metrics:metrics.filter(m=>latest.some(a=>a.provider===m.provider&&a.provider_id===m.provider_id)).map(({provider,provider_id,handle,url,status,count,checked_at,can_sync})=>({provider,provider_id,handle,url,status,count,checked_at,...(can_sync===undefined?{}:{can_sync})}))};
}
export async function syncX(env:Env,userId:string,token:string){
 if(!env.X_BEARER_TOKEN)throw new MediaError(503,'not_configured');
 const accounts=await publicConnections(env,userId),a=accounts.find(a=>a.provider==='x');if(!a)throw new MediaError(404,'account_unavailable');
 // Transactional database gate applies across Cloudflare locations and concurrent requests.
 const claim=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/omni_claim_x_metric_sync`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({expected_provider_id:a.provider_id}),signal:AbortSignal.timeout(8000)});
 if(!claim.ok){await claim.body?.cancel();throw new MediaError(403,'forbidden');}
 if(await claim.json()!==true)throw new MediaError(429,'sync_limit');
 const {data}=await json(`https://api.x.com/2/users/${a.provider_id}?user.fields=public_metrics`,{Authorization:`Bearer ${env.X_BEARER_TOKEN}`},AbortSignal.timeout(12000));
 const count=data.data?.public_metrics?.followers_count;
 if(data.data?.id!==a.provider_id||!Number.isSafeInteger(count)||count<0)throw new MediaError(502,'metric_unavailable');
 const current=await publicConnections(env,userId);if(!current.some(c=>c.provider==='x'&&c.provider_id===a.provider_id))throw new MediaError(409,'account_changed');
 await save(env,a,{...a,status:'ok',count,checked_at:new Date().toISOString()},day);
 return {ok:true};
}
