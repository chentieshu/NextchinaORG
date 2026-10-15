'use client';
import Link from 'next/link';
import {useApp} from '@/components/Provider';
import {walletCopy} from './copy';
import {identityCopy} from '../identity/copy';
export function WalletNav({active}:{active:'balance'|'c2c'}){const{locale}=useApp(),c=identityCopy[locale];return <nav className="wallet-tabs wallet-sections" aria-label={walletCopy[locale].title}>{([['balance',`/${locale}/wallet/`,c.balance],['c2c',`/${locale}/wallet/market/`,c.exchange]] as const).map(([key,href,label])=><Link key={key} href={href} aria-current={key===active?'page':undefined}>{label}</Link>)}</nav>;}
