'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './Provider';
import {socialCopy} from '@/lib/social-copy';
export function FollowButton({id,following,disabled=false,onChange}:{id:string;following:boolean;disabled?:boolean;onChange?:()=>void}){
 const{db,user,profile,locale,setAuthOpen,authStatus,online,refresh,notify}=useApp(),c=socialCopy[locale];
 const[busy,setBusy]=useState(false),pending=useRef(false),actor=useRef(user?.id),alive=useRef(true);actor.current=user?.id;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function toggle(){
  if(!user){setAuthOpen(true);return;}if(!db||pending.current||disabled||profile?.disabled||!online||authStatus!=='ready')return;
  const owner=user.id,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);pending.current=true;setBusy(true);
  try{const query=following?db.from('omni_follows').delete().eq('follower_id',owner).eq('following_id',id):db.from('omni_follows').insert({follower_id:owner,following_id:id});const{error}=await query.abortSignal(controller.signal);if(error&&error.code!=='23505')throw error;if(actor.current!==owner||!alive.current)return;onChange?.();await refresh();}
  catch{if(actor.current===owner&&alive.current){notify(c.error);void refresh();}}finally{clearTimeout(timeout);pending.current=false;if(alive.current)setBusy(false);}
 }
 if(user?.id===id)return null;
 return <button className={`button follow-button ${following?'':'primary'}`} disabled={disabled||busy||!online||authStatus==='loading'||!!profile?.disabled} aria-pressed={following} onClick={()=>void toggle()}>{following?c.following:c.follow}</button>;
}
