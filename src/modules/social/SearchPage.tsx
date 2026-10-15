'use client';
import Link from 'next/link';
import {Suspense,useEffect,useRef,useState,useTransition} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {FiSearch,FiX,FiClock,FiArrowUpLeft,FiArrowRight,FiTrash2} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {IconButton} from '@/components/IconControl';
import {Avatar,UserIdentity} from '@/components/Avatar';
import {FollowButton} from '@/components/FollowButton';
import {ArticleCard} from '@/modules/news/NewsExperience';
import {shellCopy} from '@/lib/shell-copy';
import {searchCopy} from '@/lib/search-copy';
import {cleanSearch,readSearchHistory,writeSearchHistory,searchKinds,type SearchKind,type SearchPerson} from '@/lib/search';
import {useSearchResults} from '@/lib/use-search-results';
import {isLocale,type Locale} from '@/lib/i18n';

export function SearchPage(){return <Suspense><Search/></Suspense>;}
function Search(){
 const{db,locale,t,user,authStatus}=useApp(),c=shellCopy[locale],copy=searchCopy[locale],params=useSearchParams(),router=useRouter();
 const q=cleanSearch(params.get('q')??''),kind=searchKinds.find(k=>k===params.get('type'))??'all',sort=params.get('sort')==='latest'?'latest':'relevant',following=!!user&&params.get('scope')==='following';
 const owner=user?.id??'guest',[history,setHistory]=useState<{owner:string;items:string[]}>({owner:'',items:[]});
 const[navigating,startNavigation]=useTransition();
 const results=useSearchResults({query:q,kind,sort,following});
 useEffect(()=>{if(authStatus==='loading')return;setHistory({owner,items:readSearchHistory(owner)});},[owner,authStatus]);
 function saveHistory(items:string[]){setHistory({owner,items});writeSearchHistory(owner,items);}
 function navigate(query:string,next:{kind?:SearchKind;sort?:string;following?:boolean}={}){
  const value=cleanSearch(query),p=new URLSearchParams(),nextKind=next.kind??kind,nextSort=next.sort??sort,nextFollowing=next.following??following;
  if(value)p.set('q',value);if(nextKind!=='all')p.set('type',nextKind);if(nextSort!=='relevant')p.set('sort',nextSort);if(nextFollowing)p.set('scope','following');
  startNavigation(()=>router.push(`/${locale}/search/${p.size?'?'+p:''}`,{scroll:false}));
 }
 function submit(value:string){const query=cleanSearch(value);if(query&&authStatus!=='loading')saveHistory([query,...readSearchHistory(owner).filter(v=>v.toLocaleLowerCase()!==query.toLocaleLowerCase())].slice(0,8));navigate(query);}
 const labels={all:c.all,post:c.post,user:c.people,media:copy.media,news:t.news,reply:c.replies},recent=history.owner===owner?history.items:[];
 return <main id="main" className="search-page">
  <h1 className="sr-only">{c.search}</h1>
  <div className="search-header"><SearchInput key={owner} query={q} submit={submit}/><div className="search-types" role="group" aria-label={c.search}>{searchKinds.map(k=><button key={k} disabled={navigating} aria-pressed={kind===k} onClick={()=>navigate(q,{kind:k})}>{labels[k]}</button>)}</div></div>
  {q&&<div className="search-filters">
   <label><span className="sr-only">{copy.sort}</span><select aria-label={copy.sort} disabled={navigating} value={sort} onChange={e=>navigate(q,{sort:e.target.value})}><option value="relevant">{copy.relevant}</option><option value="latest">{c.newest}</option></select></label>
   {user&&<label><span className="sr-only">{copy.scope}</span><select aria-label={copy.scope} disabled={navigating} value={following?'following':'all'} onChange={e=>navigate(q,{following:e.target.value==='following'})}><option value="all">{copy.everyone}</option><option value="following">{copy.following}</option></select></label>}
  </div>}
  {!q?<section className="search-history" aria-label={copy.recent}>
   <div className="search-history-heading"><h2>{copy.recent}</h2>{recent.length>0&&<IconButton label={copy.clearAll} onClick={()=>saveHistory([])}><FiTrash2/></IconButton>}</div>
   {recent.length?<ul>{recent.map(item=><li key={item}><button className="history-query" onClick={()=>submit(item)}><FiClock/><span>{item}</span><FiArrowUpLeft/></button><button className="icon-button" aria-label={`${copy.remove}: ${item}`} onClick={()=>saveHistory(recent.filter(v=>v!==item))}><FiX/></button></li>)}</ul>:<p className="form-note">{copy.recentEmpty}</p>}
   <p className="search-help">{copy.localHistory}</p>
  </section>:<>
   {results.error&&<p className="inline-error" role="alert">{t.connectionError}<button onClick={results.retry}>{t.retry}</button></p>}
   {!db?<p className="empty-state">{t.connectionError}</p>:results.busy&&!results.items.length?<div className="skeleton-list" role="status" aria-label={t.loading}><i/><i/></div>:!results.items.length&&!results.error?<div className="empty-state"><p>{c.searchEmpty}</p><small>{copy.hint}</small></div>:<div className="search-results" aria-busy={results.busy}>
    {results.items.map(row=>row.kind==='user'?<article className="search-person" key={`user:${row.profile.id}`}>
     <div className="search-person-top"><UserIdentity id={row.profile.id} name={row.profile.display_name} handle={row.profile.handle} avatarKey={row.profile.avatar_key} size={40}/><FollowButton id={row.profile.id} following={row.profile.following}/></div>
     {row.profile.bio&&<Link className="search-person-bio" href={`/${locale}/profile/?id=${row.profile.id}`}>{row.profile.bio}</Link>}
    </article>:row.kind==='reply'?<article className="search-reply" key={`reply:${row.reply.id}`}>
     <UserIdentity id={row.reply.user_id} name={row.reply.display_name} handle={row.reply.handle} avatarKey={row.reply.avatar_key}/>
     <Link href={`/${locale}/${row.reply.content_type==='post'?'community/':'news/'}?id=${row.reply.article_id}#comments`}><small>{c.reply} · {new Date(row.reply.created_at).toLocaleDateString(locale)}</small><p>{row.reply.body}</p></Link>
    </article>:<ArticleCard article={row.article} key={`${row.kind}:${row.article.id}`} readingLocale={isLocale(row.article.matched_locale??'')?row.article.matched_locale as Locale:undefined}/>)}</div>}
   <p className="sr-only" role="status">{!results.busy&&!results.error?`${results.items.length} ${copy.resultStatus}`:''}</p>
   {results.more&&!results.error&&<div className="load-more"><button className="button" disabled={results.busy} onClick={results.loadMore}>{results.busy?t.loading:t.more}</button></div>}
  </>}
 </main>;
}

