'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {marketError,type MarketSnapshot} from './market';
import {walletChanged} from './use-wallet';

export function useMarketRead<T>(view?:string,merchant?:string){
 const{db,user}=useApp(),[data,setData]=useState<T[]|MarketSnapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[more,setMore]=useState(false);
 const epoch=useRef(0),controller=useRef<AbortController|null>(null),cursor=useRef<string|null>(null);
 const load=useCallback(async(append=false)=>{const n=++epoch.current;controller.current?.abort();if(!db||!user){setData(null);setLoading(false);return;}const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),12000);setLoading(true);setError(false);
  try{const r=await db.rpc(view?'omni_market_list':'omni_market_snapshot',view?{view_kind:view,before_id:append?cursor.current:null,merchant:merchant??null}:{}).abortSignal(abort.signal);if(n!==epoch.current)return;if(r.error)throw r.error;
   if(view){const rows=(r.data??[]).slice(0,20);cursor.current=rows.at(-1)?.id??null;setMore((r.data??[]).length>20);setData(old=>append?[...(Array.isArray(old)?old:[]),...rows.filter((r:{id:string})=>!Array.isArray(old)||!old.some(o=>(o as {id:string}).id===r.id))]:rows);}else setData(r.data);
  }catch{if(n===epoch.current)setError(true);}finally{clearTimeout(timer);if(n===epoch.current)setLoading(false);}
 },[db,user?.id,view,merchant]);
 useEffect(()=>{setData(null);setMore(false);cursor.current=null;void load();const refresh=()=>void load();window.addEventListener('wallet:changed',refresh);return()=>{++epoch.current;controller.current?.abort();window.removeEventListener('wallet:changed',refresh);};},[load]);
 return{data,rows:(Array.isArray(data)?data:[]) as T[],snapshot:(!Array.isArray(data)?data:null) as MarketSnapshot|null,loading,error,more,load};
}
export function useMarketMutation(){
 const{db,user,online}=useApp(),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),epoch=useRef(0),abort=useRef<AbortController|null>(null),failure=useRef('');
 useEffect(()=>{++epoch.current;setError('');return()=>{++epoch.current;abort.current?.abort();};},[user?.id]);
 async function run<T>(rpc:string,params:Record<string,unknown>):Promise<T|null>{if(lock.current||!db||!user||!online)return null;lock.current=true;const n=epoch.current;setBusy(true);setError('');failure.current='';const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await db.rpc(rpc,params).abortSignal(controller.signal);if(n!==epoch.current)return null;if(r.error)throw r.error;walletChanged();return r.data as T;}
  catch(e){failure.current=marketError(e);if(n===epoch.current)setError(failure.current);return null;}finally{clearTimeout(timer);lock.current=false;if(n===epoch.current)setBusy(false);}
 }
 return{busy,error,setError,run,online,failure};
}
