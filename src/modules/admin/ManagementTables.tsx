'use client';
import Link from 'next/link';
import {useMemo} from 'react';
import {FiMapPin,FiLock} from 'react-icons/fi';
import type {ColumnDef} from '@tanstack/react-table';
import {useApp} from '@/components/Provider';
import {RecordTable} from '@/components/data/RecordTable';
import {StatusBadge} from '@/components/data/StatusBadge';
import {ContentManagement} from '@/components/ContentManagement';
import {UserIdentity} from '@/components/Avatar';
import {articleText} from '@/lib/content';
import {SITE_ORIGIN} from '@/lib/site';
import {forumCopy} from '@/lib/forum-copy';
import {workspaceCopy} from './copy';
import type {Article,Profile} from '@/lib/types';
export function ContentTable({rows,onChange}:{rows:Article[];onChange:()=>void}){
 const{locale,t,categoryName}=useApp(),c=workspaceCopy[locale],f=forumCopy[locale];
 const columns=useMemo<ColumnDef<Article>[]>(()=>[
  {id:'content',accessorFn:row=>{const text=articleText(row,locale);return text.title||text.body.slice(0,140)||text.summary||f.post;},header:c.content,enableSorting:false,cell:({row,getValue})=><div><Link className="admin-row-title" href={`${SITE_ORIGIN}/${locale}/${row.original.content_type==='post'?'community':'news'}/?id=${row.original.id}`}>{String(getValue())}</Link><div className="admin-row-flags">{row.original.featured&&<span title={f.pin}><FiMapPin aria-hidden="true"/>{f.pin}</span>}{row.original.locked&&<span title={f.lock}><FiLock aria-hidden="true"/>{f.lock}</span>}</div></div>},
  {accessorKey:'author_name',header:c.author,cell:({row})=><UserIdentity origin={SITE_ORIGIN} id={row.original.author_id} name={row.original.author_name} avatarKey={row.original.author_avatar_key} handle={row.original.author_handle} size={28}/>},
  {accessorKey:'status',header:t.status,cell:({row})=><StatusBadge tone={row.original.status==='published'?'positive':row.original.status==='draft'?'warning':'neutral'}>{t[row.original.status]}</StatusBadge>},
  {id:'category',accessorFn:row=>categoryName(row.category),header:t.category},
  {accessorKey:'updated_at',header:c.updated,cell:({row})=>{const value=row.original.updated_at??row.original.created_at;return <time dateTime={value} title={new Date(value).toLocaleString(locale)}>{new Date(value).toLocaleDateString(locale)}</time>;}},
  {id:'actions',header:c.actions,enableSorting:false,cell:({row})=><ContentManagement compact expanded article={row.original} onChange={onChange} onDeleted={onChange}/>}
 ],[locale,t,c,f,categoryName,onChange]);
 return <div className="admin-article-list"><RecordTable rows={rows} columns={columns} locale={locale} caption={c.content} empty={c.noData} searchable={false}/></div>;
}
export function MembersTable({rows,busy,onChange}:{rows:Profile[];busy:boolean;onChange:(profile:Profile,role:string,disabled:boolean)=>void}){
 const{locale,t,user,online}=useApp(),c=workspaceCopy[locale];
 const columns=useMemo<ColumnDef<Profile>[]>(()=>[
  {accessorKey:'display_name',header:t.members,cell:({row})=><UserIdentity origin={SITE_ORIGIN} id={row.original.id} name={row.original.display_name} avatarKey={row.original.avatar_key} handle={row.original.handle} size={32}/>},
  {accessorKey:'role',header:t.role,cell:({row})=>{const p=row.original;return <select className="member-role" aria-label={`${p.display_name} ${t.role}`} value={p.role} disabled={busy||!online||p.role==='super_admin'||p.id===user?.id} onChange={e=>onChange(p,e.target.value,p.disabled)}><option value="member">{t.member}</option><option value="editor">{t.editorRole}</option>{p.role==='super_admin'&&<option value="super_admin">{t.super_admin}</option>}</select>;}},
  {accessorKey:'created_at',header:c.created,cell:({row})=><time dateTime={row.original.created_at}>{new Date(row.original.created_at).toLocaleDateString(locale)}</time>},
  {id:'state',accessorFn:row=>row.disabled?t.suspended:t.active,header:t.status,cell:({row})=><StatusBadge tone={row.original.disabled?'warning':'positive'}>{row.original.disabled?t.suspended:t.active}</StatusBadge>},
  {id:'actions',header:c.actions,enableSorting:false,cell:({row})=>{const p=row.original;return <button className="member-state" disabled={busy||!online||p.role==='super_admin'||p.id===user?.id} onClick={()=>onChange(p,p.role,!p.disabled)}>{p.disabled?t.suspended:t.active}</button>;}}
 ],[locale,t,user?.id,online,c,busy,onChange]);
 return <div className="member-list"><RecordTable rows={rows} columns={columns} locale={locale} caption={t.members} empty={c.noData} searchable={false}/></div>;
}
