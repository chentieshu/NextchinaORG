'use client';
import dynamic from 'next/dynamic';
import {useState} from 'react';
import {FiGift} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import type {Article} from '@/lib/types';
import {walletCopy} from './copy';
const TipDialog=dynamic(()=>import('./TipDialog'),{ssr:false});
export function TipAction({article}:{article:Article}){const{user,profile,locale,authStatus,setAuthOpen,online}=useApp(),[open,setOpen]=useState(false);
 if(!article.author_id||article.status!=='published'||article.author_id===user?.id)return null;
 return <><button aria-label={walletCopy[locale].tip} title={walletCopy[locale].tip} disabled={authStatus!=='ready'||!online||!!profile?.disabled} onClick={()=>{if(!user)setAuthOpen(true);else setOpen(true);}}><FiGift/></button>{open&&user&&<TipDialog key={user.id} article={article} onClose={()=>setOpen(false)}/>}</>;
}
