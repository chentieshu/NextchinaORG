'use client';
import {useState,type ReactNode} from 'react';
import {flexRender,getCoreRowModel,getFilteredRowModel,getSortedRowModel,useReactTable,type ColumnDef,type SortingState,type RowData} from '@tanstack/react-table';
import {FiArrowDown,FiArrowUp,FiSearch,FiX} from 'react-icons/fi';
import {dataCopy} from './copy';
import type {Locale} from '@/lib/i18n';
declare module '@tanstack/react-table' {interface ColumnMeta<TData extends RowData,TValue>{className?:string}}
export function RecordTable<T>({rows,columns,locale,caption,empty,loading=false,tools,initialSort=[],loadedCount=rows.length}:{rows:T[];columns:ColumnDef<T>[];locale:Locale;caption:string;empty:string;loading?:boolean;tools?:ReactNode;initialSort?:SortingState;loadedCount?:number}){
 const c=dataCopy[locale],[sorting,setSorting]=useState<SortingState>(initialSort),[search,setSearch]=useState('');
 const table=useReactTable({data:rows,columns,state:{sorting,globalFilter:search},onSortingChange:setSorting,onGlobalFilterChange:setSearch,getCoreRowModel:getCoreRowModel(),getFilteredRowModel:getFilteredRowModel(),getSortedRowModel:getSortedRowModel(),globalFilterFn:'includesString',getRowId:(row,index)=>String((row as {id?:unknown}).id??index),autoResetAll:false});
 return <div className="record-table" aria-busy={loading}>
  <div className="record-toolbar"><label className="record-search"><FiSearch aria-hidden="true"/><input type="search" aria-label={c.search} placeholder={c.search} maxLength={120} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" className="icon-button" aria-label={c.clear} title={c.clear} onClick={()=>setSearch('')}><FiX/></button>}</label>{tools}</div>
  <div className="record-scroll" tabIndex={0} role="region" aria-label={caption}>
   <table><caption className="sr-only">{caption}</caption><thead>{table.getHeaderGroups().map(group=><tr key={group.id}>{group.headers.map(header=>{const sorted=header.column.getIsSorted();return <th key={header.id} scope="col" aria-sort={sorted==='asc'?'ascending':sorted==='desc'?'descending':undefined} className={header.column.columnDef.meta?.className}>{header.isPlaceholder?null:header.column.getCanSort()?<button type="button" title={c.sort} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header,header.getContext())}{sorted==='asc'?<FiArrowUp aria-hidden="true"/>:sorted==='desc'?<FiArrowDown aria-hidden="true"/>:<span className="sort-marker" aria-hidden="true">↕</span>}<span className="sr-only"> · {c.sort}</span></button>:flexRender(header.column.columnDef.header,header.getContext())}</th>;})}</tr>)}</thead>
   <tbody>{table.getRowModel().rows.map(row=><tr key={row.id}>{row.getVisibleCells().map(cell=><td key={cell.id} className={cell.column.columnDef.meta?.className}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}</tr>)}{!table.getRowModel().rows.length&&<tr><td colSpan={columns.length} className="record-empty">{loading?'…':empty}</td></tr>}</tbody></table>
  </div><div className="record-footnote"><span>{(search||table.getRowModel().rows.length!==loadedCount)&&<>{c.matches} <b>{new Intl.NumberFormat(locale).format(table.getRowModel().rows.length)}</b> / </>}{c.loaded} <b>{new Intl.NumberFormat(locale).format(loadedCount)}</b></span><span>{c.local}</span></div>
 </div>;
}
