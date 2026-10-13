'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {FiArrowUpRight,FiArrowRight,FiMail} from 'react-icons/fi';
import {FaGithub,FaGoogle,FaXTwitter} from 'react-icons/fa6';
import {Modal,Logo} from './Shell';
import {useApp} from './Provider';
import {getAuthProviders,type AuthProviders} from '@/lib/supabase';
import {authCopy} from '@/lib/auth-copy';
import {socialCopy} from '@/lib/social-copy';
import {shellCopy} from '@/lib/shell-copy';
import {experienceCopy} from '@/lib/experience-copy';
export default function AuthDialog(){
 const {locale,t,db,setAuthOpen,notify,online}=useApp();const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 const copy=authCopy[locale],social=socialCopy[locale],c=shellCopy[locale];const[intent,setIntent]=useState<'login'|'signup'>('login');const[mode,setMode]=useState<'magic'|'password'|'reset'>('magic'),[password,setPassword]=useState('');
 const [providers,setProviders]=useState<AuthProviders|null>(null),[providerError,setProviderError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!db)return;
  const controller=new AbortController();let active=true;
  const timeout=setTimeout(()=>controller.abort(),10000);
  setProviderError(false);
  getAuthProviders(controller.signal).then(value=>{if(active)setProviders(value);}).catch(()=>{if(active)setProviderError(true);}).finally(()=>clearTimeout(timeout));
  return()=>{active=false;controller.abort();clearTimeout(timeout);};
 },[db,attempt]);
 async function oauth(provider:'google'|'github'|'x'){if(!db){setError(t.setup);return;}if(pending.current||!online)return;pending.current=true;setBusy(true);setError('');try{const{error}=await db.auth.signInWithOAuth({provider,options:{redirectTo:`${location.origin}/${locale}/auth/callback/`}});if(error)throw error;}catch{setError(t.error);setBusy(false);pending.current=false;}}
 async function send(e:React.FormEvent){e.preventDefault();if(pending.current||!online||sent)return;if(!db){setError(t.setup);return;}pending.current=true;setBusy(true);setError('');try{const redirectTo=`${location.origin}/${locale}/auth/callback/`;const{error}=mode==='password'?await db.auth.signInWithPassword({email:email.trim(),password}):mode==='reset'?await db.auth.resetPasswordForEmail(email.trim(),{redirectTo}):await db.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:redirectTo}});if(error)throw error;if(mode==='password'){setPassword('');setAuthOpen(false);}else{setSent(true);notify(mode==='reset'?social.resetSent:t.emailSent);}}catch{setError(t.error);}finally{setBusy(false);pending.current=false;}}
 return <Modal title={intent==='signup'?c.createAccount:c.signIn} onClose={()=>setAuthOpen(false)}>
  <Logo small/><h2>{intent==='signup'?c.createAccount:c.signIn}</h2><p className="muted">{intent==='signup'?c.createNote:c.signInNote}</p>
  <div className="oauth-buttons">{([['google','Google',FaGoogle],['github','GitHub',FaGithub],['x','X',FaXTwitter]] as const).map(([key,label,Icon])=><button key={key} disabled={busy||!online||!providers?.[key]} onClick={()=>oauth(key)}><Icon/>{t.with} {label}{providers&&!providers[key]&&<small>{copy.unavailable}</small>}<FiArrowUpRight/></button>)}</div>
  {providerError&&<p className="form-note" role="status">{copy.loadError} <button type="button" onClick={()=>setAttempt(n=>n+1)}>{t.retry}</button></p>}
  <div className="or"><span>{t.or}</span></div>
  <form onSubmit={send}><label htmlFor="auth-email">{t.email}</label><div className="input-icon"><FiMail/><input id="auth-email" type="email" value={email} required maxLength={254} placeholder={t.emailPlaceholder} onChange={e=>{setEmail(e.target.value);setSent(false);}}/></div>{mode==='password'&&<label>{social.password}<input type="password" className="auth-password" aria-label={social.password} autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button className="button primary full" disabled={busy||!online||sent||!providers?.email}>{busy?t.loading:sent?(mode==='reset'?social.resetSent:t.emailSent):mode==='password'?social.login:mode==='reset'?social.sendReset:c.continueEmail}<FiArrowRight/></button></form>
  {intent==='login'&&<div className="auth-modes">{(['magic','password','reset'] as const).filter(value=>value!==mode).map(value=><button key={value} type="button" className="text-link" disabled={busy} onClick={()=>{setMode(value);setSent(false);setError('');setPassword('');}}>{value==='magic'?social.magicLogin:value==='password'?social.passwordLogin:social.forgot}</button>)}</div>}
  <p className="auth-switch">{intent==='login'?c.newHere:c.haveAccount} <button className="text-link" disabled={busy} onClick={()=>{setIntent(intent==='login'?'signup':'login');setMode('magic');setError('');setSent(false);}}>{intent==='login'?c.join:social.login}</button></p>
  {!online&&<p role="status" className="form-note">{experienceCopy[locale].offline}</p>}{(!db||error)&&<p role="status" className="form-note">{error||t.setup}</p>}
  <p className="auth-terms"><Link onClick={()=>setAuthOpen(false)} href={`/${locale}/terms/`}>{t.terms}</Link> · <Link onClick={()=>setAuthOpen(false)} href={`/${locale}/privacy/`}>{t.privacy}</Link><br/>{t.authTerms}</p>
 </Modal>;
}
