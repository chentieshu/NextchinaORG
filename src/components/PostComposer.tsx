'use client';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {FiArrowLeft,FiArrowRight,FiEdit2,FiRefreshCw,FiX} from 'react-icons/fi';
import {RichEditor} from './RichEditor';
import {useApp} from './Provider';
import {composerCopy} from '@/lib/composer-copy';
import {socialCopy} from '@/lib/social-copy';
import {profileCopy,mediaErrorMessage} from '@/lib/profile-copy';
import {prepareContentImage,validateImageFile} from '@/lib/image-editor';
import {uploadContentImage} from '@/lib/media';
import {documentText} from '@/lib/rich-content';
import {joinPostDocument,splitPostDocument,MAX_POST_IMAGES,type PostImage} from '@/lib/post-document';
import type {RichNode} from '@/lib/types';
const PostImageEdit=dynamic(()=>import('./PostImageEdit'),{ssr:false});
type Photo={id:string;src?:string;alt:string;preview?:string;file?:File;status:'ready'|'queued'|'uploading'|'error';progress:number;error?:string};
function savedPhotos(images:PostImage[]):Photo[]{return images.map(image=>({...image,id:crypto.randomUUID(),status:'ready',progress:100}));}
export function PostComposer({document,onChange,disabled,onBusyChange}:{document:RichNode;onChange:(doc:RichNode,body:string)=>void;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const{locale,online}=useApp(),c=composerCopy[locale],p=profileCopy[locale];
 const [photos,setPhotos]=useState<Photo[]>(()=>savedPhotos(splitPostDocument(document).images)),[error,setError]=useState(''),[editing,setEditing]=useState<string|null>(null);
 const input=useRef<HTMLInputElement>(null),rows=useRef(photos),latest=useRef(document),callback=useRef({onChange,onBusyChange}),alive=useRef(true),running=useRef(false),requests=useRef(new Map<string,AbortController>()),urls=useRef(new Set<string>()),epoch=useRef(0),blocked=useRef(disabled||!online);
 const signature=JSON.stringify(splitPostDocument(document).images),expected=useRef(signature),observed=useRef(signature),emitted=useRef(new Set<string>());
 latest.current=document;callback.current={onChange,onBusyChange};blocked.current=disabled||!online;
 const unresolved=photos.some(photo=>photo.status!=='ready');
 useEffect(()=>{onBusyChange(unresolved||!!editing);},[unresolved,editing,onBusyChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;++epoch.current;requests.current.forEach(request=>request.abort());urls.current.forEach(url=>URL.revokeObjectURL(url));callback.current.onBusyChange(false);};},[]);
 // A restored or externally refreshed draft replaces this queue. Local changes use the same document.
 useEffect(()=>{if(signature===observed.current)return;observed.current=signature;if(signature===expected.current){emitted.current.clear();return;}if(emitted.current.has(signature)){emitted.current.delete(signature);return;}expected.current=signature;emitted.current.clear();++epoch.current;requests.current.forEach(request=>request.abort());const restored=savedPhotos(splitPostDocument(document).images);rows.current=restored;setPhotos(restored);setEditing(null);setError('');urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();},[signature,document]);
 // Parent renders can acknowledge an earlier upload while another upload has already completed.
 // Such acknowledgements are not a draft restore and must not reset/cancel the live queue.
 function emit(next:Photo[],body=latest.current){const doc=joinPostDocument(body,next.flatMap(photo=>photo.src?[{src:photo.src,alt:photo.alt}]:[]));expected.current=JSON.stringify(splitPostDocument(doc).images);if(expected.current!==observed.current)emitted.current.add(expected.current);if(emitted.current.size>64)emitted.current.delete(emitted.current.values().next().value!);latest.current=doc;callback.current.onChange(doc,documentText(doc));}
 function change(next:Photo[],persist=true){rows.current=next;setPhotos(next);callback.current.onBusyChange(next.some(photo=>photo.status!=='ready')||!!editing);if(persist)emit(next);}
 function release(photo:Photo){if(photo.preview&&urls.current.delete(photo.preview))URL.revokeObjectURL(photo.preview);}
 function preview(file:File){const url=URL.createObjectURL(file);urls.current.add(url);return url;}
 async function drain(){
  if(running.current||blocked.current||!alive.current)return;running.current=true;
  try{while(alive.current&&!blocked.current){
   const photo=rows.current.find(p=>p.status==='queued');if(!photo?.file)break;
   const controller=new AbortController(),generation=epoch.current;requests.current.set(photo.id,controller);
   change(rows.current.map(p=>p.id===photo.id?{...p,status:'uploading',progress:0,error:''}:p),false);
   try{const blob=await prepareContentImage(photo.file);if(controller.signal.aborted||!alive.current)continue;
    const src=await uploadContentImage(blob,controller.signal,progress=>{if(alive.current&&!controller.signal.aborted)change(rows.current.map(p=>p.id===photo.id?{...p,progress}:p),false);});
    if(!alive.current||controller.signal.aborted||generation!==epoch.current)continue;
    change(rows.current.map(p=>p.id===photo.id?{...p,src,status:'ready',progress:100,error:''}:p));
   }catch(e){const message=mediaErrorMessage(e,p);if(alive.current&&!controller.signal.aborted&&generation===epoch.current)change(rows.current.map(photoRow=>photoRow.id===photo.id?{...photoRow,status:'error',error:message===p.error?c.failed:message}:photoRow),false);}
   finally{requests.current.delete(photo.id);}
  }}finally{running.current=false;}
 }
 useEffect(()=>{if(online&&!disabled)void drain();},[online,disabled]);
 function add(files:File[]){if(disabled||!files.length)return;setError('');if(rows.current.length+files.length>MAX_POST_IMAGES){setError(c.limit);return;}
  try{files.forEach(validateImageFile);const added=files.map(file=>({id:crypto.randomUUID(),file,preview:preview(file),alt:'',status:'queued' as const,progress:0}));change([...rows.current,...added]);void drain();}catch(e){setError(mediaErrorMessage(e,p));}
 }
 function remove(id:string){const photo=rows.current.find(p=>p.id===id);requests.current.get(id)?.abort();if(photo)release(photo);change(rows.current.filter(p=>p.id!==id));setError('');}
 function move(id:string,offset:number){const list=[...rows.current],index=list.findIndex(p=>p.id===id),target=index+offset;if(index<0||target<0||target>=list.length)return;[list[index],list[target]]=[list[target],list[index]];change(list);}
 function bodyChange(body:RichNode){const split=splitPostDocument(body);if(split.images.length){if(rows.current.length+split.images.length>MAX_POST_IMAGES)setError(c.limit);else{const next=[...rows.current,...savedPhotos(split.images)];rows.current=next;setPhotos(next);}}emit(rows.current,split.body);}
 const photoToEdit=photos.find(photo=>photo.id===editing);
 return <div className="post-composer">
  <input ref={input} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={c.photos} disabled={disabled} onChange={e=>{add(Array.from(e.target.files??[]));e.target.value='';}}/>
  <RichEditor document={splitPostDocument(document).body} onChange={bodyChange} locale={locale} variant="post" label={socialCopy[locale].postPlaceholder} disabled={disabled} maxImages={MAX_POST_IMAGES} mediaCount={photos.length} onImageFiles={add} onChooseImages={()=>input.current?.click()} attachments={photos.length>0&&<div className="post-image-grid" data-count={photos.length} aria-label={c.photos}>
   {photos.map((photo,index)=><figure className="post-image-tile" key={photo.id} data-state={photo.status}>
    <img src={photo.preview??photo.src} alt={photo.alt}/><span className="post-image-number">{index+1}</span>
    <button className="photo-remove" type="button" aria-label={`${c.remove} ${index+1}`} disabled={disabled} onClick={()=>remove(photo.id)}><FiX/></button>
    <div className="post-image-tools"><button type="button" aria-label={`${c.before} ${index+1}`} disabled={disabled||index===0} onClick={()=>move(photo.id,-1)}><FiArrowLeft/></button><button type="button" aria-label={`${c.after} ${index+1}`} disabled={disabled||index===photos.length-1} onClick={()=>move(photo.id,1)}><FiArrowRight/></button><button className="photo-edit" type="button" aria-label={`${c.edit} ${index+1}`} disabled={disabled||photo.status==='uploading'||photo.status==='queued'} onClick={()=>setEditing(photo.id)}><FiEdit2/><span>{photo.alt?'ALT':c.edit}</span></button></div>
    {photo.status!=='ready'&&<div className="post-image-status" role={photo.status==='error'?'alert':'status'}>{photo.status==='error'?<><span>{photo.error??c.failed}</span><button className="button" disabled={!online||disabled} aria-label={`${c.retry} ${index+1}`} onClick={()=>{change(rows.current.map(p=>p.id===photo.id?{...p,status:'queued',error:''}:p),false);void drain();}}><FiRefreshCw/>{c.retry}</button></>:<><span>{photo.status==='queued'?c.waiting:`${c.uploading} ${photo.progress}%`}</span><progress max={100} value={photo.progress} aria-label={`${c.uploading} ${index+1}`}/></>}</div>}
   </figure>)}
  </div>}/>
  {unresolved&&<p className="post-media-hint" role="status">{c.pending}</p>}{error&&<p className="form-note" role="alert">{error}</p>}
  {photoToEdit&&<PostImageEdit image={photoToEdit} onClose={()=>setEditing(null)} onSave={(alt,file)=>{const id=photoToEdit.id;setEditing(null);const next=rows.current.map(photo=>{if(photo.id!==id)return photo;if(!file)return {...photo,alt};release(photo);return {...photo,alt,file,preview:preview(file),status:'queued' as const,error:'',progress:0};});change(next);if(file)void drain();}}/>}
 </div>;
}
