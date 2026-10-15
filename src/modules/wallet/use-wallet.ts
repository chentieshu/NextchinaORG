'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import type {WalletSnapshot} from './money';
export function useWallet(){
 const{db,user}=useApp(),[data,setData]=useState<WalletSnapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const controller=useRef<AbortController|null>(null),epoch=useRef(0);
 const refresh=useCallback(async()=>{const seq=++epoch.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  if(!db||!user){setData(null);setLoading(false);return;}setLoading(true);setError(false);const timer=setTimeout(()=>abort.abort(),12000);
  try{const result=await db.rpc('omni_wallet_snapshot').abortSignal(abort.signal);if(seq!==epoch.current)return;if(result.error)throw result.error;setData(result.data);}catch{if(seq===epoch.current)setError(true);}finally{clearTimeout(timer);if(seq===epoch.current)setLoading(false);}
 },[db,user?.id]);
 useEffect(()=>{setData(null);void refresh();const visible=()=>{if(document.visibilityState==='visible')void refresh();};window.addEventListener('wallet:changed',refresh);document.addEventListener('visibilitychange',visible);return()=>{++epoch.current;controller.current?.abort();window.removeEventListener('wallet:changed',refresh);document.removeEventListener('visibilitychange',visible);};},[refresh]);
 return{data,loading,error,refresh};
}
export function walletChanged(){window.dispatchEvent(new Event('wallet:changed'));}
