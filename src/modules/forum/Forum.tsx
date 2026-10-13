'use client';
import {Suspense} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {useApp} from '@/components/Provider';
import {AccountGate} from '@/components/AccountGate';
import {ArticleDetail,ArticleFeed} from '@/modules/news/NewsExperience';
import {socialCopy} from '@/lib/social-copy';
import {forumCopy} from '@/lib/forum-copy';
import {shellCopy} from '@/lib/shell-copy';
import type {FeedFilters} from '@/lib/use-content-feed';
export function ForumPage(){const{locale}=useApp();return <Suspense fallback={<main id="main" className="forum-stream"><h1 className="sr-only">{forumCopy[locale].forum}</h1></main>}><Forum/></Suspense>;}
function Forum(){
 const{locale,t,user,authStatus,setAuthOpen,categoryName}=useApp(),params=useSearchParams(),router=useRouter(),c=forumCopy[locale],s=socialCopy[locale],x=shellCopy[locale];const id=params.get('id');
 const selection:FeedFilters={category:/^[a-z][a-z0-9-]{0,39}$/.test(params.get('category')??'')?params.get('category')!:'all',query:'',sort:params.get('sort')==='popular'?'popular':'latest',mine:params.get('scope')==='mine',following:params.get('scope')==='following'};
 function filter(patch:Partial<FeedFilters>){const next={...selection,...patch},p=new URLSearchParams();if(next.category!=='all')p.set('category',next.category);if(next.sort!=='latest')p.set('sort',next.sort);if(next.mine)p.set('scope','mine');else if(next.following)p.set('scope','following');router.push(`/${locale}/${p.size?'?'+p:''}`);}
 if(id)return <ArticleDetail id={id} expectedType="post"/>;
 return <main id="main" className="forum-stream"><h1 className="sr-only">{c.forum}</h1><div className="stream-tabs"><button aria-pressed={!selection.following&&!selection.mine} onClick={()=>filter({mine:false,following:false})}>{s.all}</button><button aria-pressed={!!selection.following} onClick={()=>{if(!user){setAuthOpen(true);return;}filter({mine:false,following:true});}}>{s.following}</button>{selection.mine&&<span>{c.mine}</span>}<select aria-label={x.sort} value={selection.sort} onChange={e=>filter({sort:e.target.value})}><option value="latest">{x.newest}</option><option value="popular">{x.popular}</option></select></div>{selection.category!=='all'&&<div className="stream-filter"><span>{categoryName(selection.category)}</span><button onClick={()=>filter({category:'all'})} aria-label={t.clear}>×</button></div>}{(selection.mine||selection.following)&&authStatus!=='ready'?<AccountGate embedded/>:(selection.mine||selection.following)&&!user?<div className="empty-state"><button className="button" onClick={()=>setAuthOpen(true)}>{t.login}</button></div>:<ArticleFeed kind="post" hideToolbar controls={{value:selection,onChange:filter}}/>}</main>;
}
