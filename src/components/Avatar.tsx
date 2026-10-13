'use client';
import Link from 'next/link';
import {ConnectedBadges} from './ConnectedAccounts';
import {useState} from 'react';
import {mediaUrl} from '@/lib/media';
import {useApp} from './Provider';
export function Avatar({name,avatarKey,size=32,preview}:{name:string;avatarKey?:string|null;size?:number;preview?:string}){
 const src=preview??mediaUrl(avatarKey),[failed,setFailed]=useState<string|null>(null);
 return <span className="user-avatar" style={{width:size,height:size}} aria-hidden="true">{src&&failed!==src?<img src={src} alt="" width={size} height={size} decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>:<span>{Array.from(name.trim()||'?').slice(0,1).join('').toLocaleUpperCase()}</span>}</span>;
}
export function UserIdentity({id,name,avatarKey,handle,size=28}:{id?:string|null;name?:string;avatarKey?:string|null;handle?:string;size?:number}){
 const{profile,locale}=useApp(),own=profile?.id===id?profile:null,display=own?.display_name??name??'Explorer';
 const content=<><Avatar name={display} avatarKey={own?own.avatar_key:avatarKey} size={size}/><span className="identity-names" title={display}><b>{display}</b>{(own?.handle??handle)&&<small>@{own?.handle??handle}</small>}</span></>;
 return id?<span className="user-identity-group"><Link className="user-identity" href={`/${locale}/profile/?id=${id}`}>{content}</Link><ConnectedBadges id={id}/></span>:<span className="user-identity"><Avatar name={display} avatarKey={own?own.avatar_key:avatarKey} size={size}/><span title={display}>{display}</span></span>;
}
