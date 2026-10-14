'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import {FiArrowLeft,FiPlus} from 'react-icons/fi';
import {useApp} from './Provider';
import {UserIdentity} from './Avatar';
import {ContentManagement} from './ContentManagement';
import {RichText} from './RichText';
import {ThreadReplies} from './ThreadReplies';
import {QuoteCard} from './SocialActions';
import {ExternalContent} from './ExternalContent';
import {ArticleActions,ArticleFeed} from '@/modules/news/NewsExperience';
import {articleText} from '@/lib/content';
import {contentHref} from '@/lib/content-href';
import {contentMedia} from '@/lib/external-content';
import {threadCopy} from '@/lib/thread-copy';
import {chinaCopy} from '@/lib/chinateam-copy';
import {socialCopy} from '@/lib/social-copy';
import type {Article} from '@/lib/types';

export function PostThreadReader({article,onChange,failed}:{article:Article;onChange:()=>void;failed:boolean}){
 const{db,locale,t,user,profile,settings,authStatus,contentVersion,rememberArticles,articles}=useApp(),c=threadCopy[locale],ct=chinaCopy[locale],router=useRouter();
 const[state,setState]=useState<{id:string;rows:Article[];loading:boolean;error:boolean}>({id:'',rows:[],loading:false,error:false}),[retry,setRetry]=useState(0),[showQuotes,setShowQuotes]=useState(false);
 useEffect(()=>{setShowQuotes(false);},[article.id]);
 useEffect(()=>{if(!db||!article.thread_id)return;let active=true;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);setState({id:article.id,rows:[],loading:true,error:false});
  void(async()=>{try{const{data,error}=await db.rpc('omni_post_thread',{target_article:article.id}).abortSignal(abort.signal);if(error)throw error;if(active){const rows=(data??[]) as Article[];setState({id:article.id,rows,loading:false,error:false});rememberArticles(rows);}}catch{if(active)setState({id:article.id,rows:[],loading:false,error:true});}finally{clearTimeout(timer);}})();return()=>{active=false;abort.abort();clearTimeout(timer);};
 },[db,article.id,article.thread_id,article.updated_at,contentVersion,user?.id,authStatus,retry,rememberArticles]);
 const rows=article.thread_id&&state.id===article.id&&state.rows.length?state.rows:[article],thread=!!article.thread_id;
 const canContinue=authStatus==='ready'&&user?.id===article.author_id&&!!profile&&!profile.disabled&&(settings.ugc_enabled||profile.role!=='member')&&rows.every(p=>p.status==='published'&&!p.locked&&!p.moderated)&&(rows.at(-1)?.thread_position??1)<100;
 const refresh=()=>{setRetry(n=>n+1);onChange();};
 useEffect(()=>{if(!thread||state.loading||state.id!==article.id)return;const hash=window.location.hash,target=hash==='#comments'?document.getElementById('comments'):rows[0]?.id!==article.id?document.getElementById('post-'+article.id):null;if(target)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));},[article.id,state.loading,state.id,thread]);
 return <main id="main" className="article-page content-wrap post-detail"><div className="detail-topline"><Link className="back-link" href={`/${locale}/`}><FiArrowLeft/>{thread?c.thread:ct.post}</Link><span className="thread-reading-count">{thread&&rows.length>1?`${rows.length} ${c.part}`:''}</span></div><h1 className="sr-only">{thread?c.thread:ct.post}</h1>
  {(failed||state.error&&state.id===article.id)&&<p className="inline-error" role="alert">{t.connectionError}<button onClick={refresh}>{t.retry}</button></p>}
  {thread&&state.loading&&<p className="form-note" role="status">{t.loading}</p>}
  <div className={thread?'post-thread-list':''}>{rows.map((part,index)=>{const text=articleText(part,locale),live=articles.find(a=>a.id===part.id)??part,selected=part.id===article.id;
   return <section key={part.id} id={'post-'+part.id} className={`post-thread-part ${selected?'is-selected':''}`} aria-label={`${c.part} ${part.thread_position??1}`}>
    {thread&&(part.thread_position??1)>(index===0?1:(rows[index-1].thread_position??0)+1)&&<p className="thread-gap">{c.gap}</p>}
    <div className="article-heading"><div className="byline"><UserIdentity id={part.author_id} name={part.author_name??t.editor} avatarKey={part.author_avatar_key} handle={part.author_handle} size={44}/><span className="thread-part-number">{thread?part.thread_position:''}</span><ContentManagement article={part} onChange={refresh} onDeleted={()=>{if(selected){const next=rows.find(r=>r.id!==part.id);router.push(next?contentHref(next,locale):`/${locale}/`);}else refresh();}}/></div></div>
    <div className="article-body"><RichText text={text} gallery/>{contentMedia(undefined,text.body).filter(item=>item.type==='embed'&&!JSON.stringify(text.document??{}).includes(item.url)).slice(0,4).map(item=><ExternalContent key={item.url} url={item.url}/>)}{part.has_quote&&<QuoteCard article={part.quoted_article}/>}
     <Link className="post-timestamp" href={contentHref(part,locale)} aria-label={c.read}><time dateTime={part.published_at??part.created_at}>{new Date(part.published_at??part.created_at).toLocaleString(locale,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></Link>
     {selected&&<div className="post-statistics"><span><b>{live.like_count??0}</b> {t.likes}</span><span><b>{live.repost_count??0}</b> {ct.repost}</span><button onClick={()=>setShowQuotes(v=>!v)} aria-expanded={showQuotes}><b>{part.quote_count??0}</b> {ct.quotes}</button><a href="#comments"><b>{live.comment_count??0}</b> {socialCopy[locale].replies}</a></div>}
     <div className="article-bottom"><ArticleActions article={part}/>{thread&&<Link className="thread-reply-link" href={`${contentHref(part,locale)}#comments`}>{c.reply}</Link>}</div>
    </div>
   </section>;
  })}</div>
  {canContinue&&<Link className="thread-continue text-link" href={`/${locale}/write/?append=${article.id}`}><FiPlus/>{c.continue}</Link>}
  <div className="thread-discussion article-body">{thread&&<div className="thread-discussion-label">{c.reply} · {article.thread_position}</div>}{showQuotes&&<section className="quote-results"><h2>{ct.quotes}</h2><ArticleFeed kind="post" hideToolbar quoteFilter={article.id}/></section>}<ThreadReplies key={article.id} article={article}/></div>
 </main>;
}
