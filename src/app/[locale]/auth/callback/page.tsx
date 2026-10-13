'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useApp} from '@/components/Provider';
export default function Callback(){const{locale,t,db}=useApp();const[error,setError]=useState(false);
 useEffect(()=>{const p=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));if(!db||p.has('error')||hash.has('error')){setError(true);return;}let active=true;const timer=setTimeout(()=>setError(true),15000);
  // Wait for the client's URL/PKCE exchange before accepting the login.
  db.auth.getSession().then(({data,error})=>{if(!active)return;if(error||!data.session){setError(true);return;}let next=hash.get('type')==='recovery'?'settings':'';try{next=sessionStorage.getItem('nextchina-auth-next')||next;sessionStorage.removeItem('nextchina-auth-next');}catch{}location.replace(`/${locale}/${next==='settings'?'settings/#security':''}`);}).catch(()=>{if(active)setError(true);});return()=>{active=false;clearTimeout(timer);};
 },[db,locale]);return <main id="main" className="empty-state"><h1>{error?t.error:t.loading}</h1>{error&&<Link className="button" href={`/${locale}/`}>{t.home}</Link>}</main>;}
