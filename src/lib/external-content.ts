import {resolveMediaUrl} from './media-origin.ts';
import type {RichNode} from './types';
export type ExternalContent={provider:'youtube'|'bilibili'|'x'|'spotify'|'github'|'link';url:string;label:string;id?:string;embed?:string};
export function externalContent(value:unknown):ExternalContent|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const h=u.hostname.toLowerCase(),p=u.pathname.split('/').filter(Boolean);let id:string|undefined;
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(h)){id=h==='youtu.be'?p[0]:p[0]==='watch'?u.searchParams.get('v')??undefined:['shorts','embed','live'].includes(p[0])?p[1]:undefined;if(id&&/^[\w-]{11}$/.test(id))return {provider:'youtube',id,url:`https://www.youtube.com/watch?v=${id}`,label:'YouTube',embed:`https://www.youtube-nocookie.com/embed/${id}?autoplay=0`};}
 if(['bilibili.com','www.bilibili.com','m.bilibili.com'].includes(h)&&p[0]==='video'&&/^(BV[0-9A-Za-z]{10}|av[0-9]{1,20})$/.test(p[1]??'')){id=p[1];const page=Math.max(1,Math.min(1000,Number(u.searchParams.get('p'))||1));return {provider:'bilibili',id,url:`https://www.bilibili.com/video/${id}/?p=${page}`,label:'Bilibili',embed:`https://player.bilibili.com/player.html?${id.startsWith('BV')?'bvid='+id:'aid='+id.slice(2)}&p=${page}&autoplay=0&danmaku=0`};}
 if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(h)&&((p[1]==='status'&&/^\d{1,22}$/.test(p[2]??''))||(p[0]==='i'&&p[1]==='web'&&p[2]==='status'&&/^\d{1,22}$/.test(p[3]??'')))){id=p[1]==='status'?p[2]:p[3];return {provider:'x',id,url:`https://x.com/i/status/${id}`,label:'X'};}
 if(h==='open.spotify.com'){const parts=p[0]?.startsWith('intl-')?p.slice(1):p;if(['track','album','artist','playlist','episode','show'].includes(parts[0])&&/^[A-Za-z0-9]{22}$/.test(parts[1]??''))return {provider:'spotify',id:parts[1],url:`https://open.spotify.com/${parts[0]}/${parts[1]}`,label:'Spotify',embed:`https://open.spotify.com/embed/${parts[0]}/${parts[1]}`};}
 if((h==='github.com'||h==='gist.github.com')&&p.length>=2&&p.every(v=>/^[\w.~-]+$/.test(v)))return {provider:'github',url:u.origin+u.pathname,label:p.slice(0,2).join('/')};
 return {provider:'link',url:u.href,label:u.hostname};
 }catch{return null;}
}
export type MediaItem={type:'image'|'embed';url:string;alt?:string};
export function contentMedia(document?:RichNode,body=''):MediaItem[]{
 const items:MediaItem[]=[];const seen=new Set<string>();let budget=4000;
 function add(type:MediaItem['type'],value:unknown,alt?:string){const parsed=externalContent(value);if(parsed&&!seen.has(parsed.url)&&items.length<8){seen.add(parsed.url);items.push({type,url:type==='image'?resolveMediaUrl(String(value)):parsed.url,alt});}}
 function walk(n:RichNode,depth=0){if(!n||depth>16||--budget<0)return;if(n.type==='image')add('image',n.attrs?.src,typeof n.attrs?.alt==='string'?n.attrs.alt:'');if(n.type==='embed')add('embed',n.attrs?.url);for(const m of n.marks??[])if(m.type==='link')add('embed',m.attrs?.href);for(const child of n.content??[])walk(child,depth+1);}
 if(document)walk(document);for(const url of body.match(/https:\/\/[^\s<>]+/g)??[])add('embed',url.replace(/[。；，,;)]+$/,''));return items;
}
