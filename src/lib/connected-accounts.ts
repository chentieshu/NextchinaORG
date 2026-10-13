'use client';
import {useCallback,useEffect,useSyncExternalStore} from 'react';
import {getSupabase} from './supabase';
export type ConnectedAccount={provider:'github'|'x';provider_id:string;handle:string;url:string};
const empty:ConnectedAccount[]=[];
const cache=new Map<string,{accounts:ConnectedAccount[];expires:number}>(),listeners=new Set<()=>void>(),queued=new Set<string>(),inflight=new Set<string>();
let timer:ReturnType<typeof setTimeout>|undefined,epoch=0;
const emit=()=>listeners.forEach(fn=>fn());
export function invalidateConnections(){epoch++;cache.clear();inflight.clear();emit();}
async function flush(){
 timer=undefined;const db=getSupabase(),ids=[...queued].slice(0,100);ids.forEach(id=>{queued.delete(id);inflight.add(id);});if(!db)return;
 const generation=epoch;
 try{const {data,error}=await db.rpc('omni_public_connections',{profile_ids:ids}).abortSignal(AbortSignal.timeout(12000));if(generation!==epoch)return;if(error)throw error;for(const id of ids){const accounts:ConnectedAccount[]=(data??[]).find((r:{id:string})=>r.id===id)?.accounts??empty;cache.set(id,{accounts:[...new Map(accounts.map(a=>[a.provider,a])).values()],expires:Date.now()+60000});}}
 catch{if(generation===epoch)ids.forEach(id=>cache.set(id,{accounts:empty,expires:Date.now()+5000}));}
 finally{if(generation===epoch)ids.forEach(id=>inflight.delete(id));emit();if(queued.size&&!timer)timer=setTimeout(flush,20);}
}
function request(id:string){if(!/^[0-9a-f-]{36}$/i.test(id)||inflight.has(id)||queued.has(id)||(cache.get(id)?.expires??0)>Date.now())return;queued.add(id);if(!timer)timer=setTimeout(flush,20);}
export function useConnections(id?:string|null){
 const subscribe=useCallback((fn:()=>void)=>{const listener=()=>{if(id)request(id);fn();};listeners.add(listener);if(id)request(id);return()=>{listeners.delete(listener);};},[id]);
 const snapshot=useCallback(()=>id?cache.get(id)?.accounts??empty:empty,[id]);
 const value=useSyncExternalStore(subscribe,snapshot,()=>empty);
 useEffect(()=>{if(!id)return;const check=()=>{if(document.visibilityState==='visible')request(id);};const interval=setInterval(check,60000);window.addEventListener('focus',check);return()=>{clearInterval(interval);window.removeEventListener('focus',check);};},[id]);
 return value;
}