function SearchInput({query,submit}:{query:string;submit:(query:string)=>void}){
 const{db,locale,t,user}=useApp(),c=shellCopy[locale],copy=searchCopy[locale],router=useRouter();
 const[input,setInput]=useState(query),[focused,setFocused]=useState(false),[composing,setComposing]=useState(false),[active,setActive]=useState(-1);
 const[suggestions,setSuggestions]=useState<{key:string;people:SearchPerson[];loading:boolean}>({key:'',people:[],loading:false}),inputRef=useRef<HTMLInputElement>(null),seq=useRef(0);
 const value=cleanSearch(input),suggestionKey=`${user?.id??''}:${value}`,show=focused&&!!value&&!composing;
 useEffect(()=>{setInput(query);setFocused(false);setActive(-1);},[query]);
 useEffect(()=>{
  setActive(-1);if(!db||!show)return;const n=++seq.current,controller=new AbortController();setSuggestions({key:suggestionKey,people:[],loading:true});
  const timer=setTimeout(()=>{void(async()=>{try{const{data,error}=await db.rpc('omni_search_v2',{search_query:value,result_kind:'user',sort_by:'relevant',offset_rows:0,following_only:false,page_size:5}).abortSignal(controller.signal);if(n===seq.current)setSuggestions({key:suggestionKey,people:error?[]:(data??[]).slice(0,5).map((r:{profile:SearchPerson})=>r.profile),loading:false});}catch{if(n===seq.current)setSuggestions({key:suggestionKey,people:[],loading:false});}})();},280);
  const timeout=setTimeout(()=>controller.abort(),10000);return()=>{++seq.current;clearTimeout(timer);clearTimeout(timeout);controller.abort();};
 },[db,value,show,suggestionKey]);
 const people=suggestions.key===suggestionKey?suggestions.people:[];
 function search(){setFocused(false);setActive(-1);submit(input);}
 function choose(index:number){setFocused(false);if(index===0)search();else if(people[index-1])router.push(`/${locale}/profile/?id=${people[index-1].id}`);}
 return <div className="search-input-wrap" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}>
  <form className="global-search-form" role="search" onSubmit={e=>{e.preventDefault();if(!composing)search();}}>
   <FiSearch aria-hidden="true"/>
   <input ref={inputRef} autoFocus type="search" role="combobox" aria-autocomplete="list" aria-expanded={show} aria-controls={show?'search-suggestions':undefined} aria-activedescendant={show&&active>=0?`search-option-${active}`:undefined} aria-label={c.searchHint} placeholder={copy.hint} maxLength={120} autoComplete="off" value={input}
    onFocus={()=>setFocused(true)} onChange={e=>{setInput(e.target.value);setFocused(true);}}
    onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
    onKeyDown={e=>{if(composing||e.nativeEvent.isComposing)return;if(e.key==='Escape'){setFocused(false);setActive(-1);}else if(e.key==='ArrowDown'&&value){e.preventDefault();setFocused(true);setActive(n=>Math.min(n+1,people.length));}else if(e.key==='ArrowUp'&&show){e.preventDefault();setActive(n=>Math.max(0,n-1));}else if(e.key==='Enter'&&show&&active>=0){e.preventDefault();choose(active);}}}/>
   {input&&<button className="icon-button search-clear" type="button" aria-label={copy.clear} onClick={()=>{setInput('');submit('');inputRef.current?.focus();}}><FiX/></button>}
   <IconButton type="submit" label={c.search} className="search-submit"><FiArrowRight/></IconButton>
  </form>
  {show&&<div className="search-suggestion-panel"><ul id="search-suggestions" role="listbox" aria-label={copy.suggestions}>
   <li role="option" id="search-option-0" aria-selected={active===0}><button type="button" onClick={search}><FiSearch/><span>{copy.searchFor} “{value}”</span></button></li>
   {people.map((p,i)=><li role="option" id={`search-option-${i+1}`} key={p.id} aria-selected={active===i+1}><Link href={`/${locale}/profile/?id=${p.id}`} onClick={()=>setFocused(false)}><Avatar name={p.display_name} avatarKey={p.avatar_key} size={34}/><span className="identity-names"><b>{p.display_name}</b><small>@{p.handle}</small></span></Link></li>)}
  </ul>{suggestions.key===suggestionKey&&suggestions.loading&&<p role="status">{t.loading}</p>}</div>}
 </div>;
}
