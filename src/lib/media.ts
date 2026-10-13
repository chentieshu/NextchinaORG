import {getSupabase} from './supabase';
import type {Profile} from './types';
export const MEDIA_ORIGIN='https://media.chinateam.org';
const keyPattern=/^(avatars|content)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|png|jpg)$/;
export function mediaUrl(key:string|null|undefined){return key&&keyPattern.test(key)?`${MEDIA_ORIGIN}/${key}`:null;}
export function isStoredImage(url:string){try{const parsed=new URL(url);return [MEDIA_ORIGIN,'https://media.nextchina.org'].includes(parsed.origin)&&keyPattern.test(parsed.pathname.slice(1))&&!parsed.search&&!parsed.hash;}catch{return false;}}
export class UploadError extends Error {constructor(public code:string){super(code);}}
type Progress=(percent:number)=>void;
async function request(path:string,body:Blob|null,settings:Record<string,unknown>|null,signal?:AbortSignal,progress?:Progress){
 const db=getSupabase();if(!db)throw new UploadError('login_required');
 const{data,error}=await db.auth.getSession();if(error||!data.session)throw new UploadError('login_required');
 const token=data.session.access_token;
 return new Promise<Record<string,unknown>>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();const cancel=()=>xhr.abort();
  xhr.open('POST',`${MEDIA_ORIGIN}${path}`);xhr.timeout=45000;xhr.setRequestHeader('Authorization',`Bearer ${token}`);
  xhr.setRequestHeader('Content-Type',body?.type||'application/octet-stream');if(settings)xhr.setRequestHeader('X-Profile-Settings',encodeURIComponent(JSON.stringify(settings)));
  xhr.upload.onprogress=e=>{if(e.lengthComputable)progress?.(Math.round(e.loaded/e.total*100));};
  const finish=()=>signal?.removeEventListener('abort',cancel);
  xhr.onload=()=>{finish();let value:Record<string,unknown>;try{value=JSON.parse(xhr.responseText);}catch{reject(new UploadError('upload_failed'));return;}if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(new UploadError(typeof value.error==='string'?value.error:'upload_failed'));};
  xhr.onerror=xhr.ontimeout=()=>{finish();reject(new UploadError('upload_failed'));};xhr.onabort=()=>{finish();reject(new DOMException('Aborted','AbortError'));};
  if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}signal?.addEventListener('abort',cancel,{once:true});xhr.send(body);
 });
}
export async function uploadContentImage(blob:Blob,signal?:AbortSignal,progress?:Progress){const r=await request('/v1/images',blob,null,signal,progress);if(typeof r.url!=='string'||!isStoredImage(r.url))throw new UploadError('upload_failed');return r.url;}
export async function saveProfile(settings:{display_name:string;mode:'keep'|'custom'|'provider'|'none';expected_updated_at:string;automatic?:boolean},blob:Blob|null=null,signal?:AbortSignal,progress?:Progress){const r=await request('/v1/profile',blob,settings,signal,progress);return r.profile as Profile;}
