import type {Article,Profile} from './types';
export const searchKinds=['all','post','user','media','news','reply'] as const;
export type SearchKind=typeof searchKinds[number];
export type SearchPerson=Pick<Profile,'id'|'display_name'|'handle'|'avatar_key'|'bio'>&{following:boolean};
export type SearchResult={kind:'post'|'news';article:Article;matched_locale?:string}|{kind:'user';profile:SearchPerson}|{kind:'reply';reply:{id:string;article_id:string;content_type:'post'|'news';body:string;created_at:string;user_id:string;display_name:string;handle:string;avatar_key:string|null}};
export const cleanSearch=(value:string)=>value.replace(/\s+/g,' ').trim().slice(0,120);
export function resultKey(row:SearchResult){return row.kind+':'+(row.kind==='user'?row.profile.id:row.kind==='reply'?row.reply.id:row.article.id);}
// Device-only history, partitioned by account. Never mix one user's searches
// into another user's suggestions, and never put these terms into profile data.
export function readSearchHistory(owner:string):string[]{
 try{const data=JSON.parse(localStorage.getItem('chinateam-search:'+owner)??'[]');return Array.isArray(data)?data.filter((s):s is string=>typeof s==='string'&&!!cleanSearch(s)).map(cleanSearch).slice(0,8):[];}catch{return [];}
}
export function writeSearchHistory(owner:string,items:string[]){try{localStorage.setItem('chinateam-search:'+owner,JSON.stringify(items.slice(0,8)));}catch{}}
