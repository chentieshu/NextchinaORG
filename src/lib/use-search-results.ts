'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {resultKey,type SearchKind,type SearchResult} from './search';
import type {Article} from './types';
type Options={query:string;kind:SearchKind;sort:'relevant'|'latest';following:boolean};
type State={key:string;items:SearchResult[];busy:boolean;error:boolean;more:boolean};
export function useSearchResults(options:Options){
 const{db,user,contentVersion,rememberArticles}=useApp(),key=JSON.stringify({...options,actor:user?.id,contentVersion});
 const[state,setState]=useState<State>({key:'',items:[],busy:false,error:false,more:false});
 const seq=useRef(0),pending=useRef(false),abort=useRef<AbortController|null>(null),items=useRef<SearchResult[]>([]),offset=useRef(0),failedAppend=useRef(false);
 const load=useCallback(async(append=false)=>{
  const p=JSON.parse(key) as Options,n=++seq.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
  if(!db||!p.query){pending.current=false;setState({key,items:[],busy:false,error:false,more:false});return;}
  pending.current=true;failedAppend.current=append;const start=append?offset.current:0,timer=setTimeout(()=>controller.abort(),15000);
  setState(old=>({key,items:append?old.items:[],busy:true,error:false,more:append&&old.more}));
  try{
   const{data,error}=await db.rpc('omni_search_v2',{search_query:p.query,result_kind:p.kind,sort_by:p.sort,offset_rows:start,following_only:p.following,page_size:20}).abortSignal(controller.signal);
   if(n!==seq.current)return;if(error)throw error;
   const batch=(data??[]) as SearchResult[],page=batch.slice(0,20),seen=new Set(append?items.current.map(resultKey):[]);
   items.current=append?[...items.current,...page.filter(row=>!seen.has(resultKey(row)))]:page;offset.current=start+page.length;
   setState({key,items:items.current,busy:false,error:false,more:batch.length>20});
   rememberArticles(page.flatMap(row=>row.kind==='post'||row.kind==='news'?[row.article as Article]:[]));
  }catch{if(n===seq.current)setState(old=>({...old,busy:false,error:true}));}finally{clearTimeout(timer);if(n===seq.current)pending.current=false;}
 },[db,key,rememberArticles]);
 useEffect(()=>{items.current=[];offset.current=0;void load();return()=>{++seq.current;abort.current?.abort();pending.current=false;};},[load]);
 return {...(state.key===key?state:{key,items:[],busy:!!options.query,error:false,more:false}),loadMore:()=>{if(!pending.current)void load(true);},retry:()=>{if(!pending.current)void load(failedAppend.current);}};
}
