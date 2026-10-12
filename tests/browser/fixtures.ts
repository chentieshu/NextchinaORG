import type {Page} from '@playwright/test';
export const member='20000000-0000-4000-8000-000000000001',articleId='20000000-0000-4000-8000-000000000010';
export function story(id=articleId,title='一个公开帖子',extra:Record<string,any>={}){const now=new Date().toISOString();return {id,content_type:'post',author_id:member,author_name:'Test writer',category:'ai',status:'published',translations:{'zh-CN':{title,summary:'一起分享观点。',body:'这是正文。'}},original_locale:'zh-CN',cover_style:0,created_at:now,updated_at:now,published_at:now,featured:false,locked:false,moderated:false,...extra};}
export async function fixture(page:Page,role='member'){
 const state={articles:[] as Record<string,any>[],writes:[] as Record<string,any>[],comments:[] as Record<string,any>[],feeds:[] as Record<string,any>[],likes:[] as {article_id:string}[],bookmarks:[] as {article_id:string}[],settings:{id:true,notice:'',comments_enabled:true,ugc_enabled:true},profileFailures:0,profileDelay:0,queryDelay:0,conflict:false};
 const user={id:member,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 await page.addInitScript(({user})=>{const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600}))+'.mock';localStorage.setItem('sb-cznhnupwojmydttdattb-auth-token',JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));},{user});
 let clock=Date.now();
 // All authenticated requests are intercepted. These fixtures never mutate the production project.
 await page.route('https://cznhnupwojmydttdattb.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),resource=url.pathname.split('/').at(-1),method=request.method(),single=request.headers().accept?.includes('vnd.pgrst.object');let data:any=[];
  function selected(rows:Record<string,any>[]){let filtered=rows;for(const field of ['content_type','status','author_id','user_id','id','updated_at']){const match=url.searchParams.get(field);if(match?.startsWith('eq.'))filtered=filtered.filter(a=>String(a[field])===match.slice(3));}return filtered.slice(Number(url.searchParams.get('offset')??0),Number(url.searchParams.get('offset')??0)+Number(url.searchParams.get('limit')??10000));}
  function conflict(){return route.fulfill({status:406,json:{code:'PGRST116',message:'No matching record'}});}
  if(resource==='user')data=user;
  if(resource==='logout')data={};
  if(resource==='omni_profiles'){if(state.profileDelay)await new Promise(r=>setTimeout(r,state.profileDelay));if(state.profileFailures-->0)return route.fulfill({status:400,json:{message:'Account unavailable'}});data={id:member,display_name:'Test writer',role,disabled:false,created_at:user.created_at};if(!single)data=[data];}
  if(resource==='omni_settings'){if(method==='PATCH')Object.assign(state.settings,request.postDataJSON());data=state.settings;}
  if(resource==='omni_likes'||resource==='omni_bookmarks'){const rows=resource==='omni_likes'?state.likes:state.bookmarks;if(method==='POST')rows.push(request.postDataJSON());if(method==='DELETE'){const id=url.searchParams.get('article_id')?.slice(3),index=rows.findIndex(r=>r.article_id===id);if(index>=0)rows.splice(index,1);}data=rows;}
  if(resource==='omni_content_feed'){
   const params=request.postDataJSON();state.feeds.push(params);if(params.filter_query==='slow'&&state.queryDelay)await new Promise(r=>setTimeout(r,state.queryDelay));
   let rows=state.articles.filter(a=>(params.own_only?a.author_id===member:a.status==='published')&&(!params.content_kind||params.content_kind==='all'||a.content_type===params.content_kind)&&(!params.featured_only||a.featured)&&(!params.filter_category||params.filter_category==='all'||a.category===params.filter_category)&&(!params.bookmarks_only||state.bookmarks.some(b=>b.article_id===a.id))&&Object.values(a.translations).some((v:any)=>(v.title+' '+v.summary).toLowerCase().includes((params.filter_query??'').toLowerCase())));
   rows=rows.sort((a,b)=>Number(b.featured)-Number(a.featured)||(params.sort_by==='popular'?(b.like_count??0)-(a.like_count??0):0)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));const offset=params.offset_rows??0;data=rows.slice(offset,offset+(params.page_size??20)+1).map(a=>({...a,translations:Object.fromEntries(Object.entries(a.translations).map(([l,v]:any)=>[l,{title:v.title,summary:v.summary,body:''}]))}));
  }
  if(resource==='omni_rich_comments'){const p=request.postDataJSON();data=state.comments.filter(c=>c.article_id===p.target_article).slice(p.offset_rows,p.offset_rows+51);}
  if(resource==='omni_content_counts'){const p=request.postDataJSON();data=[{like_count:state.likes.filter(l=>l.article_id===p.target_article).length,comment_count:state.comments.filter(c=>c.article_id===p.target_article).length}];}
  if(resource==='omni_comments'){
   if(method==='POST'){const row={...request.postDataJSON(),id:'comment-'+(++clock),display_name:'Test writer',created_at:new Date(clock).toISOString(),updated_at:new Date(clock).toISOString()};state.comments.push(row);data=row;}
   else if(method==='PATCH'){const row=selected(state.comments)[0];if(!row||state.conflict)return conflict();Object.assign(row,request.postDataJSON(),{updated_at:new Date(++clock).toISOString()});data=row;}
   else if(method==='DELETE'){const row=selected(state.comments)[0];if(!row)return conflict();state.comments.splice(state.comments.indexOf(row),1);data=row;}
   else data=selected(state.comments).map(c=>({...c,article:{content_type:state.articles.find(a=>a.id===c.article_id)?.content_type??'post'}}));
  }
  if(resource==='omni_articles'){
   if(method==='POST'){const input=request.postDataJSON();state.writes.push(input);const row=story(articleId,'',{...input,slug:'fixture',created_at:new Date(++clock).toISOString(),updated_at:new Date(clock).toISOString(),published_at:input.status==='published'?new Date(clock).toISOString():null});state.articles.push(row);data=row;}
   else if(method==='PATCH'){const row=selected(state.articles)[0];if(!row||state.conflict)return conflict();const input=request.postDataJSON();state.writes.push(input);Object.assign(row,input,{updated_at:new Date(++clock).toISOString(),published_at:input.status==='published'?new Date(clock).toISOString():row.published_at});data=row;}
   else data=single?selected(state.articles)[0]??null:selected(state.articles);
  }
  if(resource==='settings')data={external:{email:true,google:true,github:true,x:true}};
  try{return await route.fulfill({json:data});}catch{/* A newer filter may have aborted this request. */}
 });return state;
}
