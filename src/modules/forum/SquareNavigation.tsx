'use client';
import Link from 'next/link';
import {useApp} from '@/components/Provider';
import {navigationCopy} from '@/lib/navigation-copy';
import {forumCopy} from '@/lib/forum-copy';
import './square.css';
export function SquareNavigation({articles=false}:{articles?:boolean}){
 const{locale,profile}=useApp(),c=navigationCopy[locale];
 return <header className="square-heading"><div className="square-title"><h1>{c.square}</h1>{articles&&profile&&!profile.disabled&&profile.role!=='member'&&<Link className="text-link" href={`/${locale}/write/?kind=news`}>{forumCopy[locale].newNews}</Link>}</div><nav className="square-tabs" aria-label={c.square}><Link href={`/${locale}/square/`} aria-current={!articles?'page':undefined}>{c.posts}</Link><Link href={`/${locale}/square/?tab=articles`} aria-current={articles?'page':undefined}>{c.articles}</Link></nav></header>;
}
