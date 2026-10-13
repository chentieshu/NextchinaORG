'use client';
import {useEffect,useRef,useState} from 'react';
import {FiUpload,FiX} from 'react-icons/fi';
import {useApp} from './Provider';
import {forumCopy} from '@/lib/forum-copy';
import {profileCopy,mediaErrorMessage} from '@/lib/profile-copy';
import {prepareContentImage,validateImageFile} from '@/lib/image-editor';
import {uploadContentImage} from '@/lib/media';
export function ImageInsert({onInsert,onClose,initialFile,onBusyChange}:{onInsert:(url:string,alt:string)=>void;onClose:()=>void;initialFile?:File|null;onBusyChange?:(busy:boolean)=>void}){
 const{locale,online}=useApp(),c=profileCopy[locale],f=forumCopy[locale];
 const[file,setFile]=useState<File|null>(null),[alt,setAlt]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const abort=useRef<AbortController|null>(null),pending=useRef(false);
 const[preview,setPreview]=useState('');
 useEffect(()=>{if(initialFile)try{validateImageFile(initialFile);setFile(initialFile);}catch(error){setError(mediaErrorMessage(error,c));}},[initialFile]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function upload(){if(!file||pending.current)return;pending.current=true;setBusy(true);setError('');const controller=new AbortController();abort.current=controller;
  try{const blob=await prepareContentImage(file);if(controller.signal.aborted)return;const url=await uploadContentImage(blob,controller.signal,setProgress);if(!controller.signal.aborted)onInsert(url,alt);}catch(e){if(!controller.signal.aborted)setError(mediaErrorMessage(e,c));}finally{pending.current=false;if(!controller.signal.aborted)setBusy(false);}
 }
 return <div className="insert-panel image-insert">{preview&&<img className="upload-preview" src={preview} alt={alt}/>}<label>{c.image}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const selected=e.target.files?.[0];setFile(null);setError('');if(selected)try{validateImageFile(selected);setFile(selected);}catch(error){setError(mediaErrorMessage(error,c));}}}/></label><label>{f.alt}<input value={alt} maxLength={300} disabled={busy} onChange={e=>setAlt(e.target.value)}/></label><button type="button" className="button primary" disabled={!file||busy||!online} onClick={()=>void upload()}><FiUpload/>{busy?`${c.progress} ${progress}%`:f.insert}</button><button type="button" className="icon-button" aria-label={c.cancel} onClick={onClose}><FiX/></button><p className="form-note">{c.hint}</p>{busy&&<progress max={100} value={progress} aria-label={c.progress}/>} {error&&<p role="alert">{error}</p>}</div>;
}
