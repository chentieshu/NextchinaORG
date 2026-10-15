'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './Provider';
import dynamic from 'next/dynamic';
import {mfaCopy} from '@/lib/mfa-copy';
import {prepareEnrollment,diagnoseEnrollmentCode,normalizeMfaCode,mfaFailure} from '@/lib/mfa-enrollment';
import {chinaCopy} from '@/lib/chinateam-copy';
type Factor={id:string;friendly_name?:string;status:string};
type Enrollment=ReturnType<typeof prepareEnrollment>;
const QRCodeSVG=dynamic(()=>import('qrcode.react').then(module=>module.QRCodeSVG),{ssr:false});
export function Authenticator({challengeOnly=false}:{challengeOnly?:boolean}){
 const{db,user,locale,t,online,retryAuth,needsMfa}=useApp(),c=chinaCopy[locale],d=mfaCopy[locale];
 const[factors,setFactors]=useState<Factor[]>([]),[enrollment,setEnrollment]=useState<Enrollment|null>(null),[selected,setSelected]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[submittedAt,setSubmittedAt]=useState<number|null>(null);
 const mounted=useRef(true),pending=useRef(false);
 async function load(){if(!db)return;const{data,error}=await db.auth.mfa.listFactors();if(!mounted.current)return;if(error)throw error;const verified=data.totp.filter(f=>f.status==='verified');setFactors(verified);setSelected(old=>verified.some(f=>f.id===old)?old:verified[0]?.id??'');}
 useEffect(()=>{mounted.current=true;void load().catch(()=>{if(mounted.current)setError(t.connectionError);}).finally(()=>{if(mounted.current)setLoading(false);});return()=>{mounted.current=false;};},[db,user?.id]);
 async function run(fn:()=>Promise<void>){if(pending.current||!db||!online)return;pending.current=true;setBusy(true);setError('');setMessage('');try{await fn();}catch(e){if(mounted.current)setError(d[mfaFailure(e)]);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 async function begin(){await run(async()=>{const listed=await db!.auth.mfa.listFactors();if(listed.error)throw listed.error;for(const f of listed.data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified'&&f.friendly_name==='ChinaTeam')){const r=await db!.auth.mfa.unenroll({factorId:f.id});if(r.error)throw r.error;}const{data,error}=await db!.auth.mfa.enroll({factorType:'totp',friendlyName:'ChinaTeam',issuer:'ChinaTeam'});if(error)throw error;if(mounted.current){setEnrollment(prepareEnrollment(data.id,data.totp));setCode('');setSubmittedAt(null);}});}
 async function verify(e:React.FormEvent){
  e.preventDefault();if(!/^\d{6}$/.test(code))return;
  await run(async()=>{
   const current=enrollment,time=Date.now();setSubmittedAt(time);
   const{error}=await db!.auth.mfa.challengeAndVerify({factorId:current?.id??selected,code});
   if(error){
    if(error.code==='mfa_verification_failed'&&current){
     const diagnostic=await diagnoseEnrollmentCode(current.secret,code,time);
     if(mounted.current)setError(d[diagnostic==='unavailable'?'invalidCode':diagnostic]);
     return;
    }
    throw error;
   }
   if(!mounted.current)return;
   setEnrollment(null);setCode('');setSubmittedAt(null);setMessage(c.mfaDone);
   try{await load();await retryAuth();}catch{if(mounted.current)setError(d.statusUnavailable);}
  });
 }
 async function cancel(){if(!enrollment)return;await run(async()=>{const{error}=await db!.auth.mfa.unenroll({factorId:enrollment.id});if(error&&error.code!=='mfa_factor_not_found')throw error;if(mounted.current){setEnrollment(null);setCode('');setSubmittedAt(null);}});}
 async function remove(factor:Factor){if(!confirm(c.mfaRemove))return;await run(async()=>{const{error}=await db!.auth.mfa.unenroll({factorId:factor.id});if(error)throw error;await db!.auth.refreshSession();await load();await retryAuth();});}
 const verifying=needsMfa||!!enrollment;
 return <section id="authenticator" className="authenticator"><h2>{challengeOnly?c.mfaRequired:c.mfa}</h2>{!challengeOnly&&<p className="form-note">{c.mfaNote}</p>}{loading?<p role="status">{c.mfaLoading}</p>:<>{enrollment&&<div className="mfa-enrollment"><p>{c.mfaScan}</p><p className="mfa-marker">{d.tag}: <strong>{enrollment.tag}</strong></p><QRCodeSVG value={enrollment.uri} size={220} level="M" marginSize={4} title={c.mfaScan}/><details><summary>{c.mfaSecret}</summary><p>{d.manualHint}</p><code>{enrollment.secret}</code></details><p className="form-note">{c.mfaBackup}</p></div>}{verifying&&<form onSubmit={verify}>{!enrollment&&factors.length>1&&<select aria-label={c.mfa} value={selected} onChange={e=>setSelected(e.target.value)}>{factors.map(f=><option key={f.id} value={f.id}>{f.friendly_name??'Authenticator'}</option>)}</select>}<label>{c.mfaCode}<input aria-label={c.mfaCode} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={12} value={code} onChange={e=>setCode(normalizeMfaCode(e.target.value))} onPaste={e=>{const value=normalizeMfaCode(e.clipboardData.getData('text'));if(value.length===6){e.preventDefault();setCode(value);}}} required disabled={busy}/></label><button className="button primary" disabled={busy||!online||code.length!==6||!enrollment&&!selected}>{busy?t.loading:c.mfaVerify}</button>{enrollment&&<button type="button" className="text-link" disabled={busy} onClick={()=>void cancel()}>{c.mfaCancel}</button>}</form>}{!verifying&&!challengeOnly&&<>{factors.map(f=><div className="mfa-factor" key={f.id}><span>{f.friendly_name??c.mfaEnabled}</span><button className="text-link" disabled={busy||!online} onClick={()=>void remove(f)}>{c.disableMfa}</button></div>)}{factors.length<1&&<button className="button" disabled={busy||!online} onClick={()=>void begin()}>{c.enableMfa}</button>}</>}</>}{error&&<p role="alert" className="inline-error">{error}{submittedAt&&<small className="mfa-diagnostic-time">{d.browserTime}: {new Date(submittedAt).toLocaleString(locale)}{' '}{Intl.DateTimeFormat().resolvedOptions().timeZone}</small>}<button type="button" onClick={()=>void run(load)}>{t.retry}</button></p>}{message&&<p role="status">{message}</p>}</section>;
}
