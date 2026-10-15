'use client';
import {useApp} from '@/components/Provider';
import {useIdentity} from './use-identity';
import {identityCopy} from './copy';
import './identity.css';
export function IdentityBadges({id}:{id?:string|null}){const{locale}=useApp(),value=useIdentity(id),c=identityCopy[locale],title=value.title?.[locale]??value.title?.en;if(!value.level&&!title)return null;return <span className="identity-badges">{value.level!==null&&<span className="identity-level" aria-label={`${c.level} ${value.level}`}>Lv.{value.level}</span>}{title&&<span className="identity-title" title={c.title}>{title}</span>}</span>;}
