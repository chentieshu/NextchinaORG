'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {FiBarChart2,FiMessageSquare,FiSearch,FiFileText,FiBookmark,FiUser,FiSettings,FiEdit3,FiLogOut,FiMoreHorizontal,FiX,FiCreditCard} from 'react-icons/fi';
import {Avatar} from './Avatar';
import {FaGithub} from 'react-icons/fa6';
import {Onboarding} from './Onboarding';
import {useApp} from './Provider';
import {useTheme} from '@/lib/use-theme';
import {shellCopy} from '@/lib/shell-copy';
import {socialCopy} from '@/lib/social-copy';
import {forumCopy} from '@/lib/forum-copy';
import {ADMIN_ORIGIN} from '@/lib/site';
import {navigationCopy} from '@/lib/navigation-copy';
import {walletCopy} from '@/modules/wallet/copy';
import {profileCopy} from '@/lib/profile-copy';
import {isLocale} from '@/lib/i18n';
const AuthDialog=dynamic(()=>import('./AuthDialog'),{ssr:false});
const ProfileDialog=dynamic(()=>import('./ProfileDialog'),{ssr:false});
export function Logo({small=false}:{small?:boolean}){return <span className={`brand ${small?'small':''}`}><span>Team<span className="brand-china">cn</span></span></span>;}
export function Modal({children,title,onClose,className=''}:{children:ReactNode;title:string;onClose:()=>void;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),{t}=useApp();useEffect(()=>{const d=ref.current,previousFocus=document.activeElement;d?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{d?.close();document.body.style.overflow=previous;if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={`modal ${className}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}} aria-label={title}><div className="modal-inner"><button className="icon-button modal-close" aria-label={t.close} onClick={onClose}><FiX/></button>{children}</div></dialog>;
}

function MobileNavigation({home,admin,canCompose,onCompose,onLogin,onEditProfile}:{home:boolean;admin:boolean;canCompose:boolean;onCompose:()=>void;onLogin:()=>void;onEditProfile:()=>void}){
 const {locale,t,user,profile,authStatus,retryAuth,logout,needsProfile}=useApp();
 const pathname=usePathname(),base=`/${locale}/`,c=shellCopy[locale],s=socialCopy[locale],f=forumCopy[locale],n=navigationCopy[locale];
 const [open,setOpen]=useState(false);
 useEffect(()=>{setOpen(false);},[pathname]);
 useEffect(()=>{const desktop=matchMedia('(min-width: 901px)');const close=()=>{if(desktop.matches)setOpen(false);};desktop.addEventListener('change',close);return()=>desktop.removeEventListener('change',close);},[]);
 function action(callback:()=>void){setOpen(false);callback();}
 const accountPage=['profile/','bookmarks/','settings/','admin/','wallet/','market/'].some(path=>pathname===base+path);
 return <>
  <nav className="mobile-nav" aria-label={c.navigation}>
   <Link href={base} aria-label={n.markets} aria-current={home?'page':undefined}><FiBarChart2/><span>{n.markets}</span></Link>
   <Link href={base+'search/'} aria-label={c.search} aria-current={pathname===base+'search/'?'page':undefined}><FiSearch/><span>{c.search}</span></Link>
   {canCompose&&user?<Link href={base+'write/'} className="mobile-compose" aria-label={f.write} aria-current={pathname===base+'write/'?'page':undefined}><FiEdit3/></Link>:<button className="mobile-compose" aria-label={f.write} disabled={!canCompose} onClick={onCompose}><FiEdit3/></button>}
   <Link href={base+'square/'} aria-label={n.square} aria-current={/\/(square|community|news)\//.test(pathname)?'page':undefined}><FiMessageSquare/><span>{n.square}</span></Link>
   <button className={accountPage?'is-current':undefined} aria-label={c.account} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>{user?<Avatar name={profile?.display_name??'U'} avatarKey={profile?.avatar_key} size={23}/>:<FiUser/>}<span>{c.account}</span></button>
  </nav>
  {open&&<Modal className="mobile-menu-dialog" title={c.account} onClose={()=>setOpen(false)}>
   <div className="mobile-menu" onClick={e=>{if((e.target as Element).closest('a[href]'))setOpen(false);}}>
    <h2>{c.account}</h2>
    {user?<Link className="mobile-menu-profile" href={base+'profile/?id='+user.id}><Avatar name={profile?.display_name??'U'} avatarKey={profile?.avatar_key} size={44}/><span><b>{profile?.display_name??s.profile}</b><small>{needsProfile?c.profileSetup:'@'+(profile?.handle??'')}</small></span></Link>:<Logo small/>}
    <nav className="mobile-menu-links" aria-label={c.account}><Link href={base+'square/?tab=articles'}><FiFileText/>{t.news}</Link>
     {user&&<><Link href={base+'square/?scope=mine'}><FiFileText/>{f.mine}</Link><Link href={base+'bookmarks/'}><FiBookmark/>{t.bookmarks}</Link><Link href={base+'wallet/'}><FiCreditCard/>{walletCopy[locale].title}</Link><button onClick={()=>action(onEditProfile)}><FiEdit3/>{profileCopy[locale].title}</button></>}
     <Link href={base+'settings/'}><FiSettings/>{s.settings}</Link>
     {admin&&<Link href={ADMIN_ORIGIN+base}><FiSettings/>{t.admin}</Link>}
     {authStatus==='loading'?<span className="mobile-account-status" role="status">{t.loading}</span>:authStatus==='error'?<button onClick={()=>void retryAuth()}>{t.retry}</button>:user?<button onClick={()=>action(()=>void logout())}><FiLogOut/>{t.logout}</button>:<button onClick={()=>action(onLogin)}><FiUser/>{t.login}</button>}
    </nav>
   </div>
  </Modal>}
 </>;
}

export function Shell({children}:{children:ReactNode}){
 const{locale,t,user,profile,logout,authOpen,setAuthOpen,settings,authStatus,retryAuth,needsProfile,demo}=useApp(),pathname=usePathname(),router=useRouter(),theme=useTheme(),c=shellCopy[locale],s=socialCopy[locale],n=navigationCopy[locale];const[profileOpen,setProfileOpen]=useState(false);
 const admin=!!profile&&!profile.disabled&&profile.role!=='member',base=`/${locale}/`,home=pathname==='/'||pathname===base||pathname===`${base}predictions/`;
 useEffect(()=>{setProfileOpen(false);if(user)setAuthOpen(false);},[user?.id,setAuthOpen]);
 useEffect(()=>{setAuthOpen(false);},[pathname,setAuthOpen]);
 useEffect(()=>{if(!profile)return;theme.change(profile.theme??'system');if(profile.ui_locale&&profile.ui_locale!==locale&&!pathname.includes('/auth/callback/'))location.replace((pathname==='/'?base:pathname).replace(`/${locale}/`,`/${profile.ui_locale}/`)+location.search+location.hash);},[profile?.id,profile?.theme,profile?.ui_locale,profile?.profile_completed_at,locale,pathname]);
 useEffect(()=>{if(pathname!=='/'||user)return;try{const preferred=localStorage.getItem('omni-locale');if(preferred&&isLocale(preferred)&&preferred!==locale)location.replace(`/${preferred}/`+location.search);}catch{}},[pathname,user,locale]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();const input=document.querySelector<HTMLInputElement>('.global-search-form input');if(input){input.focus();input.select();}else router.push(`${base}search/`);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[base,router]);
 useEffect(()=>{function close(e:Event){const target=e.target as Element;if(e.type==='keydown'&&(e as KeyboardEvent).key!=='Escape')return;document.querySelectorAll<HTMLDetailsElement>('.user-menu[open],.content-menu[open],.repost-menu[open],.post-format-options[open]').forEach(d=>{if(d.classList.contains('expanded'))return;if(e.type==='keydown'||!d.contains(target))d.open=false;});}document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[]);
 function login(next?:string){try{sessionStorage.setItem('nextchina-auth-return',next??location.pathname+location.search+location.hash);}catch{}setAuthOpen(true);}
 function compose(){if(!user){login(`${base}write/`);return;}router.push(`${base}write/`);}
 const canCompose=authStatus!=='loading'&&!profile?.disabled&&(settings.ugc_enabled||admin)&&!demo;
 const links=[{path:'',label:n.markets,Icon:FiBarChart2,active:home},{path:'square/',label:n.square,Icon:FiMessageSquare,active:/\/(square|community|news)\//.test(pathname)},{path:'search/',label:c.search,Icon:FiSearch},...(user?[{path:'wallet/',label:walletCopy[locale].title,Icon:FiCreditCard}]:[]),{path:'settings/',label:s.settings,Icon:FiSettings},...(admin?[{path:'admin/',label:t.admin,Icon:FiSettings}]:[])];
 const exempt=/\/(auth\/callback|settings|about|privacy|terms)\//.test(pathname),onboarding=authStatus==='ready'&&needsProfile&&!profile?.disabled&&!exempt;
 return <>
  <a className="skip-link" href="#main">{t.explore}</a>
  <div className="app-shell">
   <aside className="app-sidebar">
    <Link href={base} aria-label="Teamcn" className="sidebar-brand"><Logo/></Link>
    <div className="sidebar-scroller">
     <nav className="app-nav" aria-label={c.navigation}>
      {links.map(({path,label,Icon,active})=>{const selected=active??pathname===base+path.split('?')[0];return <Link key={path} href={path==='admin/'?ADMIN_ORIGIN+base:base+path} title={label} aria-label={label} aria-current={selected?'page':undefined}><Icon/><span>{label}</span></Link>;})}
      <button className="sidebar-compose" title={forumCopy[locale].write} aria-label={forumCopy[locale].write} disabled={!canCompose} onClick={compose}><FiEdit3/><span>{forumCopy[locale].write}</span></button>
     </nav>
    </div>
    <div className="sidebar-account">
     {authStatus==='loading'?<span className="account-placeholder" aria-label={t.loading}/>:authStatus==='error'?<button className="sidebar-login" onClick={()=>void retryAuth()}>{t.retry}</button>:user?<details className="user-menu">
      <summary title={profile?.display_name??s.profile}><Avatar name={profile?.display_name??'U'} avatarKey={profile?.avatar_key} size={36}/><span className="sidebar-account-name"><b>{profile?.display_name}</b><small>{needsProfile?c.profileSetup:`@${profile?.handle??''}`}</small></span><FiMoreHorizontal/></summary>
      <div className="dropdown"><Link href={`${base}profile/?id=${user.id}`}>{s.profile}</Link><Link href={base+'bookmarks/'}>{t.bookmarks}</Link><Link href={`${base}square/?scope=mine`}>{forumCopy[locale].mine}</Link><Link href={`${base}settings/`}>{s.settings}</Link><button onClick={()=>{setProfileOpen(true);document.querySelector<HTMLDetailsElement>('.user-menu')?.removeAttribute('open');}}>{profileCopy[locale].title}</button><button onClick={()=>void logout()}><FiLogOut/>{t.logout}</button></div>
     </details>:<button className="sidebar-login" aria-label={t.login} title={t.login} onClick={()=>login()}><FiUser/><span>{s.login}</span></button>}
    </div>
   </aside>
   <div className="app-body">
    <div className="app-workspace">
     <div className="app-page">{settings.notice&&<div className="announcement">{settings.notice}</div>}{onboarding?<Onboarding key={user?.id}/>:children}</div>
     <footer className="footer"><span>© {new Date().getFullYear()} Teamcn</span><nav><Link href={`${base}about/`}>{t.about}</Link><Link href={`${base}privacy/`}>{t.privacy}</Link><Link href={`${base}terms/`}>{t.terms}</Link><a className="footer-github" aria-label="GitHub" title="GitHub" href="https://github.com/chentieshu/NextchinaORG" target="_blank" rel="noreferrer"><FaGithub aria-hidden="true"/></a></nav></footer>
    </div>

   </div>
  </div>
  <MobileNavigation key={user?.id??'guest'} home={home} admin={admin} canCompose={canCompose} onCompose={compose} onLogin={()=>login()} onEditProfile={()=>setProfileOpen(true)}/>
  {profileOpen&&profile&&<ProfileDialog key={profile.id} onClose={()=>setProfileOpen(false)}/>} {authOpen&&!user&&<AuthDialog/>}
 </>;
}
