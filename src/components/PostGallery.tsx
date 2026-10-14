'use client';
import {useEffect,useRef,useState} from 'react';
import {FiChevronLeft,FiChevronRight} from 'react-icons/fi';
import {Modal} from './Shell';
import {useApp} from './Provider';
import {composerCopy} from '@/lib/composer-copy';
import type {PostImage} from '@/lib/post-document';
export function PostGallery({images}:{images:PostImage[]}){
 const{locale}=useApp(),c=composerCopy[locale],[selected,setSelected]=useState<number|null>(null),start=useRef<number|null>(null),items=images.slice(0,4);
 const active=selected===null?null:items[selected];
 useEffect(()=>{if(selected===null)return;const key=(e:KeyboardEvent)=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setSelected(i=>i===null?null:Math.max(0,Math.min(items.length-1,i+(e.key==='ArrowLeft'?-1:1))));}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[selected,items.length]);
 if(!items.length)return null;
 return <><div className="post-gallery" data-count={items.length}>{items.map((image,index)=><button type="button" key={index} aria-label={`${c.preview} ${index+1} / ${items.length}`} onClick={()=>setSelected(index)}><img src={image.src} alt={image.alt} loading="lazy" referrerPolicy="no-referrer"/>{image.alt&&<span>ALT</span>}</button>)}</div>
  {active&&<Modal className="post-gallery-dialog" title={`${c.preview} ${(selected??0)+1} / ${items.length}`} onClose={()=>setSelected(null)}><div className="post-gallery-view" onPointerDown={e=>{if(!(e.target as Element).closest('button'))start.current=e.clientX;}} onPointerUp={e=>{if(start.current===null)return;const delta=e.clientX-start.current;start.current=null;if(Math.abs(delta)>50)setSelected(i=>i===null?null:Math.max(0,Math.min(items.length-1,i+(delta>0?-1:1))));}} onPointerCancel={()=>{start.current=null;}}><img src={active.src} alt={active.alt} referrerPolicy="no-referrer" draggable={false}/><div className="post-gallery-pagination"><button type="button" className="icon-button" aria-label={c.previous} disabled={selected===0} onClick={()=>setSelected(i=>Math.max(0,(i??0)-1))}><FiChevronLeft/></button><span aria-live="polite">{(selected??0)+1} / {items.length}</span><button type="button" className="icon-button" aria-label={c.next} disabled={selected===items.length-1} onClick={()=>setSelected(i=>Math.min(items.length-1,(i??0)+1))}><FiChevronRight/></button></div>{active.alt&&<p className="post-gallery-caption">{active.alt}</p>}</div></Modal>}
 </>;
}
