'use client';
import {useCallback,useRef,type ReactNode} from 'react';
import {FiPlus,FiArrowUp,FiArrowDown,FiX} from 'react-icons/fi';
import {useApp} from './Provider';
import {PostComposer} from './PostComposer';
import {RichText} from './RichText';
import {threadCopy} from '@/lib/thread-copy';
import {normalizeDocument} from '@/lib/rich-content';
import {MAX_THREAD_PARTS,partHasContent,type ThreadPart} from '@/lib/post-thread';
import type {Translation} from '@/lib/types';

function PartEditor({part,disabled,update,busy}:{part:ThreadPart;disabled:boolean;update:(id:string,text:Translation)=>void;busy:(id:string,value:boolean)=>void}){
 const onBusy=useCallback((value:boolean)=>busy(part.key,value),[busy,part.key]);
 return <PostComposer document={normalizeDocument(part.text.document,part.text.body)} disabled={disabled} onBusyChange={onBusy} onChange={(document,body)=>update(part.key,{...part.text,document,body})}/>;
}
export function ThreadComposer({parts,disabled,preview,canAdd,quote,onBusyChange,onUpdate,onOrder,onAdd}:{parts:ThreadPart[];disabled:boolean;preview:boolean;canAdd:boolean;quote?:ReactNode;onBusyChange:(busy:boolean)=>void;onUpdate:(id:string,text:Translation)=>void;onOrder:(keys:string[])=>void;onAdd:()=>void}){
 const{locale}=useApp(),c=threadCopy[locale],pending=useRef(new Map<string,boolean>()),callback=useRef(onBusyChange),root=useRef<HTMLDivElement>(null);callback.current=onBusyChange;
 const busy=useCallback((id:string,value:boolean)=>{if(value)pending.current.set(id,true);else pending.current.delete(id);callback.current([...pending.current.values()].some(Boolean));},[]);
 function order(index:number,offset:number){const keys=parts.map(p=>p.key);[keys[index],keys[index+offset]]=[keys[index+offset],keys[index]];onOrder(keys);}
 function remove(part:ThreadPart){if((partHasContent(part)||pending.current.has(part.key))&&!confirm(c.removeConfirm))return;onOrder(parts.filter(p=>p.key!==part.key).map(p=>p.key));}
 function add(){onAdd();requestAnimationFrame(()=>{const editors=root.current?.querySelectorAll<HTMLElement>('.tiptap');editors?.[editors.length-1]?.focus();});}
 return <div ref={root} className={`thread-composer ${parts.length>1?'has-thread':''} ${preview?'writing-preview':''}`}>
  {parts.map((part,index)=><section key={part.key} className="thread-compose-part" data-part={index+1} aria-label={`${c.part} ${index+1}`}>
   {parts.length>1&&<div className="thread-part-toolbar"><span>{index+1} <i>/ {parts.length}</i></span>{!preview&&<div>
    <button type="button" className="icon-button" aria-label={`${c.earlier} ${index+1}`} disabled={disabled||index===0||!!part.quotedArticle||!!parts[index-1]?.quotedArticle} onClick={()=>order(index,-1)}><FiArrowUp/></button>
    <button type="button" className="icon-button" aria-label={`${c.later} ${index+1}`} disabled={disabled||index===parts.length-1||!!part.quotedArticle||!!parts[index+1]?.quotedArticle} onClick={()=>order(index,1)}><FiArrowDown/></button>
    <button type="button" className="icon-button" aria-label={`${c.remove} ${index+1}`} disabled={disabled||!!part.quotedArticle} onClick={()=>remove(part)}><FiX/></button>
   </div>}</div>}
   {preview?<RichText text={part.text} gallery/>:<PartEditor part={part} disabled={disabled} update={onUpdate} busy={busy}/>}
   {index===0&&quote}
   {parts.length>1&&<small className="thread-part-count">{part.text.body.length.toLocaleString(locale)} / 100,000</small>}
  </section>)}
  {!preview&&canAdd&&<div className="thread-add-row"><button type="button" className="text-link" disabled={disabled||parts.length>=MAX_THREAD_PARTS||!partHasContent(parts[parts.length-1])} onClick={add}><FiPlus/>{c.add}</button>{parts.length>1&&<small>{parts.length} / {MAX_THREAD_PARTS}</small>}</div>}
  {parts.length>=MAX_THREAD_PARTS&&<p className="form-note">{c.limit}</p>}
 </div>;
}
