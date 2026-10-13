'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {FiSearch,FiHeart,FiBookmark,FiMessageCircle,FiArrowLeft,FiLink} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {contentHref} from '@/lib/content-href';
import {ContentManagement} from '@/components/ContentManagement';
import {UserIdentity} from '@/components/Avatar';
import {RichText} from '@/components/RichText';
import {ThreadReplies} from '@/components/ThreadReplies';
import {MediaPreview,ExternalContent} from '@/components/ExternalContent';
import {contentMedia} from '@/lib/external-content';
import {socialCopy} from '@/lib/social-copy';
import {AccountGate} from '@/components/AccountGate';
import {forumCopy} from '@/lib/forum-copy';
import {experienceCopy} from '@/lib/experience-copy';
import {articleText,readingTime,safeSource} from '@/lib/content';

import {useContentFeed,useDebounce,contentCategories as categories,type FeedFilters} from '@/lib/use-content-feed';
import type {Article} from '@/lib/types';
export function ArticleFeed({kind='news',bookmarks=false,initialQuery='',initialCategory='all',controls,author,mediaOnly=false}:{kind?:'post'|'news';bookmarks?:boolean;initialQuery?:string;initialCategory?:string;author?:string;mediaOnly?:boolean;controls?:{value:FeedFilters;onChange:(patch:Partial<FeedFilters>)=>void}}){
 const{t,locale,user,setAuthOpen,demo}=useApp(),c=forumCopy[locale],x=experienceCopy[locale];
 const[local,setLocal]=useState<FeedFilters>({category:initialCategory,query:initialQuery,sort:'latest',mine:false});
 const{category,query,sort,mine}=controls?.value??local;
 const controlled=!!controls;
 function update(patch:Partial<FeedFilters>){if(controls)controls.onChange(patch);else setLocal(old=>({...old,...patch}));}
 useEffect(()=>{if(!controlled)setLocal(old=>({...old,query:initialQuery,category:categories.includes(initialCategory as typeof categories[number])?initialCategory:'all'}));},[initialQuery,initialCategory,controlled]);
 const settled=useDebounce(query),feed=useContentFeed({kind:bookmarks?'all':kind,category,query:settled,sort,mine:mine&&!!user,bookmarks,author,mediaOnly,following:controls?.value.following&&!!user});
 return <section className={`content-feed ${controls?'forum-feed':''}`} aria-label={kind==='post'?c.latest:t.news}>
  {!author&&<div className="feed-toolbar">
   {!controls&&<div className="category-tabs" role="group" aria-label={t.category}>{categories.map(value=><button key={value} className={category===value?'selected':''} aria-pressed={category===value} onClick={()=>update({category:value})}>{t[value]}</button>)}</div>}
   <div className="feed-tools"><label className="inline-search"><FiSearch/><input aria-label={t.searchLabel} value={query} maxLength={120} onChange={e=>update({query:e.target.value})} placeholder={x.search}/></label><select aria-label={t.sort} value={sort} onChange={e=>update({sort:e.target.value})}><option value="latest">{t.sort}</option><option value="popular">{t.popular}</option></select>{kind==='post'&&!bookmarks&&!controls&&<button className={mine?'button small selected':'button small'} aria-pressed={mine&&!!user} onClick={()=>{if(!user){setAuthOpen(true);return;}update({mine:!mine});}}>{mine&&user?c.all:c.mine}</button>}</div>
  </div>}
  {demo&&<p className="form-note">{t.setup}</p>}{feed.error&&<div className="inline-error" role="alert">{x.connection}<button className="text-link" onClick={feed.retry}>{t.retry}</button></div>}{feed.loading&&!feed.items.length?<div className="skeleton-list" role="status" aria-label={t.loading}><i/><i/><i/></div>:!feed.items.length?<div className="empty-state"><p>{query||category!=='all'?x.noResults:bookmarks?t.emptyBookmarks:x.empty}</p></div>:<div className="news-grid">{feed.items.map(a=><ArticleCard key={a.id} article={a}/>)}</div>}{feed.hasMore&&<div className="load-more"><button className="button" disabled={feed.loading} onClick={feed.more}>{feed.loading?t.loading:t.more}</button></div>}
 </section>;
}
export function ArticleCard({article}:{article:Article}){
 const{t,locale}=useApp(),text=articleText(article,locale),post=article.content_type==='post',c=socialCopy[locale],href=contentHref(article,locale);
 const media=article.media?.length?article.media:article.thumbnail_url?[{type:'image' as const,url:article.thumbnail_url}]:contentMedia(text.document,text.body||text.summary);
 return <article className={`article-card ${post?'social-post':''}`}><div className="card-content"><div className="article-meta"><UserIdentity id={article.author_id} name={article.author_name??t.editor} avatarKey={article.author_avatar_key}/><time>{new Date(article.published_at??article.created_at).toLocaleDateString(locale,{month:'short',day:'numeric'})}</time>{article.status!=='published'&&<span className="status-label">{t[article.status]}</span>}{article.locked&&<span>{forumCopy[locale].lock}</span>}</div>{post?<Link className="post-excerpt" href={href} aria-label={c.openPost}><p>{text.body||text.summary||c.attachment}</p></Link>:<><h3><Link href={href}>{text.title}</Link></h3>{text.summary&&<p>{text.summary}</p>}</>}<div className="card-bottom"><ArticleActions article={article} compact/>{article.status!=='published'&&<Link className="text-link" href={`/${locale}/write/?id=${article.id}`}>{t.edit}</Link>}</div></div>{post&&<MediaPreview key={media[0]?.url} items={media} href={href}/>}</article>;
}
export function ArticleActions({article,compact=false}:{article:Article;compact?:boolean}){
 const{t,locale,articles,liked,bookmarked,toggle,authStatus}=useApp();const[busy,setBusy]=useState(false);const live=articles.find(a=>a.id===article.id)??article;
 async function act(kind:'likes'|'bookmarks'){if(busy)return;setBusy(true);try{await toggle(kind,article.id);}finally{setBusy(false);}}
 return <div className={`article-actions ${compact?'compact':''}`}><button disabled={busy||authStatus==='loading'||article.status!=='published'} aria-label={t.likes} aria-pressed={liked.includes(article.id)} onClick={()=>void act('likes')}><FiHeart/>{!compact&&<span>{t.likes}</span>}{!!live.like_count&&<span>{live.like_count}</span>}</button><Link aria-label={t.comments} href={`${contentHref(article,locale)}#comments`}><FiMessageCircle/>{!!live.comment_count&&<span>{live.comment_count}</span>}</Link><button disabled={busy||authStatus==='loading'||article.status!=='published'} aria-label={bookmarked.includes(article.id)?t.bookmarked:t.bookmark} aria-pressed={bookmarked.includes(article.id)} onClick={()=>void act('bookmarks')}><FiBookmark/>{!compact&&<span>{bookmarked.includes(article.id)?t.bookmarked:t.bookmark}</span>}</button></div>;
}
export function NewsPage(){const{t,profile,locale}=useApp();const params=useSearchParams(),id=params.get('id');if(id)return <ArticleDetail id={id}/>;return <main id="main" className="page-wrap content-wrap news-page"><div className="page-heading"><div><h1 className="page-title">{t.news}</h1><p>{experienceCopy[locale].newsIntro}</p></div>{profile&&!profile.disabled&&profile.role!=='member'&&<Link className="button primary" href={`/${locale}/write/?kind=news`}>{forumCopy[locale].newNews}</Link>}</div><ArticleFeed initialQuery={params.get('q')??''} initialCategory={params.get('category')??'all'}/></main>;}
export function ArticleDetail({id,expectedType='news'}:{id:string;expectedType?:'news'|'post'}){
 const{t,locale,db,demo,notify,contentVersion,authStatus,user,rememberArticles}=useApp();const[article,setArticle]=useState<Article|null>(null),[fetching,setFetching]=useState(!demo),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);const identity=useRef(user?.id);
 useEffect(()=>{if(!db){setFetching(false);return;}const changed=identity.current!==user?.id;identity.current=user?.id;const controller=new AbortController();let active=true;const timeout=setTimeout(()=>controller.abort(),15000);setFetching(true);setFailed(false);setArticle(old=>changed||old?.id!==id||old.content_type!==expectedType?null:old);
  Promise.all([db.from('omni_articles').select('*').eq('id',id).eq('content_type',expectedType).abortSignal(controller.signal).maybeSingle(),db.rpc('omni_content_counts',{target_article:id}).abortSignal(controller.signal)]).then(async([row,counts])=>{let fresh=row.data?{...row.data,...counts.data?.[0]}:null;let identityError=false;if(fresh?.author_id){const identity=await db.rpc('omni_public_profiles',{profile_ids:[fresh.author_id]}).abortSignal(controller.signal);identityError=!!identity.error;if(identity.data?.[0])fresh={...fresh,author_name:identity.data[0].display_name,author_avatar_key:identity.data[0].avatar_key};}if(active){if(!row.error){setArticle(fresh);if(fresh)rememberArticles([fresh]);}setFailed(!!row.error||!!counts.error||identityError);setFetching(false);}});return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[db,id,expectedType,attempt,contentVersion,authStatus,user?.id,rememberArticles]);
 const back=`/${locale}/${expectedType==='post'?'':'news/'}`;
 if(fetching&&(!article||article.id!==id||article.content_type!==expectedType))return <main id="main" className="empty-state" role="status">{t.loading}</main>;
 if(!article)return <main id="main" className="empty-state"><h1>{failed?t.connectionError:t.articleMissing}</h1>{failed&&<button className="button" onClick={()=>setAttempt(a=>a+1)}>{t.retry}</button>}<Link className="text-link" href={back}>{t.back}</Link></main>;
 const text=articleText(article,locale),source=safeSource(article.source_url);
 return <main id="main" className="article-page content-wrap"><Link className="back-link" href={back}><FiArrowLeft/>{expectedType==='post'?forumCopy[locale].forum:t.news}</Link><div className="article-heading"><span className="category-label">{t[article.category]}{article.status!=='published'&&` · ${t[article.status]}`}</span>{expectedType==='news'?<><h1>{text.title}</h1>{text.summary&&<p>{text.summary}</p>}</>:<h1 className="sr-only">{socialCopy[locale].posts}</h1>}<div className="byline"><UserIdentity id={article.author_id} name={article.author_name??t.editor} avatarKey={article.author_avatar_key} size={36}/><time>{article.published_at?new Date(article.published_at).toLocaleDateString(locale):t.draft}</time>{expectedType==='news'&&<span>{readingTime(text.body)} {t.min}</span>}</div></div>{failed&&<p className="inline-error" role="alert">{t.connectionError}<button onClick={()=>setAttempt(a=>a+1)}>{t.retry}</button></p>}<ContentManagement article={article} onChange={()=>setAttempt(a=>a+1)}/><div className="article-body">{!article.translations[locale]&&<p className="form-note">{t.translationFallback}</p>}<RichText text={text}/>{contentMedia(undefined,text.body).filter(item=>item.type==='embed'&&!JSON.stringify(text.document??{}).includes(item.url)).slice(0,4).map(item=><ExternalContent key={item.url} url={item.url}/>)}{source&&<a className="source-link" href={source} target="_blank" rel="noreferrer">{t.source} · {new URL(source).hostname}</a>}<div className="article-bottom"><ArticleActions article={article}/><button className="icon-button" aria-label={t.copyLink} onClick={async()=>{try{await navigator.clipboard.writeText(location.href);notify(t.copied);}catch{notify(t.error);}}}><FiLink/></button></div><ThreadReplies key={article.id} article={article}/></div></main>;
}
export function Bookmarks(){const{t,locale,authStatus,user,setAuthOpen}=useApp();if(authStatus!=='ready')return <AccountGate/>;if(!user)return <main id="main" className="empty-state"><h1>{t.bookmarks}</h1><button className="button primary" onClick={()=>setAuthOpen(true)}>{t.login}</button></main>;return <main id="main" className="page-wrap content-wrap"><div className="page-heading"><h1>{experienceCopy[locale].bookmarks}</h1></div><ArticleFeed bookmarks/></main>;}
