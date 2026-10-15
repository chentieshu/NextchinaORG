'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {useApp} from '@/components/Provider';
import {SITE_ORIGIN} from '@/lib/site';
import {socialCopy} from '@/lib/social-copy';
const AuthDialog=dynamic(()=>import('@/components/AuthDialog'),{ssr:false});
export function AdminShell({children}:{children:React.ReactNode}){const{locale,t,user,profile,authOpen,setAuthOpen,logout}=useApp();return <div className="admin-site"><header style={{display:'flex',gap:24,alignItems:'center',flexWrap:'wrap',padding:'18px 24px',borderBottom:'1px solid var(--line)'}}><Link href={`/${locale}/`}><b>ChinaTeam · {t.admin}</b></Link><a href={`${SITE_ORIGIN}/${locale}/`}>{t.home} ↗</a><Link href={`/${locale}/settings/#email-verification`}>{socialCopy[locale].settings}</Link><span style={{marginLeft:'auto'}}>{profile?.display_name}</span>{user&&<button onClick={()=>void logout()}>{t.logout}</button>}</header>{children}{authOpen&&!user&&<AuthDialog/>}</div>;}
