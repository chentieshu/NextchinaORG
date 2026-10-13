import {locales,type Locale} from './i18n';
import {normalizeDocument} from './rich-content';
import type {Article,Category} from './types';
export type WritingData={translations:Article['translations'];original:Locale;category:Category;source:string;cover:number;quotedArticle?:string|null};
export type LocalDraft=WritingData&{time:number;baseUpdatedAt?:string;version?:number};
export function readDraft(raw:string|null):LocalDraft|null{
 try{const v=JSON.parse(raw??'null');if(!v||!v.translations||typeof v.translations!=='object'||Array.isArray(v.translations)||!locales.includes(v.original)||(typeof v.category!=='string'||!/^([a-z][a-z0-9-]{0,39})$/.test(v.category)||v.category==='all')||typeof v.source!=='string'||!Number.isInteger(v.cover)||typeof v.time!=='number')return null;
  const translations:Article['translations']={};for(const [language,text] of Object.entries(v.translations)){const t=text as Record<string,unknown>;if(!locales.includes(language as Locale)||!t||['title','summary','body'].some(k=>typeof t[k]!=='string'))return null;translations[language as Locale]={title:t.title as string,summary:t.summary as string,body:t.body as string,document:normalizeDocument(t.document,t.body as string)};}
  return {...v,translations};
 }catch{return null;}
}
export function writingData(article:Article|null,locale:Locale):WritingData{return {translations:article?.translations??{},original:article?.original_locale??locale,category:article?.category??'ai',source:article?.source_url??'',cover:article?.cover_style??0,quotedArticle:article?.quoted_article_id??null};}
