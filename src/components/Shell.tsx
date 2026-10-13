'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {Avatar} from './Avatar';
import {socialCopy} from '@/lib/social-copy';
import {useTheme} from '@/lib/use-theme';
import {profileCopy} from '@/lib/profile-copy';
const ProfileDialog=dynamic(()=>import('./ProfileDialog'),{ssr:false});
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {FiArrowUpRight,FiArrowRight,FiSearch,FiMoon,FiSun,FiGlobe,FiChevronDown,FiX,FiBookmark,FiLogOut,FiSettings,FiMail,FiUser} from 'react-icons/fi';
import {FaGithub,FaGoogle,FaXTwitter} from 'react-icons/fa6';
import {languageNames,locales} from '@/lib/i18n';
import {getAuthProviders,type AuthProviders} from '@/lib/supabase';
import {authCopy} from '@/lib/auth-copy';
import {forumCopy} from '@/lib/forum-copy';
import {experienceCopy} from '@/lib/experience-copy';
import {legalCopy} from '@/lib/legal';
import {useApp} from './Provider';

export function Logo({small=false}:{small?:boolean}){return <span className={`brand ${small?'small':''}`}><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>Next<span className="brand-china">China</span><span className="brand-domain">.org</span></span></span>;}
export function Modal({children,title,onClose}:{children:ReactNode;title:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;d?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{d?.close();document.body.style.overflow=previous;};},[]);
 return <dialog ref={ref} className="modal" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}} aria-label={title}><div className="modal-inner"><button className="icon-button modal-close" aria-label={useApp().t.close} onClick={onClose}><FiX/></button>{children}</div></dialog>;
}
export function Shell({children}:{children:ReactNode}){
 const {locale,t,user,profile,logout,authOpen,setAuthOpen,settings,authStatus,online,retryAuth,activeCategories,categoryName}=useApp();const pathname=usePathname();
 const[profileOpen,setProfileOpen]=useState(false);
 useEffect(()=>setProfileOpen(false),[user?.id]);
 const {dark,toggle:toggleTheme}=useTheme();
 const [searchOpen,setSearchOpen]=useState(false),[q,setQ]=useState('');
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();setSearchOpen(v=>!v);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 useEffect(()=>{setSearchOpen(false);setAuthOpen(false);},[pathname,setAuthOpen]);
 useEffect(()=>{function close(e:Event){const target=e.target as Element;if(e.type==='keydown'&&(e as KeyboardEvent).key!=='Escape')return;document.querySelectorAll<HTMLDetailsElement>('.user-menu[open],.content-menu[open]').forEach(d=>{if(e.type==='keydown'||!d.contains(target))d.open=false;});}document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[]);
 const links=[['',forumCopy[locale].forum],['news/',t.news]];
 return <><a className="skip-link" href="#main">{t.explore}</a><header className="header"><Link href={`/${locale}/`} aria-label="NextChina.org" className="logo-link"><Logo/></Link><nav className="desktop-nav" aria-label={t.menu}>{links.map(([path,label])=><Link key={path} className={(pathname===`/${locale}/${path}`||((pathname==='/'||pathname===`/${locale}/community/`)&&path===''))?'active':''} href={`/${locale}/${path}`}>{label}</Link>)}</nav><div className="header-actions"><button className="icon-button search-toggle" aria-label={t.searchLabel} onClick={()=>setSearchOpen(true)}><FiSearch/></button><div className="language-select"><FiGlobe/><select aria-label={t.language} value={locale} onChange={e=>{window.location.href=(pathname==='/'?`/${locale}/`:pathname).replace(`/${locale}`,`/${e.target.value}`)+window.location.search;}}>{locales.map(l=><option key={l} value={l}>{languageNames[l]}</option>)}</select><FiChevronDown/></div><button className="icon-button" aria-label={t.theme} onClick={toggleTheme}>{dark?<FiSun/>:<FiMoon/>}</button>{authStatus==='loading'?<span className="account-placeholder" aria-label={t.loading}/>:authStatus==='error'?<button className="login-button" onClick={()=>void retryAuth()}>{t.retry}</button>:user?<details className="user-menu"><summary className="avatar" aria-label={profile?.display_name??t.login}><Avatar name={profile?.display_name??'U'} avatarKey={profile?.avatar_key} size={34}/></summary><div className="dropdown"><b>{profile?.display_name??user.email}</b><Link href={`/${locale}/profile/?id=${user.id}`}><FiUser/>{socialCopy[locale].profile}</Link><Link href={`/${locale}/settings/`}><FiSettings/>{socialCopy[locale].settings}</Link><button onClick={()=>{setProfileOpen(true);document.querySelector<HTMLDetailsElement>('.user-menu')?.removeAttribute('open');}}><FiUser/>{profileCopy[locale].title}</button><Link href={`/${locale}/bookmarks/`}><FiBookmark/>{t.bookmarks}</Link>{profile&&!profile.disabled&&profile.role!=='member'&&<Link href={`/${locale}/admin/`}><FiSettings/>{t.admin}</Link>}<Link href={`/${locale}/write/`}>{forumCopy[locale].write}</Link><button onClick={()=>void logout()}><FiLogOut/>{t.logout}</button></div></details>:<button className="login-button" aria-label={t.login} onClick={()=>setAuthOpen(true)}><span className="login-label-full">{t.login}</span><span className="login-label-short">{t.login.split(" / ")[0]}</span></button>}</div></header>{settings.notice&&<div className="announcement">{settings.notice}</div>}{children}<footer className="footer"><span>© {new Date().getFullYear()} NextChina.org</span><nav><Link href={`/${locale}/about/`}>{t.about}</Link><Link href={`/${locale}/privacy/`}>{t.privacy}</Link><Link href={`/${locale}/terms/`}>{t.terms}</Link><a href="https://github.com/chentieshu/NextchinaORG" target="_blank" rel="noreferrer">GitHub</a></nav></footer>{profileOpen&&profile&&<ProfileDialog key={profile.id} onClose={()=>setProfileOpen(false)}/>} {authOpen&&<AuthDialog/>}{searchOpen&&<Modal title={t.searchLabel} onClose={()=>setSearchOpen(false)}><h2>{t.searchLabel}</h2><form action={`/${locale}/`} className="search-form"><FiSearch/><input name="q" value={q} onChange={e=>setQ(e.target.value)} placeholder={t.search} autoFocus/><button className="icon-button" aria-label={t.searchLabel}><FiArrowRight/></button></form><div className="search-suggestions">{activeCategories.slice(0,3).map(({key:c})=><a href={`/${locale}/?category=${c}`} key={c}>{categoryName(c)}<FiArrowUpRight/></a>)}</div></Modal>}</>;
}
function AuthDialog(){
 const {locale,t,db,setAuthOpen,notify,online}=useApp();const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 const copy=authCopy[locale],social=socialCopy[locale];const[mode,setMode]=useState<'magic'|'password'|'reset'>('magic'),[password,setPassword]=useState('');
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
 return <Modal title={t.welcome} onClose={()=>setAuthOpen(false)}>
  <Logo small/><h2>{t.welcome}</h2><p className="muted">{t.welcomeSub}</p><p className="auth-data-note">{legalCopy[locale].signIn}</p>
  <div className="oauth-buttons">{([['google','Google',FaGoogle],['github','GitHub',FaGithub],['x','X',FaXTwitter]] as const).map(([key,label,Icon])=><button key={key} disabled={busy||!online||!providers?.[key]} onClick={()=>oauth(key)}><Icon/>{t.with} {label}{providers&&!providers[key]&&<small>{copy.unavailable}</small>}<FiArrowUpRight/></button>)}</div>
  {providerError&&<p className="form-note" role="status">{copy.loadError} <button type="button" onClick={()=>setAttempt(n=>n+1)}>{t.retry}</button></p>}
  <div className="or"><span>{t.or}</span></div>
  <form onSubmit={send}><label htmlFor="auth-email">{t.email}</label><div className="input-icon"><FiMail/><input id="auth-email" type="email" value={email} required maxLength={254} placeholder={t.emailPlaceholder} onChange={e=>{setEmail(e.target.value);setSent(false);}}/></div>{mode==='password'&&<label>{social.password}<input type="password" className="auth-password" aria-label={social.password} autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button className="button primary full" disabled={busy||!online||sent||!providers?.email}>{busy?t.loading:sent?(mode==='reset'?social.resetSent:t.emailSent):mode==='password'?social.login:mode==='reset'?social.sendReset:t.sendLink}<FiArrowRight/></button></form>
  <div className="auth-modes">{(['magic','password','reset'] as const).filter(value=>value!==mode).map(value=><button key={value} type="button" className="text-link" disabled={busy} onClick={()=>{setMode(value);setSent(false);setError('');setPassword('');}}>{value==='magic'?social.magicLogin:value==='password'?social.passwordLogin:social.forgot}</button>)}</div>
  {!online&&<p role="status" className="form-note">{experienceCopy[locale].offline}</p>}{(!db||error)&&<p role="status" className="form-note">{error||t.setup}</p>}
  <p className="auth-terms"><Link onClick={()=>setAuthOpen(false)} href={`/${locale}/terms/`}>{t.terms}</Link> · <Link onClick={()=>setAuthOpen(false)} href={`/${locale}/privacy/`}>{t.privacy}</Link><br/>{t.authTerms}</p>
 </Modal>;
}
