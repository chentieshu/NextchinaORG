'use client';
import {useApp} from './Provider';
import {experienceCopy} from '@/lib/experience-copy';
export function AccountGate(){const{t,locale,authStatus,retryAuth}=useApp();return <main id="main" className="empty-state protected" aria-busy={authStatus==='loading'}><p role="status">{authStatus==='error'?experienceCopy[locale].authError:t.loading}</p>{authStatus==='error'&&<button className="button" onClick={()=>void retryAuth()}>{t.retry}</button>}</main>;}
