'use client';
import Link from 'next/link';
import {useApp} from '@/components/Provider';
import {experienceCopy} from '@/lib/experience-copy';
import {forumCopy} from '@/lib/forum-copy';
export function About(){const{t,locale}=useApp(),x=experienceCopy[locale],c=forumCopy[locale];return <main id="main" className="page-wrap content-wrap about-page"><h1 className="page-title">{t.about} NextChina.org</h1><p className="about-lead">{x.forumIntro} {x.newsIntro}</p><div className="policies"><section id="guidelines"><h2>{t.guidelines}</h2><p>{c.rules} {c.rulesText}</p><Link className="text-link" href={`/${locale}/terms/`}>{t.terms}</Link></section><section><h2>{t.privacy}</h2><p><a className="text-link" href="mailto:chentieshu520@gmail.com">chentieshu520@gmail.com</a></p><Link className="text-link" href={`/${locale}/privacy/`}>{t.privacy}</Link></section></div><a className="text-link" href="https://github.com/chentieshu/NextchinaORG" target="_blank" rel="noreferrer">{t.github}</a></main>;}
