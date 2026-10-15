'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {FiRepeat,FiEdit3,FiShare,FiX} from 'react-icons/fi';
import {useApp} from './Provider';
import {UserIdentity} from './Avatar';
import {connectedCopy} from '@/lib/connected-copy';
import {SITE_ORIGIN} from '@/lib/site';
import {chinaCopy} from '@/lib/chinateam-copy';
import {articleText} from '@/lib/content';
import {contentHref} from '@/lib/content-href';
import type {Article} from '@/lib/types';

export function QuoteCard({article,unavailable=false,onRemove,avatarOnly=false}:{article?:Article|null;unavailable?:boolean;onRemove?:()=>void;avatarOnly?:boolean}){
 const{locale}=useApp(),c=chinaCopy[locale];
 if(unavailable||!article)return <div className="quote-card quote-unavailable">{c.unavailable}{onRemove&&<button type="button" className="icon-button" aria-label={c.removeQuote} onClick={onRemove}><FiX/></button>}</div>;
 const text=articleText(article,locale);
 return <div className="quote-card"><div className="quote-main"><UserIdentity id={article.author_id} name={article.author_name} handle={article.author_handle} avatarKey={article.author_avatar_key} size={22} avatarOnly={avatarOnly}/><Link href={contentHref(article,locale)} className="quote-excerpt">{article.content_type==='news'&&<><small className="quoted-kind">{connectedCopy[locale].article}</small><strong>{text.title}</strong></>}<p>{text.summary||text.body||'…'}</p></Link></div>{article.thumbnail_url&&<Link href={contentHref(article,locale)} tabIndex={-1} aria-hidden="true"><img src={article.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer"/></Link>}{onRemove&&<button type="button" className="icon-button" aria-label={c.removeQuote} onClick={onRemove}><FiX/></button>}</div>;
}
export function RepostAction({article}:{article:Article}){
 const{locale,articles,reposted,toggleRepost,user,setAuthOpen,authStatus,online,profile}=useApp(),c=chinaCopy[locale],menu=useRef<HTMLDetailsElement>(null),pending=useRef(false),[busy,setBusy]=useState(false);
 const live=articles.find(a=>a.id===article.id)??article,has=reposted.includes(article.id),disabled=busy||!online||authStatus==='loading'||!!profile?.disabled||article.status!=='published';
 async function repost(){if(pending.current||disabled)return;pending.current=true;setBusy(true);menu.current?.removeAttribute('open');try{await toggleRepost(article.id);}finally{pending.current=false;setBusy(false);}}
 return <details ref={menu} className="repost-menu" onKeyDown={e=>{if(e.key==='Escape')menu.current?.removeAttribute('open');}}><summary aria-label={has?c.undoRepost:c.repost} title={has?c.undoRepost:c.repost} className={has?'is-reposted':''}><FiRepeat/>{!!live.repost_count&&<span>{live.repost_count}</span>}</summary><div className="repost-options"><button disabled={disabled} onClick={()=>void repost()}><FiRepeat/>{has?c.undoRepost:c.repost}</button><Link aria-disabled={disabled} href={`/${locale}/write/?quote=${article.id}`} onClick={e=>{if(disabled){e.preventDefault();return;}menu.current?.removeAttribute('open');if(!user){e.preventDefault();setAuthOpen(true);}}}><FiEdit3/>{c.quote}</Link></div></details>;
}
export function ShareAction({article}:{article:Article}){
 const{locale,t,notify}=useApp(),c=chinaCopy[locale];
 async function share(){const url=new URL(contentHref(article,locale),SITE_ORIGIN).href;try{if(navigator.share)await navigator.share({url});else{await navigator.clipboard.writeText(url);notify(t.copied);}}catch(error){if((error as {name?:string}).name!=='AbortError')notify(t.error);}}
 return <button aria-label={c.share} title={c.share} onClick={()=>void share()}><FiShare/></button>;
}

export function QuoteArticleAction({article}:{article:Article}){
 const{locale,user,setAuthOpen,authStatus,online,profile}=useApp(),c=connectedCopy[locale],disabled=!online||authStatus==='loading'||!!profile?.disabled||article.status!=='published';
 return <Link href={`/${locale}/write/?quote=${article.id}`} aria-label={c.quoteArticle} title={c.quoteArticle} aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault();else if(!user){e.preventDefault();setAuthOpen(true);}}}><FiEdit3/></Link>;
}
