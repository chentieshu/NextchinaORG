'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {usePathname} from 'next/navigation';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {FiGrid,FiMessageSquare,FiFileText,FiMessageCircle,FiUsers,FiHash,FiSettings,FiActivity,FiClock,FiCreditCard,FiShoppingBag,FiArrowUpRight,FiChevronRight,FiMenu,FiSidebar,FiLogOut} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {Avatar} from '@/components/Avatar';
import {Modal} from '@/components/Shell';
import {SITE_ORIGIN} from '@/lib/site';
import {useTheme} from '@/lib/use-theme';
import {socialCopy} from '@/lib/social-copy';
import {forumCopy} from '@/lib/forum-copy';
import {adminCopy} from '@/lib/admin-copy';
import {walletCopy} from '@/modules/wallet/copy';
import {marketCopy} from '@/modules/wallet/market-copy';
import {workspaceCopy} from './copy';
import {canOpenTab,parseAdminView,type AdminTab} from './navigation';
import './workspace.css';
const AuthDialog=dynamic(()=>import('@/components/AuthDialog'),{ssr:false});
type View={tab:AdminTab;status:string};
type Navigation=View&{selectTab:(tab:AdminTab,status?:string)=>void;setStatus:(value:string)=>void;setNavigationLocked:(value:boolean)=>void};
const NavigationContext=createContext<Navigation|null>(null);
export function useAdminNavigation(){const value=useContext(NavigationContext);if(!value)throw Error('Admin navigation is unavailable');return value;}
const icons={dashboard:FiGrid,posts:FiMessageSquare,articles:FiFileText,moderation:FiMessageCircle,members:FiUsers,categories:FiHash,settings:FiSettings,audit:FiClock,monitor:FiActivity,wallet:FiCreditCard,market:FiShoppingBag};
export function AdminShell({children}:{children:ReactNode}){
 const{locale,t,user,profile,authOpen,logout,online,authStatus}=useApp(),pathname=usePathname(),theme=useTheme(),c=workspaceCopy[locale],s=socialCopy[locale],a=adminCopy[locale],f=forumCopy[locale];
 const owner=profile?.role==='super_admin',authorized=authStatus==='ready'&&!!profile&&!profile.disabled&&profile.role!=='member',base=`/${locale}/`,workspace=!/\/(write|settings|auth)\//.test(pathname);
 const[view,setView]=useState<View>({tab:'dashboard',status:'all'}),[drawer,setDrawer]=useState(false),[collapsed,setCollapsed]=useState(false),[navigationLocked,setNavigationLocked]=useState(false);
 useEffect(()=>{const read=()=>setView(parseAdminView(location.hash,owner));if(workspace)read();window.addEventListener('hashchange',read);window.addEventListener('popstate',read);return()=>{window.removeEventListener('hashchange',read);window.removeEventListener('popstate',read);};},[owner,workspace,user?.id]);
 useEffect(()=>{setDrawer(false);},[pathname,view.tab]);
 useEffect(()=>{const query=matchMedia('(min-width: 901px)'),close=()=>{if(query.matches)setDrawer(false);};query.addEventListener('change',close);return()=>query.removeEventListener('change',close);},[]);
 useEffect(()=>{if(!profile)return;theme.change(profile.theme??'system');if(profile.ui_locale&&profile.ui_locale!==locale&&!pathname.includes('/auth/callback/'))location.replace(pathname.replace(`/${locale}/`,`/${profile.ui_locale}/`)+location.search+location.hash);},[profile?.id,profile?.theme,profile?.ui_locale,locale,pathname]);
 function selectTab(tab:AdminTab,status='all'){
  if(navigationLocked||!canOpenTab(tab,owner))return;setDrawer(false);const hash=tab+(status!=='all'?`?status=${encodeURIComponent(status)}`:'');
  if(!workspace){location.assign(base+'#'+hash);return;}setView({tab,status});history.pushState(null,'','#'+hash);
 }
 function setStatus(status:string){const next={...view,status};setView(next);history.replaceState(null,'','#'+view.tab+(status!=='all'?`?status=${encodeURIComponent(status)}`:''));}
 const label=(tab:AdminTab)=>tab==='market'?marketCopy[locale].admin:tab==='wallet'?walletCopy[locale].admin:tab==='posts'?f.posts:tab==='articles'?f.news:tab==='categories'||tab==='monitor'?a[tab]:t[tab];
 const groups:{label:string;tabs:AdminTab[]}[]=[{label:c.workspace,tabs:['dashboard']},{label:c.content,tabs:['posts','articles','moderation','categories']},{label:c.community,tabs:['members']},{label:c.finance,tabs:['wallet','market']},{label:c.system,tabs:['monitor','audit','settings']}];
 const navigation=<nav className="admin-navigation" aria-label={c.navigation}>{groups.map(group=>{const tabs=group.tabs.filter(tab=>canOpenTab(tab,owner));return tabs.length>0&&<div className="admin-nav-group" key={group.label}><span>{group.label}</span>{tabs.map(tab=>{const Icon=icons[tab];return <button key={tab} type="button" title={label(tab)} aria-label={label(tab)} aria-current={workspace&&view.tab===tab?'page':undefined} disabled={navigationLocked} onClick={()=>selectTab(tab)}><Icon aria-hidden="true"/><span>{label(tab)}</span></button>;})}</div>;})}</nav>;
 const account=<div className="admin-account"><Avatar name={profile?.display_name??'U'} avatarKey={profile?.avatar_key} size={34}/><div><b>{profile?.display_name}</b><small>{profile?t[profile.role]:''}</small></div></div>;
 const dialog=authOpen&&!user?<AuthDialog/>:null;
 if(!authorized)return <div className="admin-site admin-gate"><header><Link href={base} className="admin-brand">China<b>Team</b><span>{t.admin}</span></Link><a href={`${SITE_ORIGIN}${base}`} className="text-link">{c.visit}<FiArrowUpRight/></a></header>{children}{dialog}</div>;
 return <NavigationContext.Provider value={{...view,selectTab,setStatus,setNavigationLocked}}><div className={`admin-site admin-shell ${collapsed?'admin-collapsed':''}`}><aside className="admin-sidebar"><Link href={base} className="admin-brand" aria-label="ChinaTeam"><span className="admin-brand-mark">C</span><span className="admin-brand-name">China<b>Team</b><small>{t.admin}</small></span></Link>{navigation}<div className="admin-sidebar-bottom">{account}<button className="admin-signout" aria-label={t.logout} title={t.logout} onClick={()=>void logout()}><FiLogOut aria-hidden="true"/><span>{t.logout}</span></button></div></aside><div className="admin-stage"><header className="admin-topbar"><button className="icon-button admin-desktop-toggle" aria-label={collapsed?c.expand:c.collapse} title={collapsed?c.expand:c.collapse} onClick={()=>setCollapsed(value=>!value)}><FiSidebar/></button><button className="icon-button admin-mobile-toggle" aria-label={c.open} title={c.open} aria-haspopup="dialog" aria-expanded={drawer} onClick={()=>setDrawer(true)}><FiMenu/></button><nav className="admin-breadcrumb" aria-label={c.current}><span>{t.admin}</span><FiChevronRight aria-hidden="true"/><b>{workspace?label(view.tab):pathname.includes('/settings/')?s.settings:f.newNews}</b></nav><div className="admin-topbar-actions"><span className={`admin-connectivity ${online?'':'offline'}`} title={online?c.online:c.offline} aria-label={online?c.online:c.offline}><i/></span><a className="button small" href={`${SITE_ORIGIN}${base}`} target="_blank" rel="noreferrer"><span>{c.visit}</span><FiArrowUpRight/></a><Link className="icon-button" title={s.settings} aria-label={s.settings} href={base+'settings/'}><FiSettings/></Link><a className="admin-topbar-avatar" aria-label={s.profile} title={profile.display_name} href={`${SITE_ORIGIN}${base}profile/?id=${user?.id}`}><Avatar name={profile.display_name} avatarKey={profile.avatar_key} size={30}/></a></div></header><div className="admin-scroll">{workspace?<main id="main" className="admin-content">{children}</main>:<div className="admin-subpage">{children}</div>}</div></div></div>{drawer&&<Modal className="admin-site admin-drawer" title={c.navigation} onClose={()=>setDrawer(false)}><aside className="admin-sidebar"><h2>{t.admin}</h2>{navigation}{account}<button className="admin-signout" onClick={()=>void logout()}><FiLogOut/>{t.logout}</button></aside></Modal>}{dialog}</NavigationContext.Provider>;
}
