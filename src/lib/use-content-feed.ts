'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import type {Article} from './types';
export const contentCategories=['all','ai','opensource','hardware','design','frontier'] as const;
export type FeedFilters={category:string;query:string;sort:string;mine:boolean;following?:boolean};
type Options={kind:'post'|'news'|'all';category:string;query:string;sort:string;mine?:boolean;bookmarks?:boolean;author?:string;following?:boolean;mediaOnly?:boolean};
export function useContentFeed(options:Options){
 const {db,user,contentVersion,rememberArticles}=useApp();const [state,setState]=useState<{key:string;items:Article[];hasMore:boolean;loading:boolean;error:boolean}>({key:'',items:[],hasMore:false,loading:!!db,error:false});
 const request=useRef(0),controller=useRef<AbortController|null>(null),items=useRef<Article[]>([]),busy=useRef(false);
 const key=JSON.stringify({...options,user:user?.id,contentVersion});
 const load=useCallback(async(append=false)=>{
  if(!db){setState({key,items:[],hasMore:false,loading:false,error:false});return;}const seq=++request.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;busy.current=true;const timeout=setTimeout(()=>abort.abort(),15000);const offset=append?items.current.length:0;
  setState(old=>({key,items:append?old.items:[],hasMore:append&&old.hasMore,loading:true,error:false}));
  try{const params=JSON.parse(key) as Options;const{data,error}=await db.rpc('omni_content_feed',{content_kind:params.kind,filter_category:params.category,filter_query:params.query,sort_by:params.sort,own_only:!!params.mine,bookmarks_only:!!params.bookmarks,page_size:20,offset_rows:offset,author_filter:params.author??null,following_only:!!params.following,media_only:!!params.mediaOnly}).abortSignal(abort.signal);if(seq!==request.current)return;if(error)throw error;
   const page=(data??[]) as Article[],incoming=page.slice(0,20);items.current=append?[...items.current,...incoming.filter(a=>!items.current.some(x=>x.id===a.id))]:incoming;setState({key,items:items.current,hasMore:page.length>20,loading:false,error:false});rememberArticles(incoming);
  }catch{if(seq===request.current)setState(old=>({...old,key,loading:false,error:true}));}finally{clearTimeout(timeout);if(seq===request.current)busy.current=false;}
 },[db,key,rememberArticles]);
 useEffect(()=>{items.current=[];void load();return()=>{++request.current;controller.current?.abort();busy.current=false;};},[load]);
 return {...(state.key===key?state:{key,items:[],hasMore:false,loading:!!db,error:false}),more:()=>{if(!busy.current)void load(true);},retry:()=>void load()};
}
export function useDebounce<T>(value:T,delay=300){const [settled,setSettled]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setSettled(value),delay);return()=>clearTimeout(timer);},[value,delay]);return settled;}
