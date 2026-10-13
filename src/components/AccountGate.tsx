'use client';
import {useApp} from './Provider';
import {experienceCopy} from '@/lib/experience-copy';
export function AccountGate({embedded=false}:{embedded?:boolean}){const{t,locale,authStatus,retryAuth}=useApp();const Tag=embedded?'div':'main';return <Tag id={embedded?undefined:'main'} className={`empty-state ${embedded?'':'protected'}`} aria-busy={authStatus==='loading'}><p role="status">{authStatus==='error'?experienceCopy[locale].authError:t.loading}</p>{authStatus==='error'&&<button className="button" onClick={()=>void retryAuth()}>{t.retry}</button>}</Tag>;}
