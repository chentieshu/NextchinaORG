'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useApp} from '@/components/Provider';
export default function Callback(){const{locale,t,user,db}=useApp();const[error,setError]=useState(false);useEffect(()=>{const p=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));if(!db||p.has('error')||hash.has('error'))setError(true);const timer=setTimeout(()=>setError(true),15000);return()=>clearTimeout(timer);},[db]);useEffect(()=>{if(user)location.replace(`/${locale}/`);},[user,locale]);return <main id="main" className="empty-state"><h1>{error?t.error:t.loading}</h1>{error&&<Link className="button" href={`/${locale}/`}>{t.home}</Link>}</main>;}
