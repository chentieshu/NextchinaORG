'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {FiArrowUpRight,FiChevronLeft,FiChevronRight,FiPause,FiPlay} from 'react-icons/fi';
import {useApp} from './Provider';
import {Artwork} from './Artwork';
import {articleText} from '@/lib/content';
import {forumCopy} from '@/lib/forum-copy';
import type {Article} from '@/lib/types';
export function contentHref(article:Article,locale:string){return `/${locale}/${article.content_type==='post'?'community/':'news/'}?id=${article.id}`;}
export function Carousel({articles,forum=false}:{articles:Article[];forum?:boolean}){
 const{locale,t}=useApp(),c=forumCopy[locale];const[index,setIndex]=useState(0),[paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[reduced,setReduced]=useState(true);
 const list=articles.slice(0,5),count=list.length||3,active=index%count;
 useEffect(()=>{const m=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(m.matches);change();m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);
 useEffect(()=>{if(paused||hovered||focused||reduced||count<2)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')setIndex(i=>(i+1)%count);},7000);return()=>clearInterval(timer);},[paused,hovered,focused,reduced,count]);
 const Heading=forum?'h1':'h2';const article=list[active];const text=article?articleText(article,locale):null;
 const fallback=[{title:c.headline,summary:c.intro,href:`/${locale}/write/`,action:c.write},{title:c.community,summary:c.rulesText,href:`/${locale}/about/#guidelines`,action:t.guidelines},{title:t.latest,summary:t.latestSub,href:`/${locale}/news/`,action:c.news}][active%3];
 function move(delta:number){setIndex((active+delta+count)%count);setPaused(true);}
 return <section className={`spotlight ${forum?'forum-spotlight':''}`} aria-roledescription="carousel" aria-label={c.featured} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}}} tabIndex={0}>
 <div className="spotlight-copy" aria-live={paused||reduced?'polite':'off'}><span className="eyebrow"><i/>{article?(article.content_type==='post'?c.featured:c.news):'NEXTCHINA.ORG / OPEN COMMUNITY'} <span className="slide-fraction">{String(active+1).padStart(2,'0')} / {String(count).padStart(2,'0')}</span></span><Heading>{text?.title??fallback.title}</Heading><p>{text?.summary??fallback.summary}</p><Link className="button primary" href={article?contentHref(article,locale):fallback.href}>{article?(article.content_type==='post'?c.read:t.read):fallback.action}<FiArrowUpRight/></Link></div><div className="spotlight-art" aria-hidden="true"><Artwork style={article?.cover_style??active} large/></div>
 <div className="carousel-controls"><div className="carousel-dots">{Array.from({length:count},(_,i)=><button key={i} aria-label={`${c.slide}${i+1}${c.slideEnd}`} aria-current={active===i?'true':undefined} onClick={()=>{setIndex(i);setPaused(true);}}><span/></button>)}</div><div className="carousel-arrows"><button className="icon-button" aria-label={c.previous} disabled={count<2} onClick={()=>move(-1)}><FiChevronLeft/></button><button className="icon-button" aria-label={c.next} disabled={count<2} onClick={()=>move(1)}><FiChevronRight/></button>{count>1&&!reduced&&<button className="icon-button" aria-label={paused?c.play:c.pause} onClick={()=>setPaused(!paused)}>{paused?<FiPlay/>:<FiPause/>}</button>}</div></div></section>;
}
