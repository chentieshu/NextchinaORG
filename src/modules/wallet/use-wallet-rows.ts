'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
export function useWalletRows<T>(rpc:'omni_wallet_history'|'omni_wallet_requests',admin=false){
 const{db,user}=useApp(),[rows,setRows]=useState<T[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[hasMore,setHasMore]=useState(false);
 const controller=useRef<AbortController|null>(null),epoch=useRef(0),cursor=useRef<string|null>(null);
 const load=useCallback(async(more=false)=>{if(!db||!user)return;const seq=++epoch.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setLoading(true);setError(false);const timer=setTimeout(()=>abort.abort(),12000);
  try{const result=await db.rpc(rpc,rpc==='omni_wallet_history'?{before_sequence:more?cursor.current:null}:{before_id:more?cursor.current:null,admin_queue:admin}).abortSignal(abort.signal);
   if(seq!==epoch.current)return;if(result.error)throw result.error;const list=(result.data??[]).slice(0,20);setHasMore((result.data??[]).length>20);cursor.current=rpc==='omni_wallet_history'?list.at(-1)?.sequence:list.at(-1)?.id;
   setRows(old=>more?[...old,...list.filter((r:{id:string})=>!old.some(o=>(o as {id:string}).id===r.id))]:list);
  }catch{if(seq===epoch.current)setError(true);}finally{clearTimeout(timer);if(seq===epoch.current)setLoading(false);}
 },[db,user?.id,rpc,admin]);
 useEffect(()=>{setRows([]);void load();const refresh=()=>void load();window.addEventListener('wallet:changed',refresh);return()=>{++epoch.current;controller.current?.abort();window.removeEventListener('wallet:changed',refresh);};},[load]);
 return{rows,loading,error,hasMore,load};
}
