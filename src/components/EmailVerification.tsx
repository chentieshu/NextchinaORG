'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from './Provider';
import {emailVerificationCopy} from '@/lib/email-verification-copy';
import {emailVerificationFailure,normalizeEmailCode,type EmailVerification as Status} from '@/lib/email-verification';
import {getEmailVerificationClient} from '@/lib/supabase';
import {FiMail} from 'react-icons/fi';

export function EmailVerification({onVerified}:{onVerified?:()=>void}){
 const {db,user,locale,online,retryAuth}=useApp(),c=emailVerificationCopy[locale];
 const [status,setStatus]=useState<Status|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false),[code,setCode]=useState(''),[cooldown,setCooldown]=useState(0);
 const mounted=useRef(true),pending=useRef(false),identity=useRef(user?.id),destination=useRef<{id:string;email:string}|null>(null);identity.current=user?.id;
 const read=useCallback(async()=>{if(!db)return;const actor=identity.current;const{data,error}=await db.rpc('omni_email_verification_status').abortSignal(AbortSignal.timeout(10000));if(error||!data)throw Error('status');if(mounted.current&&actor===identity.current)setStatus(data as Status);return data as Status;},[db]);
 const refresh=useCallback(async()=>{try{await read();}catch{if(mounted.current){setStatus(null);setError(c.unavailable);}}finally{if(mounted.current)setLoading(false);}},[read,c.unavailable]);
 useEffect(()=>{mounted.current=true;setStatus(null);setSent(false);setCode('');setError('');destination.current=null;void refresh();const focus=()=>{if(document.visibilityState==='visible'&&!pending.current)void refresh();};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{mounted.current=false;window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};},[user?.id,refresh]);
 useEffect(()=>{if(!cooldown)return;const timer=setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>clearInterval(timer);},[cooldown>0]);
 useEffect(()=>{if(!status?.expires_at)return;const timer=setTimeout(()=>void refresh(),Math.max(0,Date.parse(status.expires_at)-Date.now())+500);return()=>clearTimeout(timer);},[status?.expires_at,refresh]);
 async function run(action:()=>Promise<void>){if(!db||!user||pending.current||!online)return;pending.current=true;setBusy(true);setError('');try{await action();}catch(e){if(mounted.current)setError(c[emailVerificationFailure(e)]);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 async function send(){if(cooldown)return;await run(async()=>{
  const {data,error}=await db!.auth.getUser();if(error)throw error;
  if(data.user?.id!==identity.current)throw {code:'account_changed'};
  if(!data.user.email||!data.user.email_confirmed_at)throw {code:'email_unavailable'};
  const target={id:data.user.id,email:data.user.email};
  const result=await db!.auth.signInWithOtp({email:target.email,options:{shouldCreateUser:false,emailRedirectTo:`${location.origin}/${locale}/auth/callback/`}});if(result.error)throw result.error;
  if(mounted.current&&identity.current===target.id){destination.current=target;setSent(true);setCode('');setCooldown(60);}
 });}
 async function verify(event:React.FormEvent){event.preventDefault();if(!/^\d{6,8}$/.test(code))return;await run(async()=>{
  const target=destination.current;if(!target||target.id!==identity.current)throw {code:'account_changed'};
  const current=await db!.auth.getUser();if(current.error)throw current.error;if(current.data.user?.id!==target.id||current.data.user.email!==target.email)throw {code:'account_changed'};
  const isolated=getEmailVerificationClient(),result=await isolated.auth.verifyOtp({email:target.email,token:code,type:'email'});if(result.error)throw result.error;
  const latest=await db!.auth.getUser();
  if(!mounted.current||identity.current!==target.id||latest.error||latest.data.user?.id!==target.id||latest.data.user.email!==target.email||result.data.user?.id!==target.id||!result.data.session){await isolated.auth.signOut({scope:'local'});throw {code:'account_changed'};}
  const installed=await db!.auth.setSession({access_token:result.data.session.access_token,refresh_token:result.data.session.refresh_token});if(installed.error)throw installed.error;
  const checked=await read();if(!checked?.verified)throw Error('verification_not_confirmed');
  if(mounted.current){setCode('');setSent(false);destination.current=null;onVerified?.();}await retryAuth();
 });}
 return <section id="email-verification" className="email-verification" aria-busy={loading||busy}><span id="authenticator" aria-hidden="true"/><h2><FiMail aria-hidden="true"/>{c.title}</h2><p className="form-note">{c.note}</p>{user?.email&&<p className="email-destination">{user.email}</p>}
 {loading?<p role="status">{c.loading}</p>:status?.verified?<p role="status">{c.verified}{status.expires_at&&<> · {c.expires} {new Date(status.expires_at).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</>}</p>:<>
  {status&&!status.available&&<p>{c.noEmail}</p>}
  <button type="button" className="button" disabled={busy||!online||!status?.available||cooldown>0} onClick={()=>void send()}>{sent?c.resend:c.send}{cooldown?` (${cooldown})`:''}</button>
  {sent&&<div role="form" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!busy&&online&&/^\d{6,8}$/.test(code))void verify(e);}}}><p role="status">{c.sent}</p><label>{c.code}<input aria-label={c.code} inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={12} pattern="[0-9]{6,8}" onChange={e=>setCode(normalizeEmailCode(e.target.value))} onPaste={e=>{const value=normalizeEmailCode(e.clipboardData.getData('text'));if(/^\d{6,8}$/.test(value)){e.preventDefault();setCode(value);}}} required disabled={busy}/></label><button type="button" className="button primary" onClick={e=>void verify(e)} disabled={busy||!online||!/^\d{6,8}$/.test(code)}>{c.verify}</button></div>}
 </>}{!online&&<p role="alert" className="inline-error">{c.offline}</p>}{error&&<p role="alert" className="inline-error">{error}{!status&&<button type="button" onClick={()=>{setLoading(true);setError('');void refresh();}}>{c.retry}</button>}</p>}</section>;
}
