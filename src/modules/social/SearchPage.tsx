'use client';
import Link from 'next/link';
import {Suspense,useEffect,useRef,useState} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {FiSearch} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {UserIdentity} from '@/components/Avatar';
import {ArticleCard} from '@/modules/news/NewsExperience';
import {shellCopy} from '@/lib/shell-copy';
import type {Article,Profile} from '@/lib/types';
type Result={kind:'post'|'news';article:Article}|{kind:'user';profile:Profile}|{kind:'reply';reply:{id:string;article_id:string;content_type:'post'|'news';body:string;created_at:string;user_id:string;display_name:string;handle:string;avatar_key:string|null}};
const kinds=['all','post','news','user','reply'] as const;
export function SearchPage(){return <Suspense><Search/></Suspense>;}
function Search(){
 const{db,locale,t,rememberArticles,user,contentVersion}=useApp(),c=shellCopy[locale],params=useSearchParams(),router=useRouter(),q=(params.get('q')??'').slice(0,120),kind=kinds.find(k=>k===params.get('type'))??'all';
 const[input,setInput]=useState(q),[rows,setRows]=useState<Result[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(false),[more,setMore]=useState(false),[page,setPage]=useState(0),[attempt,setAttempt]=useState(0);const seq=useRef(0),key=useRef('');
 useEffect(()=>{setInput(q);setPage(0);},[q,kind]);
 useEffect(()=>{const identity=`${user?.id??''}:${q}:${kind}:${contentVersion}`;if(key.current!==identity){key.current=identity;setRows([]);setMore(false);if(page!==0){setPage(0);return;}}if(!db||!q.trim()){setRows([]);setBusy(false);return;}const request=++seq.current,abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);setBusy(true);setError(false);
  void (async()=>{try{const{data,error}=await db.rpc('omni_search',{search_query:q,result_kind:kind,offset_rows:page*20}).abortSignal(abort.signal);if(request!==seq.current)return;if(error)throw error;const incoming=(data??[]) as Result[];setMore(incoming.length>20);setRows(old=>page?[...old,...incoming.slice(0,20)]:incoming.slice(0,20));rememberArticles(incoming.filter(r=>r.kind==='post'||r.kind==='news').map(r=>(r as {article:Article}).article));}catch{if(request===seq.current)setError(true);}finally{clearTimeout(timer);if(request===seq.current)setBusy(false);}})();
  return()=>{++seq.current;abort.abort();clearTimeout(timer);};
 },[db,q,kind,page,attempt,user?.id,contentVersion,rememberArticles]);
 function navigate(query:string,type=kind){const p=new URLSearchParams();if(query.trim())p.set('q',query.trim());if(type!=='all')p.set('type',type);router.push(`/${locale}/search/${p.size?'?'+p:''}`);}
 const label=(k:typeof kinds[number])=>k==='all'?c.all:k==='post'?c.post:k==='news'?t.news:k==='user'?c.people:c.replies;
 return <main id="main" className="search-page"><h1 className="sr-only">{c.search}</h1><form className="global-search-form" role="search" onSubmit={e=>{e.preventDefault();navigate(input);}}><FiSearch/><input type="search" aria-label={c.searchHint} placeholder={c.searchHint} maxLength={120} autoFocus value={input} onChange={e=>setInput(e.target.value)}/><button className="button small" type="submit">{c.search}</button></form><div className="search-types" role="group" aria-label={c.search}>{kinds.map(k=><button key={k} aria-pressed={kind===k} onClick={()=>navigate(q,k)}>{label(k)}</button>)}</div>{error&&<p className="inline-error" role="alert">{t.connectionError}<button onClick={()=>setAttempt(n=>n+1)}>{t.retry}</button></p>}{!q.trim()?<div className="empty-state"><p>{c.emptyQuery}</p></div>:busy&&!rows.length?<div className="skeleton-list" role="status" aria-label={t.loading}><i/><i/></div>:!rows.length&&!error?<div className="empty-state"><p>{c.searchEmpty}</p></div>:<div className="search-results">{rows.map(row=>row.kind==='user'?<article className="search-person" key={`user:${row.profile.id}`}><UserIdentity id={row.profile.id} name={row.profile.display_name} handle={row.profile.handle} avatarKey={row.profile.avatar_key} size={40}/>{row.profile.bio&&<p>{row.profile.bio}</p>}</article>:row.kind==='reply'?<article className="search-reply" key={`reply:${row.reply.id}`}><UserIdentity id={row.reply.user_id} name={row.reply.display_name} handle={row.reply.handle} avatarKey={row.reply.avatar_key}/><Link href={`/${locale}/${row.reply.content_type==='post'?'community/':'news/'}?id=${row.reply.article_id}#comments`}><small>{c.reply} · {new Date(row.reply.created_at).toLocaleDateString(locale)}</small><p>{row.reply.body}</p></Link></article>:<ArticleCard article={row.article} key={`${row.kind}:${row.article.id}`}/>)}</div>}{more&&<div className="load-more"><button className="button" disabled={busy} onClick={()=>setPage(p=>p+1)}>{busy?t.loading:t.more}</button></div>}</main>;
}
