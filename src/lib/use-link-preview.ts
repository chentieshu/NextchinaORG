'use client';
import {useEffect,useRef,useState} from 'react';
import {externalContent} from './external-content';
import {MEDIA_ORIGIN} from './media';
export type LinkPreview={provider:string;url:string;title:string;description?:string;author?:string;language?:string;stars?:number;forks?:number;thumbnail_url?:string;available:boolean};
const cache=new Map<string,{until:number;value:Promise<LinkPreview|null>}>();
export function useLinkPreview(url:string,enabled=true){
 const ref=useRef<HTMLElement|null>(null),[result,setResult]=useState<{url:string;data:LinkPreview|null}>({url:'',data:null});
 useEffect(()=>{const item=externalContent(url);if(!enabled||!item||!['youtube','github','spotify'].includes(item.provider))return;let active=true;
  function load(){let entry=cache.get(item!.url);if(!entry||entry.until<Date.now()){
   if(cache.size>200)cache.delete(cache.keys().next().value!);
   const value=fetch(`${MEDIA_ORIGIN}/v1/link-preview?url=${encodeURIComponent(item!.url)}`,{credentials:'omit',signal:AbortSignal.timeout(9000)}).then(async response=>{if(!response.ok)return null;const data=await response.json() as LinkPreview;if(data.url!==item!.url||typeof data.title!=='string')return null;if(data.thumbnail_url&&!data.thumbnail_url.startsWith(`${MEDIA_ORIGIN}/v1/link-thumbnail?url=`))delete data.thumbnail_url;return data;}).catch(()=>null);
   entry={until:Date.now()+300000,value};cache.set(item!.url,entry);
  }void entry.value.then(data=>{if(active)setResult({url,data});});}
  if(!ref.current||!('IntersectionObserver' in window)){load();return()=>{active=false;};}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'180px'});observer.observe(ref.current);return()=>{active=false;observer.disconnect();};
 },[url,enabled]);
 return{ref:(node:HTMLElement|null)=>{ref.current=node;},preview:result.url===url?result.data:null};
}
