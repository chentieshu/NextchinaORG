'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {FiChevronLeft,FiChevronRight} from 'react-icons/fi';
import {useApp} from './Provider';
import {articleText} from '@/lib/content';
import {forumCopy} from '@/lib/forum-copy';
import {experienceCopy} from '@/lib/experience-copy';
import type {Article} from '@/lib/types';
export function contentHref(article:Article,locale:string){return `/${locale}/${article.content_type==='post'?'community/':'news/'}?id=${article.id}`;}
export function Carousel({articles}:{articles:Article[];forum?:boolean}){
 const {locale}=useApp(),copy=forumCopy[locale],list=articles.filter(a=>a.featured&&a.status==='published').slice(0,5),[index,setIndex]=useState(0);
 const ids=list.map(a=>a.id).join(',');useEffect(()=>setIndex(0),[ids]);
 if(!list.length)return null;const current=index%list.length,article=list[current],text=articleText(article,locale);
 return <section className="spotlight" aria-roledescription="carousel" aria-label={copy.featured}><div className="spotlight-copy"><span className="feature-label">{experienceCopy[locale].featured}</span><h2><Link href={contentHref(article,locale)}>{text.title}</Link></h2>{text.summary&&<p>{text.summary}</p>}</div>{list.length>1&&<div className="carousel-controls"><button className="icon-button" aria-label={copy.previous} onClick={()=>setIndex((current+list.length-1)%list.length)}><FiChevronLeft/></button><span aria-live="polite">{current+1} / {list.length}</span><button className="icon-button" aria-label={copy.next} onClick={()=>setIndex((current+1)%list.length)}><FiChevronRight/></button></div>}</section>;
}
