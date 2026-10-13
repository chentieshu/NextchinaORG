import type { Article,Translation } from './types';
import type { Locale } from './i18n';
export function articleText(article:Article,locale:Locale):Translation{return (article.content_type==='post'?undefined:article.translations[locale])??article.translations[article.original_locale]??{title:'',summary:'',body:''};}
export function safeSource(url:string|null){if(!url)return null;try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function readingTime(text:string){return Math.max(1,Math.ceil(text.length/600));}
