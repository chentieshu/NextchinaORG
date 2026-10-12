'use client';
import {Suspense,useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {useApp} from '@/components/Provider';
import {Carousel} from '@/components/Carousel';
import {ArticleDetail,ArticleFeed} from '@/modules/news/NewsExperience';
import {forumCopy} from '@/lib/forum-copy';
import {experienceCopy} from '@/lib/experience-copy';
function Query({change}:{change:(id:string,q:string,category:string)=>void}){const params=useSearchParams();useEffect(()=>change(params.get('id')??'',params.get('q')??'',params.get('category')??'all'),[params,change]);return null;}
export function ForumPage(){
 const{locale,t,articles,user,profile,authStatus,setAuthOpen,settings,demo}=useApp(),c=forumCopy[locale];
 const [selection,setSelection]=useState({id:'',q:'',category:'all'});
 const change=useCallback((id:string,q:string,category:string)=>setSelection({id,q,category}),[]);
 return <><Suspense><Query change={change}/></Suspense>{selection.id?<ArticleDetail id={selection.id} expectedType="post"/>:<main id="main" className="forum-page content-wrap"><div className="page-heading"><div><h1>{c.forum}</h1><p>{experienceCopy[locale].forumIntro}</p></div><button className="button primary" disabled={authStatus==='loading'||!!profile?.disabled||!settings.ugc_enabled||demo} onClick={()=>{if(!user){setAuthOpen(true);return;}window.location.href=`/${locale}/write/`;}}>{c.write}</button></div><Carousel articles={articles.filter(a=>a.content_type==='post')}/><ArticleFeed kind="post" initialQuery={selection.q} initialCategory={selection.category}/>{!settings.ugc_enabled&&<p className="form-note">{c.closed}</p>}<p className="purpose-note">{locale==='zh-CN'?'新闻由管理员发布，论坛向所有成员开放。':c.rulesText} <Link href={`/${locale}/about/#guidelines`}>{t.guidelines}</Link></p></main>}</>;
}
