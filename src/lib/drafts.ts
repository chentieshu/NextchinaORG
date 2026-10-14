import {locales,type Locale} from './i18n';
import {normalizeDocument} from './rich-content';
import type {Article,Category} from './types';
export type WritingData={translations:Article['translations'];original:Locale;category:Category;source:string;cover:number;quotedArticle?:string|null;firstPartKey?:string;firstPartId?:string;firstPartUpdatedAt?:string;threadParts?:import('./post-thread').ThreadPart[];threadSnapshot?:{id:string;updated_at:string}[]};
export type LocalDraft=WritingData&{time:number;baseUpdatedAt?:string;version?:number};
export function readDraft(raw:string|null):LocalDraft|null{
 try{const v=JSON.parse(raw??'null');if(!v||!v.translations||typeof v.translations!=='object'||Array.isArray(v.translations)||!locales.includes(v.original)||(typeof v.category!=='string'||!/^([a-z][a-z0-9-]{0,39})$/.test(v.category)||v.category==='all')||typeof v.source!=='string'||!Number.isInteger(v.cover)||typeof v.time!=='number')return null;
  const translations:Article['translations']={};for(const [language,text] of Object.entries(v.translations)){const t=text as Record<string,unknown>;if(!locales.includes(language as Locale)||!t||['title','summary','body'].some(k=>typeof t[k]!=='string'))return null;translations[language as Locale]={title:t.title as string,summary:t.summary as string,body:t.body as string,document:normalizeDocument(t.document,t.body as string)};}
  if(v.threadParts!==undefined){if(!Array.isArray(v.threadParts)||v.threadParts.length>19)return null;const keys=new Set([v.firstPartKey??'first']);for(const part of v.threadParts){if(!part||typeof part.key!=='string'||keys.has(part.key)||!part.text||['title','summary','body'].some(k=>typeof part.text[k]!=='string'))return null;keys.add(part.key);part.text.document=normalizeDocument(part.text.document,part.text.body);}}
  if(v.threadSnapshot!==undefined&&(!Array.isArray(v.threadSnapshot)||v.threadSnapshot.length>20||v.threadSnapshot.some((p:{id?:unknown;updated_at?:unknown})=>typeof p.id!=='string'||typeof p.updated_at!=='string')))return null;
  return {...v,translations};
 }catch{return null;}
}
export function writingData(article:Article|null,locale:Locale):WritingData{return {translations:article?.translations??{},original:article?.original_locale??locale,category:article?.category??'ai',source:article?.source_url??'',cover:article?.cover_style??0,quotedArticle:article?.quoted_article_id??null};}
