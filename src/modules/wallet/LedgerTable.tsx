'use client';
import {useMemo,useState} from 'react';
import type {ColumnDef} from '@tanstack/react-table';
import {FiArrowDownLeft,FiArrowUpRight,FiMinus,FiRepeat,FiCreditCard,FiGift,FiLock} from 'react-icons/fi';
import {RecordTable} from '@/components/data/RecordTable';
import {dataCopy} from '@/components/data/copy';
import {useApp} from '@/components/Provider';
import {issuanceCopy} from './issuance-copy';
import {walletCopy} from './copy';
import {identityCopy} from '../identity/copy';
import {marketCopy} from './market-copy';
import {formatPoints,type WalletEntry} from './money';
export function LedgerTable({rows,loading}:{rows:WalletEntry[];loading:boolean}){
 const{locale}=useApp(),c=walletCopy[locale],d=dataCopy[locale],m=marketCopy[locale],[direction,setDirection]=useState('all');
 const data=useMemo(()=>rows.filter(row=>direction==='all'||(direction==='incoming'?BigInt(row.delta)>0n:direction==='outgoing'?BigInt(row.delta)<0n:BigInt(row.delta)===0n)),[rows,direction]);
 const columns=useMemo<ColumnDef<WalletEntry>[]>(()=>[
  {id:'kind',accessorFn:row=>{const key=row.kind==='deposit'?'deposit_kind':row.kind==='tip'?'tip_kind':row.kind;return row.kind==='points_grant'?issuanceCopy[locale].grant:row.kind==='points_issue'?issuanceCopy[locale].issue:row.kind==='admin_adjust'?identityCopy[locale].adjust:String(m[row.kind as keyof typeof m]??c[key as keyof typeof c]??row.kind);},header:d.type,cell:({row,getValue})=>{const r=row.original,Icon=r.kind==='tip'?FiGift:r.kind==='deposit'?FiCreditCard:r.kind==='withdraw_hold'?FiLock:FiRepeat;return <div className="ledger-kind"><Icon aria-hidden="true"/><div><span>{String(getValue())}</span>{r.kind==='tip'&&<small>{BigInt(r.delta)<0n?c.sent:c.received}</small>}</div></div>;}},
  {accessorKey:'created_at',header:d.date,meta:{className:'ledger-time'},cell:({row})=><time dateTime={row.original.created_at} title={new Date(row.original.created_at).toLocaleString(locale)}><span>{new Date(row.original.created_at).toLocaleDateString(locale)}</span><span>{new Date(row.original.created_at).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</span></time>},
  {accessorKey:'delta',header:d.amount,sortDescFirst:true,meta:{className:'numeric'},sortingFn:(a,b)=>{const x=BigInt(a.original.delta),y=BigInt(b.original.delta);return x<y?-1:x>y?1:0;},cell:({row})=>{const value=BigInt(row.original.delta),Icon=value>0n?FiArrowDownLeft:value<0n?FiArrowUpRight:FiMinus;return <span className={`ledger-amount ${value>0n?'incoming':value<0n?'outgoing':'unchanged'}`} title={value>0n?d.incoming:value<0n?d.outgoing:d.unchanged}><Icon aria-hidden="true"/>{value>0n?'+':value<0n?'−':''}{formatPoints(value<0n?-value:value,locale)}</span>;}}
 ],[locale,c,d,m]);
 return <RecordTable rows={data} loadedCount={rows.length} columns={columns} locale={locale} caption={c.history} empty={d.empty} loading={loading} initialSort={[]} tools={<select aria-label={d.direction} value={direction} onChange={e=>setDirection(e.target.value)}>{(['all','incoming','outgoing','unchanged'] as const).map(key=><option key={key} value={key}>{d[key]}</option>)}</select>}/>;
}
