'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {FiRefreshCw} from 'react-icons/fi';
import {Overview,type OverviewData} from './Overview';
const AuditTable=dynamic(()=>import('./AuditTable').then(m=>m.AuditTable));
import {marketCopy} from '@/modules/wallet/market-copy';
const MarketAdmin=dynamic(()=>import('@/modules/wallet/C2CAdmin').then(m=>m.C2CAdmin));
import {walletCopy} from '@/modules/wallet/copy';
const WalletAdmin=dynamic(()=>import('@/modules/wallet/WalletAdmin').then(m=>m.WalletAdmin));
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {AccountGate} from '@/components/AccountGate';
import {ContentManagement} from '@/components/ContentManagement';
import {CommentEditor,type CommentValue} from '@/components/CommentEditor';
import {RichText} from '@/components/RichText';
import {UserIdentity} from '@/components/Avatar';
import {Categories} from './Categories';
import {Monitoring} from './Monitoring';
import {adminCopy} from '@/lib/admin-copy';
import {forumCopy} from '@/lib/forum-copy';
import {experienceCopy} from '@/lib/experience-copy';
import {normalizeDocument,plainDocument} from '@/lib/rich-content';
import {articleText} from '@/lib/content';
import {useDebounce} from '@/lib/use-content-feed';
import type {Article,Profile,Comment} from '@/lib/types';
import './admin.css';
type Tab='dashboard'|'posts'|'articles'|'moderation'|'members'|'categories'|'settings'|'audit'|'monitor'|'wallet'|'market';
type Audit={id:number;actor_id:string;action:string;target:string;created_at:string};
export function Admin(){
 const {authStatus,profile,user,t,setAuthOpen}=useApp();
 if(authStatus!=='ready')return <AccountGate/>;
 if(!profile||profile.disabled||profile.role==='member')return <main id="main" className="empty-state protected"><h1>{t.adminOnly}</h1>{!user&&<button className="button primary" onClick={()=>setAuthOpen(true)}>{t.login}</button>}</main>;
 // Private admin data never survives a user or permission change.
 return <AdminWorkspace key={`${user?.id}:${profile.role}`}/>;
}
function AdminWorkspace(){
 const{t,db,demo,profile,user,locale,notify,settings,refresh,online,contentVersion,categories,categoryName}=useApp(),c=forumCopy[locale],x=experienceCopy[locale],a=adminCopy[locale],owner=profile?.role==='super_admin';
 const[tab,setTab]=useState<Tab>('dashboard'),[articles,setArticles]=useState<Article[]>([]),[members,setMembers]=useState<Profile[]>([]),[comments,setComments]=useState<Comment[]>([]),[audit,setAudit]=useState<Audit[]>([]),[overview,setOverview]=useState<OverviewData|null>(null);
 const[busy,setBusy]=useState(false),[mutating,setMutating]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[status,setStatus]=useState('all'),[category,setCategory]=useState('all'),[query,setQuery]=useState('');const search=useDebounce(query);
 const[editing,setEditing]=useState<Comment|null>(null),[comment,setComment]=useState<CommentValue>({body:'',document:plainDocument('')}),[notice,setNotice]=useState(settings.notice),[allowComments,setAllowComments]=useState(settings.comments_enabled),[allowPosts,setAllowPosts]=useState(settings.ugc_enabled),[settingsVersion,setSettingsVersion]=useState(settings.updated_at);
 const request=useRef(0),controller=useRef<AbortController|null>(null),mutation=useRef(false),settingsDirty=useRef(false);
 useEffect(()=>{if(settingsDirty.current)return;setNotice(settings.notice);setAllowComments(settings.comments_enabled);setAllowPosts(settings.ugc_enabled);setSettingsVersion(settings.updated_at);},[settings]);
 const load=useCallback(async()=>{
  if(!db)return;const seq=++request.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),15000);setBusy(true);setError('');
  try{
   if(tab==='settings'||tab==='monitor'||tab==='wallet'||tab==='market')return;
   if(tab==='dashboard'||tab==='categories'){const result=await db.rpc('omni_admin_overview').abortSignal(abort.signal);if(result.error)throw result.error;if(seq===request.current)setOverview(result.data);return;}
   let rows:unknown[];
   if(tab==='posts'||tab==='articles'){const result=await db.rpc('omni_admin_content',{content_kind:tab==='posts'?'post':'news',filter_status:status,filter_category:category,filter_query:search,offset_rows:page*50}).abortSignal(abort.signal);if(result.error)throw result.error;rows=result.data??[];}
   else {const table=tab==='members'?'omni_profiles':tab==='moderation'?'omni_comments':'omni_audit';let q=db.from(table).select(tab==='moderation'?'*,article:omni_articles(content_type)':'*');if(tab==='moderation')q=q.eq('deleted',false);if(search&&(tab==='members'||tab==='moderation'))q=q.ilike(tab==='members'?'display_name':'body',`%${search.replace(/[\\%_]/g,'\\$&')}%`);const result=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+50).abortSignal(abort.signal);if(result.error)throw result.error;rows=result.data??[];
    if(tab==='moderation'&&rows.length){const ids=[...new Set((rows as Comment[]).map(r=>r.user_id))];const names=await db.rpc('omni_public_profiles',{profile_ids:ids}).abortSignal(abort.signal);if(names.error)throw names.error;rows=(rows as Comment[]).map(r=>{const p=(names.data as Profile[]).find(p=>p.id===r.user_id);return {...r,display_name:p?.display_name,avatar_key:p?.avatar_key};});}
   }
   if(seq!==request.current)return;setHasMore(rows.length>50);rows=rows.slice(0,50);if(tab==='members')setMembers(rows as Profile[]);else if(tab==='moderation')setComments(rows as Comment[]);else if(tab==='audit')setAudit(rows as Audit[]);else setArticles(rows as Article[]);
  }catch{if(seq===request.current)setError(x.connection);}finally{clearTimeout(timer);if(seq===request.current)setBusy(false);}
 },[db,tab,page,status,category,search,contentVersion,x.connection]);
 useEffect(()=>{void load();return()=>{++request.current;controller.current?.abort();};},[load]);
 function select(value:Tab){setTab(value);setPage(0);setStatus('all');setCategory('all');setQuery('');setArticles([]);setMembers([]);setComments([]);setAudit([]);setEditing(null);setError('');setHasMore(false);}
 async function mutate(action:()=>Promise<void>){if(mutation.current||!online||!db)return;mutation.current=true;setMutating(true);setError('');try{await action();notify(t.saved);await load();void refresh();}catch(e){setError((e as {code?:string}).code==='PT409'?a.settingsConflict:t.error);}finally{mutation.current=false;setMutating(false);}}
 function changeUser(p:Profile,role:string,disabled:boolean){void mutate(async()=>{const{error}=await db!.rpc('omni_manage_user',{target_user:p.id,new_role:role,new_disabled:disabled});if(error)throw error;});}
 function deleteComment(id:string){if(!confirm(t.confirmDelete))return;void mutate(async()=>{const{error}=await db!.rpc('omni_remove_comment',{target_comment:id});if(error)throw error;});}
 async function saveComment(){if(!editing||!comment.body.trim()||comment.body.length>2000||mutation.current||!db||!online)return;mutation.current=true;setMutating(true);try{let q=db.from('omni_comments').update({body:comment.body.trim(),document:normalizeDocument(comment.document,comment.body,true)}).eq('id',editing.id);if(editing.updated_at)q=q.eq('updated_at',editing.updated_at);const{error}=await q.select('id').single();if(error){setError(error.code==='PGRST116'?x.conflict:t.error);return;}setEditing(null);notify(t.saved);await load();void refresh();}catch{setError(t.error);}finally{mutation.current=false;setMutating(false);}}
 function saveSettings(e:React.FormEvent){e.preventDefault();if(!owner||!settingsVersion)return;void mutate(async()=>{const{data,error}=await db!.rpc('omni_save_settings',{new_notice:notice,new_comments:allowComments,new_posts:allowPosts,expected_updated_at:settingsVersion});if(error)throw error;settingsDirty.current=false;setSettingsVersion(data.updated_at);});}
 const label=(value:Tab)=>value==='market'?marketCopy[locale].admin:value==='wallet'?walletCopy[locale].admin:value==='posts'?c.posts:value==='articles'?c.news:value==='categories'||value==='monitor'?a[value]:t[value];
 const contentTab=tab==='posts'||tab==='articles',listTab=contentTab||tab==='moderation'||tab==='members'||tab==='audit';
 const count=(kind:'post'|'news',state?:string)=>overview?.content.filter(r=>r.content_type===kind&&(!state||r.status===state)).reduce((n,r)=>n+Number(r.count),0)??'—';
 return <main id="main" className="admin-shell content-wrap"><aside className="admin-sidebar"><h1>{t.admin}</h1><nav>{(['dashboard','posts','articles','moderation',...(owner?['members','categories','settings','audit','monitor','wallet','market']:[])] as Tab[]).map(key=><button className={tab===key?'active':''} aria-current={tab===key?'page':undefined} key={key} disabled={mutating} onClick={()=>select(key)}>{label(key)}</button>)}</nav></aside><div className="admin-content"><div className="page-heading"><h2>{label(tab)}</h2>{contentTab&&<Link className="button primary" href={`/${locale}/write/?kind=${tab==='posts'?'post':'news'}`}>{tab==='posts'?c.write:c.newNews}</Link>}</div>
 {(contentTab||tab==='moderation'||tab==='members')&&<div className="admin-toolbar"><input type="search" aria-label={contentTab?a.search:tab==='moderation'?a.commentSearch:a.memberSearch} placeholder={contentTab?a.search:tab==='moderation'?a.commentSearch:a.memberSearch} value={query} maxLength={120} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>{contentTab&&<><select aria-label={x.status} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">{x.allStatus}</option>{(['draft','published','archived'] as const).map(s=><option key={s} value={s}>{t[s]}</option>)}</select><select aria-label={t.category} value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="all">{a.allCategories}</option>{categories.map(c=><option key={c.key} value={c.key}>{categoryName(c.key)}</option>)}</select></>}</div>}
 {error&&<p className="inline-error" role="alert">{error}{tab!=='settings'&&<button onClick={()=>void load()}>{t.retry}</button>}</p>}{!online&&<p className="form-note">{x.offline}</p>}
 {tab==='dashboard'&&<>{overview?<><Overview data={overview} owner={owner} onSelect={(value,state)=>{select(value);if(state)setStatus(state);}}/><div className="admin-toolbar"><small>{a.sampled} <time dateTime={overview.sampled_at}>{new Date(overview.sampled_at).toLocaleString(locale)}</time></small><button className="button small data-refresh" disabled={busy||!online} onClick={()=>void load()}><FiRefreshCw aria-hidden="true"/>{busy?t.loading:a.refresh}</button></div></>:busy&&<p role="status">{t.loading}</p>}</>}
 {tab==='categories'&&<Categories usage={overview?.categories??{}} onSaved={()=>void load()}/>}
 {tab==='monitor'&&<Monitoring/>}
 {tab==='wallet'&&owner&&<WalletAdmin/>}{tab==='market'&&owner&&<MarketAdmin/>}
 {busy&&listTab?<div className="skeleton-list" role="status" aria-label={t.loading}><i/><i/></div>:<>
 {contentTab&&<div className="admin-article-list">{articles.length?articles.map(row=><article key={row.id}><div><Link href={`/${locale}/${row.content_type==='post'?'community/':'news/'}?id=${row.id}`}><h3>{articleText(row,locale).title||articleText(row,locale).body.slice(0,100)||articleText(row,locale).summary||c.post}</h3></Link><p>{row.author_name} · {t[row.status]} · {categoryName(row.category)}{row.locked?` · ${c.lock}`:''}{row.featured?` · ${c.pin}`:''}</p></div><ContentManagement expanded article={row} onChange={()=>void load()} onDeleted={()=>void load()}/></article>):<p className="empty-state">{x.empty}</p>}</div>}
 {tab==='moderation'&&<div className="moderation-list">{comments.length?comments.map(row=><article key={row.id}><UserIdentity id={row.user_id} name={row.display_name??row.user_id} avatarKey={row.avatar_key}/>{editing?.id===row.id?<div className="comment-edit"><CommentEditor value={comment} onChange={setComment} disabled={mutating||!online}/><div className="composer-actions"><button className="button small" disabled={mutating||!online||!comment.body.trim()||comment.body.length>2000} onClick={()=>void saveComment()}>{t.save}</button><button className="text-link" disabled={mutating} onClick={()=>setEditing(null)}>{t.cancel}</button></div></div>:<RichText text={{body:row.body,document:row.document??undefined}} compact/>}<div className="moderation-meta"><time>{new Date(row.created_at).toLocaleString(locale)}</time><Link className="text-link" href={`/${locale}/${row.article?.content_type==='post'?'community/':'news/'}?id=${row.article_id}`}>{c.read}</Link><button className="text-link" disabled={mutating} onClick={()=>{setEditing(row);setComment({body:row.body,document:normalizeDocument(row.document,row.body,true)});}}>{t.edit}</button><button className="text-link danger" disabled={mutating||!online} onClick={()=>deleteComment(row.id)}>{t.delete}</button></div></article>):<p className="empty-state">{x.empty}</p>}</div>}
 {tab==='members'&&<div className="member-list">{members.length?members.map(p=><article key={p.id}><div><UserIdentity id={p.id} name={p.display_name} avatarKey={p.avatar_key}/><small>@{p.handle}</small></div><select aria-label={`${p.display_name} ${t.role}`} value={p.role} disabled={mutating||!online||p.role==='super_admin'||p.id===user?.id} onChange={e=>changeUser(p,e.target.value,p.disabled)}><option value="member">{t.member}</option><option value="editor">{t.editorRole}</option>{p.role==='super_admin'&&<option value="super_admin">{t.super_admin}</option>}</select><button className="button small" disabled={mutating||!online||p.role==='super_admin'||p.id===user?.id} onClick={()=>changeUser(p,p.role,!p.disabled)}>{p.disabled?t.suspended:t.active}</button></article>):<p className="empty-state">{x.empty}</p>}</div>}
 {tab==='audit'&&<><p className="form-note">{a.auditNote}</p><AuditTable rows={audit}/></>}
 </>}
 {tab==='settings'&&<form className="settings-form" onSubmit={saveSettings}><label htmlFor="site-notice">{t.notice}</label><textarea id="site-notice" maxLength={500} value={notice} onChange={e=>{settingsDirty.current=true;setNotice(e.target.value);}} disabled={mutating}/><label className="checkbox-label"><input type="checkbox" checked={allowComments} onChange={e=>{settingsDirty.current=true;setAllowComments(e.target.checked);}} disabled={mutating}/>{t.commentsEnabled}</label><label className="checkbox-label"><input type="checkbox" checked={allowPosts} onChange={e=>{settingsDirty.current=true;setAllowPosts(e.target.checked);}} disabled={mutating}/>{c.toggleUGC}</label><div className="composer-actions"><button className="button primary" disabled={mutating||!online||!settingsVersion}>{mutating?t.loading:t.save}</button><button type="button" className="text-link" disabled={mutating||!online} onClick={()=>{settingsDirty.current=false;setNotice(settings.notice);setAllowComments(settings.comments_enabled);setAllowPosts(settings.ugc_enabled);setSettingsVersion(settings.updated_at);setError('');void refresh();}}>{a.reloadSettings}</button></div></form>}
 {listTab&&(page>0||hasMore)&&<div className="pagination"><button className="button" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>{t.previous}</button><span>{page+1}</span><button className="button" disabled={busy||!hasMore} onClick={()=>setPage(p=>p+1)}>{t.next}</button></div>}{demo&&<p className="form-note">{t.setup}</p>}</div></main>;
}
