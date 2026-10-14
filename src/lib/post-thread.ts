import {normalizeDocument,documentText,hasDocumentContent} from './rich-content';
import type {WritingData} from './drafts';
import type {Article,Translation} from './types';
export const MAX_THREAD_PARTS=20;
export type ThreadPart={key:string;id?:string;updated_at?:string;text:Translation;quotedArticle?:string|null};
export function postParts(form:WritingData):ThreadPart[]{return [{key:form.firstPartKey??'first',id:form.firstPartId,updated_at:form.firstPartUpdatedAt,text:form.translations[form.original]??{title:'',summary:'',body:''},quotedArticle:form.quotedArticle},...(form.threadParts??[])];}
export function withPostParts(form:WritingData,parts:ThreadPart[]):WritingData{const[first,...rest]=parts;return {...form,firstPartKey:first.key,firstPartId:first.id,firstPartUpdatedAt:first.updated_at,translations:{[form.original]:first.text},quotedArticle:first.quotedArticle??null,threadParts:rest};}
export function threadWritingData(form:WritingData,rows:Article[]):WritingData{return {...withPostParts(form,rows.map(row=>({key:row.id,id:row.id,updated_at:row.updated_at,text:row.translations[row.original_locale]??{title:'',summary:'',body:''},quotedArticle:row.quoted_article_id}))),threadSnapshot:rows.map(({id,updated_at})=>({id,updated_at:updated_at!}))};}
export function partHasContent(part:ThreadPart){return !!part.quotedArticle||hasDocumentContent(normalizeDocument(part.text.document,part.text.body));}
export function partPayload(part:ThreadPart,form:WritingData){const document=normalizeDocument(part.text.document,part.text.body),body=documentText(document);return {id:part.id??null,content_type:'post',original_locale:form.original,category:form.category,quoted_article_id:part.quotedArticle??null,translations:{[form.original]:{title:'',summary:body.slice(0,180),body,document}}};}
