'use client';
import Link from 'next/link';
import {Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {FiBookmark,FiChevronDown,FiEdit3,FiHash,FiMessageSquare,FiSettings,FiSliders,FiUser} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {AccountGate} from '@/components/AccountGate';
import {ArticleDetail,ArticleFeed} from '@/modules/news/NewsExperience';
import {socialCopy} from '@/lib/social-copy';
import {forumCopy,forumNavigationCopy} from '@/lib/forum-copy';
import {contentCategories,type FeedFilters} from '@/lib/use-content-feed';
import './forum.css';

type Selection=FeedFilters&{id:string};
const initial:Selection={id:'',query:'',category:'all',sort:'latest',mine:false};
function Query({change}:{change:(selection:Selection)=>void}){
 const params=useSearchParams();
 useEffect(()=>change({id:params.get('id')??'',query:(params.get('q')??'').slice(0,120),category:contentCategories.find(c=>c===params.get('category'))??'all',sort:params.get('sort')==='popular'?'popular':'latest',mine:params.get('scope')==='mine',following:params.get('scope')==='following'}),[params,change]);
 return null;
}

export function ForumPage(){
 const{locale,t,user,profile,authStatus,setAuthOpen,settings,demo}=useApp(),c=forumCopy[locale],s=forumNavigationCopy[locale],social=socialCopy[locale];
 const[selection,setSelection]=useState<Selection>(initial),[menuOpen,setMenuOpen]=useState(false);
 const menuToggle=useRef<HTMLButtonElement>(null);
 const change=useCallback((value:Selection)=>setSelection(value),[]);
 function filter(patch:Partial<FeedFilters>){
  const next={...selection,...patch};setSelection(next);
  const params=new URLSearchParams();
  if(next.query)params.set('q',next.query);
  if(next.category!=='all')params.set('category',next.category);
  if(next.sort!=='latest')params.set('sort',next.sort);
  if(next.mine)params.set('scope','mine');else if(next.following)params.set('scope','following');
  const url=`/${locale}/${params.size?'?'+params.toString():''}`;
  if(Object.keys(patch).length===1&&'query' in patch)window.history.replaceState(null,'',url);else{window.history.pushState(null,'',url);if(menuOpen)menuToggle.current?.focus({preventScroll:true});setMenuOpen(false);}
 }
 const admin=!!profile&&!profile.disabled&&profile.role!=='member';
 const current=selection.mine?c.mine:selection.following?social.following:selection.category==='all'?c.all:t[selection.category as keyof typeof t];
 return <><Suspense><Query change={change}/></Suspense>{selection.id?<ArticleDetail id={selection.id} expectedType="post"/>:
  <main id="main" className="forum-page forum-layout content-wrap">
   <aside className="forum-sidebar" aria-label={s.navigation} data-open={menuOpen} onKeyDown={e=>{if(e.key==='Escape'&&menuOpen){setMenuOpen(false);menuToggle.current?.focus();}}}>
    <button ref={menuToggle} className="forum-menu-toggle" aria-expanded={menuOpen} aria-controls="forum-navigation" onClick={()=>setMenuOpen(!menuOpen)}><FiSliders/><span>{s.filters}</span><span className="forum-menu-current">{current}</span><FiChevronDown/></button>
    <nav id="forum-navigation" aria-label={s.navigation}>
     <div className="forum-nav-group">
      <button aria-pressed={!selection.mine&&!selection.following&&selection.category==='all'} onClick={()=>filter({mine:false,following:false,category:'all',query:''})}><FiMessageSquare/>{c.all}</button>
      {user&&<><button aria-pressed={!!selection.following} onClick={()=>filter({mine:false,following:true,category:'all',query:''})}><FiUser/>{social.following}</button><Link href={`/${locale}/profile/?id=${user.id}`}><FiUser/>{social.profile}</Link><Link href={`/${locale}/settings/`}><FiSettings/>{social.settings}</Link><button aria-pressed={selection.mine} onClick={()=>filter({mine:true,following:false,category:'all',query:''})}><FiUser/>{c.mine}</button><Link href={`/${locale}/bookmarks/`}><FiBookmark/>{t.bookmarks}</Link></>}
     </div>
     <div className="forum-nav-group forum-topics"><h2>{t.category}</h2>{contentCategories.filter(value=>value!=='all').map(value=><button key={value} aria-pressed={selection.category===value} onClick={()=>filter({category:value})}><FiHash/>{t[value]}</button>)}</div>
     {admin&&<div className="forum-nav-group forum-admin-link"><Link href={`/${locale}/admin/`}><FiSettings/>{t.admin}</Link></div>}
    </nav>
   </aside>
   <div className="forum-main">
    <div className="page-heading"><div><h1>{c.forum}</h1><p>{s.description}</p></div><button className="button primary" disabled={authStatus!=='ready'||!!profile?.disabled||!settings.ugc_enabled||demo} onClick={()=>{if(!user){setAuthOpen(true);return;}window.location.href=`/${locale}/write/`;}}><FiEdit3/>{c.write}</button></div>
    {(selection.mine||selection.following)&&authStatus!=='ready'?<AccountGate embedded/>:(selection.mine||selection.following)&&!user?<div className="empty-state"><h2>{current}</h2><button className="button" onClick={()=>setAuthOpen(true)}>{t.login}</button></div>:<ArticleFeed kind="post" controls={{value:selection,onChange:filter}}/>}
    {!settings.ugc_enabled&&<p className="form-note">{c.closed}</p>}
   </div>
  </main>}</>;
}
