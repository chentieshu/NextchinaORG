'use client';
import {useEffect,useRef,useState} from 'react';
import Cropper from 'react-easy-crop';
import {FiRotateCw} from 'react-icons/fi';
import {Modal} from './Shell';
import {useApp} from './Provider';
import {composerCopy} from '@/lib/composer-copy';
import {profileCopy,mediaErrorMessage} from '@/lib/profile-copy';
import {cropContentImage,loadImage,type CropArea} from '@/lib/image-editor';
import {resolveMediaUrl} from '@/lib/media-origin';
import {isStoredImage} from '@/lib/media';
import 'react-easy-crop/react-easy-crop.css';

export default function PostImageEdit({image,onSave,onClose}:{image:{src?:string;preview?:string;alt:string};onSave:(alt:string,file?:File)=>void;onClose:()=>void}){
 const{locale,t}=useApp(),c=composerCopy[locale],p=profileCopy[locale];
 const[source,setSource]=useState(''),[alt,setAlt]=useState(image.alt),[error,setError]=useState(''),[busy,setBusy]=useState(false),[cropOpen,setCropOpen]=useState(false),[aspect,setAspect]=useState(1),[original,setOriginal]=useState(1),[crop,setCrop]=useState({x:0,y:0}),[zoom,setZoom]=useState(1),[rotation,setRotation]=useState(0),[area,setArea]=useState<CropArea|null>(null);
 const mounted=useRef(true),pending=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const abort=new AbortController();let url='';void(async()=>{try{
  if(image.preview){url=image.preview;}else{if(!image.src||!isStoredImage(image.src))throw Error('invalid_image');const response=await fetch(resolveMediaUrl(image.src),{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])});if(!response.ok)throw Error('upload_failed');url=URL.createObjectURL(await response.blob());}
  const photo=await loadImage(url);if(abort.signal.aborted)return;setOriginal(photo.naturalWidth/photo.naturalHeight);setAspect(photo.naturalWidth/photo.naturalHeight);setSource(url);
 }catch(e){if(!abort.signal.aborted)setError(mediaErrorMessage(e,p));}})();return()=>{abort.abort();if(url&&!image.preview)URL.revokeObjectURL(url);};},[image.src,image.preview,p]);
 async function apply(){if(pending.current)return;if(!cropOpen){onSave(alt.trim());return;}if(!area||!source)return;pending.current=true;setBusy(true);setError('');try{const blob=await cropContentImage(source,area,rotation);if(mounted.current)onSave(alt.trim(),new File([blob],'photo.webp',{type:'image/webp'}));}catch(e){if(mounted.current)setError(mediaErrorMessage(e,p));}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <Modal className="post-image-dialog" title={c.edit} onClose={()=>{if(!busy)onClose();}}><h2>{c.edit}</h2>
  {source&&(cropOpen?<><div className="post-crop-area"><Cropper image={source} crop={crop} zoom={zoom} rotation={rotation} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_,pixels)=>setArea(pixels)} disableAutomaticStylesInjection mediaProps={{alt}}/></div><div className="post-crop-tools"><label>{c.aspect}<select value={aspect} onChange={e=>{setAspect(Number(e.target.value));setCrop({x:0,y:0});setZoom(1);}}><option value={original}>{c.original}</option>{original!==1&&<option value={1}>{c.square}</option>}{original!==16/9&&<option value={16/9}>{c.wide}</option>}{original!==3/4&&<option value={3/4}>{c.portrait}</option>}</select></label><label>{p.zoom}<input aria-label={p.zoom} type="range" min="1" max="3" step=".05" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label><button className="button" onClick={()=>{setRotation(r=>(r+90)%360);setCrop({x:0,y:0});}}><FiRotateCw/>{p.rotate}</button></div></>:<div className="post-image-edit-preview"><img src={source} alt={alt}/><button className="button" onClick={()=>setCropOpen(true)}>{c.crop}</button></div>)}
  {!source&&!error&&<p role="status">{t.loading}</p>}
  <label className="post-image-description">{c.description}<textarea aria-label={c.description} value={alt} maxLength={300} rows={3} disabled={busy} onChange={e=>setAlt(e.target.value)} aria-describedby="post-image-description-hint"/><small id="post-image-description-hint">{c.descriptionHint}</small></label>
  {error&&<p role="alert" className="form-note">{error}</p>}<div className="post-image-edit-actions"><button className="button" disabled={busy} onClick={onClose}>{p.cancel}</button><button className="button primary" disabled={busy||cropOpen&&!area} onClick={()=>void apply()}>{busy?p.processing:c.apply}</button></div>
 </Modal>;
}
