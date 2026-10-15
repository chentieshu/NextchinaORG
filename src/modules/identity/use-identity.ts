'use client';
import {useCallback,useSyncExternalStore} from 'react';
import {getSupabase} from '@/lib/supabase';
import type {Locale} from '@/lib/i18n';
export type Identity={id:string;level:number|null;title:Partial<Record<Locale,string>>|null};
const cache=new Map<string,{value:Identity;expires:number}>(),listeners=new Set<()=>void>(),queue=new Set<string>(),pending=new Set<string>();let timer:ReturnType<typeof setTimeout>|undefined,epoch=0;
const empty:Identity={id:'',level:null,title:null};
const emit=()=>listeners.forEach(fn=>fn());
let refreshTimer:ReturnType<typeof setInterval>|undefined;
const refreshVisible=()=>{if(document.visibilityState==='visible')emit();};
function startRefresh(){if(refreshTimer)return;window.addEventListener('wallet:changed',invalidateIdentity);window.addEventListener('focus',refreshVisible);document.addEventListener('visibilitychange',refreshVisible);refreshTimer=setInterval(refreshVisible,60000);}
function stopRefresh(){if(listeners.size)return;clearInterval(refreshTimer);refreshTimer=undefined;window.removeEventListener('wallet:changed',invalidateIdentity);window.removeEventListener('focus',refreshVisible);document.removeEventListener('visibilitychange',refreshVisible);}
export function invalidateIdentity(){epoch++;cache.clear();pending.clear();emit();}
function request(id:string){if(!/^[0-9a-f-]{36}$/i.test(id)||pending.has(id)||(cache.get(id)?.expires??0)>Date.now())return;queue.add(id);if(!timer)timer=setTimeout(flush,20);}
async function flush(){timer=undefined;const db=getSupabase(),ids=[...queue].slice(0,100),generation=epoch;ids.forEach(id=>{queue.delete(id);pending.add(id);});if(!db){ids.forEach(id=>pending.delete(id));return;}try{const r=await db.rpc('omni_identity_public',{profile_ids:ids}).abortSignal(AbortSignal.timeout(12000));if(generation!==epoch)return;if(r.error)throw r.error;for(const id of ids)cache.set(id,{value:(r.data as Identity[]).find(x=>x.id===id)??empty,expires:Date.now()+60000});}catch{if(generation===epoch)ids.forEach(id=>cache.set(id,{value:empty,expires:Date.now()+10000}));}finally{if(generation===epoch)ids.forEach(id=>pending.delete(id));emit();if(queue.size&&!timer)timer=setTimeout(flush,20);}}
export function useIdentity(id?:string|null){const subscribe=useCallback((fn:()=>void)=>{const listener=()=>{if(id)request(id);fn();};listeners.add(listener);startRefresh();if(id)request(id);return()=>{listeners.delete(listener);stopRefresh();};},[id]),snapshot=useCallback(()=>id?cache.get(id)?.value??empty:empty,[id]);return useSyncExternalStore(subscribe,snapshot,()=>empty);}
