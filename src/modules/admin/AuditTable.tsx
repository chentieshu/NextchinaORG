'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import type {ColumnDef} from '@tanstack/react-table';
import {RecordTable} from '@/components/data/RecordTable';
import {dataCopy} from '@/components/data/copy';
import {useApp} from '@/components/Provider';
export type AuditRow={id:number;actor_id:string;action:string;target:string;created_at:string};
export function AuditTable({rows}:{rows:AuditRow[]}){
 const{locale,t}=useApp(),c=dataCopy[locale];
 const columns=useMemo<ColumnDef<AuditRow>[]>(()=>[
  {accessorKey:'created_at',header:c.date,cell:({row})=><time dateTime={row.original.created_at}>{new Date(row.original.created_at).toLocaleString(locale)}</time>},
  {accessorKey:'action',header:c.action},
  {accessorKey:'target',header:c.target,cell:({getValue})=><code>{String(getValue()??'—')}</code>},
  {accessorKey:'actor_id',header:c.actor,cell:({row})=>row.original.actor_id?<Link title={row.original.actor_id} href={`/${locale}/profile/?id=${encodeURIComponent(row.original.actor_id)}`}><code>{row.original.actor_id.slice(0,8)}…</code></Link>:'—'}
 ],[locale,c]);
 return <RecordTable rows={rows} columns={columns} locale={locale} caption={t.audit} empty={c.empty} initialSort={[{id:'created_at',desc:true}]}/>;
}
