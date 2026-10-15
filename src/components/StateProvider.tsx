'use client';
import {createContext,useContext,useEffect,useState,useCallback,useRef,type ReactNode} from 'react';
import type {User} from '@supabase/supabase-js';
import {invalidateConnections} from '@/lib/connected-accounts';
import {getSupabase} from '@/lib/supabase';
import {dictionaries,type Locale} from '@/lib/i18n';
import {experienceCopy} from '@/lib/experience-copy';
import type {Article,Profile,SiteSettings,ContentCategory} from '@/lib/types';
import {saveProfile} from '@/lib/media';
type AuthStatus='loading'|'ready'|'error';
function useAppState(locale:Locale){
 const t=dictionaries[locale],copy=experienceCopy[locale],db=getSupabase(),demo=!db;
 const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null),[authStatus,setAuthStatus]=useState<AuthStatus>(demo?'ready':'loading');
 const [articles,setArticles]=useState<Article[]>([]),[loading,setLoading]=useState(!demo),[loadError,setLoadError]=useState(false),[contentVersion,setContentVersion]=useState(0);
 const [liked,setLiked]=useState<string[]>([]),[bookmarked,setBookmarked]=useState<string[]>([]),[reposted,setReposted]=useState<string[]>([]),[authOpen,setAuthOpen]=useState(false),[toast,setToast]=useState(''),[online,setOnline]=useState(true);
 const [categories,setCategories]=useState<ContentCategory[]>([]);
 const categoryName=useCallback((key:string|null)=>categories.find(c=>c.key===key)?.labels[locale]??key??'',[categories,locale]);
 const activeCategories=categories.filter(c=>c.enabled);
 const interactionEpoch=useRef(0),profileEpoch=useRef(0);
 const [settings,setSettings]=useState<SiteSettings>({id:true,notice:'',comments_enabled:true,ugc_enabled:true});
 const mounted=useRef(false),profileReady=useRef(false),currentUser=useRef<string|null>(null),authRequest=useRef(0),refreshRequest=useRef(0),authController=useRef<AbortController|null>(null),contentController=useRef<AbortController|null>(null),mutations=useRef(new Set<string>());
 const notify=useCallback((message:string)=>setToast(message),[]);
 const avatarAttempts=useRef(new Set<string>());
 const applyProfile=useCallback((fresh:Profile,actor:string)=>{if(!mounted.current||currentUser.current!==actor||fresh.id!==actor)return;++profileEpoch.current;setProfile(old=>old?{...old,...fresh}:fresh);setArticles(old=>old.map(a=>a.author_id===actor?{...a,author_name:fresh.display_name,author_handle:fresh.handle,author_avatar_key:fresh.avatar_key}:a));setContentVersion(v=>v+1);},[]);
 useEffect(()=>{if(!user||authStatus!=='ready'||!profile||!profile.profile_completed_at||profile.disabled||profile.avatar_key||profile.avatar_source!=='provider'||!profile.updated_at||avatarAttempts.current.has(user.id))return;
  if(!user.identities?.some(i=>['google','github','x','twitter'].includes(i.provider)))return;
  const actor=user.id;avatarAttempts.current.add(actor);
  // Provider photos are copied once into R2. Custom or removed photos are never overwritten at login.
  void saveProfile({display_name:profile.display_name,mode:'provider',expected_updated_at:profile.updated_at,automatic:true}).then(fresh=>applyProfile(fresh,actor)).catch(()=>{/* A failed provider import keeps the initials fallback; manual retry remains available. */});
 },[user,profile,authStatus,applyProfile]);
 const rememberArticles=useCallback((incoming:Article[])=>setArticles(old=>{const map=new Map(old.map(a=>[a.id,a]));incoming.forEach(a=>map.set(a.id,{...a,translations:Object.fromEntries(Object.entries(a.translations).map(([language,value])=>[language,{title:value?.title??'',summary:value?.summary??'',body:''}]))}));return [...map.values()].slice(-200);}),[]);
 const refresh=useCallback(async()=>{
  setContentVersion(v=>v+1);if(!db)return;
  const sequence=++refreshRequest.current;contentController.current?.abort();const controller=new AbortController();contentController.current=controller;const timeout=setTimeout(()=>controller.abort(),15000);
  setLoadError(false);try{
   const [s,c]=await Promise.all([db.from('omni_settings').select('*').eq('id',true).abortSignal(controller.signal).single(),db.from('omni_categories').select('*').order('position').order('key').abortSignal(controller.signal)]);
   if(!mounted.current||sequence!==refreshRequest.current)return;if(s.error||c.error)throw Error('Content unavailable');setSettings(s.data);setCategories(c.data);
  }catch{if(mounted.current&&sequence===refreshRequest.current)setLoadError(true);}finally{clearTimeout(timeout);if(mounted.current&&sequence===refreshRequest.current)setLoading(false);}
 },[db]);
 const sync=useCallback(async(nextUser:User|null)=>{
  const sequence=++authRequest.current;authController.current?.abort();const controller=new AbortController();authController.current=controller;
  const changed=currentUser.current!==(nextUser?.id??null);currentUser.current=nextUser?.id??null;
  invalidateConnections();setUser(nextUser);if(changed||!nextUser){profileReady.current=false;setProfile(null);setLiked([]);setBookmarked([]);setReposted([]);setArticles(old=>old.filter(a=>a.status==='published'));}if(!profileReady.current)setAuthStatus('loading');
  if(!nextUser||!db){setAuthStatus('ready');return;}
  const timeout=setTimeout(()=>controller.abort(),12000),epoch=interactionEpoch.current,profileVersion=profileEpoch.current;
  async function interactions(table:string){const rows:{article_id:string}[]=[];for(let offset=0;;offset+=500){const result=await db!.from(table).select('article_id').eq('user_id',nextUser!.id).order('article_id').range(offset,offset+499).abortSignal(controller.signal);if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)return rows;}}
  try{
   const [p,l,b,r]=await Promise.all([db.from('omni_profiles').select('*').eq('id',nextUser.id).abortSignal(controller.signal).single(),interactions('omni_likes'),interactions('omni_bookmarks'),interactions('omni_reposts')]);
   if(!mounted.current||sequence!==authRequest.current)return;if(p.error||!p.data)throw Error('Account unavailable');
   profileReady.current=true;if(profileVersion===profileEpoch.current)setProfile(p.data);if(epoch===interactionEpoch.current&&!mutations.current.size){setLiked(l.map(x=>x.article_id));setBookmarked(b.map(x=>x.article_id));setReposted(r.map(x=>x.article_id));}setAuthStatus('ready');
  }catch{if(mounted.current&&sequence===authRequest.current){profileReady.current=false;setProfile(null);setLiked([]);setBookmarked([]);setReposted([]);setAuthStatus('error');}}finally{clearTimeout(timeout);}
 },[db]);
 const retryAuth=useCallback(async()=>{if(!db)return;if(!profileReady.current)setAuthStatus('loading');try{const{data,error}=await db.auth.getSession();if(error)throw error;await sync(data.session?.user??null);}catch{if(mounted.current)setAuthStatus('error');}},[db,sync]);
 useEffect(()=>{mounted.current=true;let initial=true;
  if(db){const{data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(_event==='PASSWORD_RECOVERY'){try{sessionStorage.setItem('nextchina-auth-next','settings');}catch{}}initial=false;setTimeout(()=>{if(mounted.current)void sync(session?.user??null);},0);});db.auth.getSession().then(({data,error})=>{if(!initial||!mounted.current)return;if(error)setAuthStatus('error');else void sync(data.session?.user??null);});void refresh();return()=>{mounted.current=false;subscription.unsubscribe();authController.current?.abort();contentController.current?.abort();};}
  return()=>{mounted.current=false;};
 },[db,sync,refresh]);
 useEffect(()=>{document.documentElement.lang=locale;},[locale]);
 useEffect(()=>{function update(){setOnline(navigator.onLine);}update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(!db)return;let last=0;function focus(){if(navigator.onLine&&Date.now()-last>5000){last=Date.now();void retryAuth();void refresh();}}function visible(){if(document.visibilityState==='visible')focus();}window.addEventListener('online',focus);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',visible);};},[db,retryAuth,refresh]);
 async function toggle(kind:'likes'|'bookmarks',id:string){
  if(!online){notify(copy.offline);return;}if(!user){setAuthOpen(true);return;}if(authStatus!=='ready'||!profile||profile.disabled){notify(profile?.disabled?t.disabled:copy.authError);return;}
  const key=`${user.id}:${kind}:${id}`;if(mutations.current.has(key)||!db)return;mutations.current.add(key);++interactionEpoch.current;const actor=user.id;
  const values=kind==='likes'?liked:bookmarked,set=kind==='likes'?setLiked:setBookmarked,had=values.includes(id);
  try{const query=db.from(`omni_${kind}`);const{error}=had?await query.delete().eq('article_id',id).eq('user_id',actor).select('article_id'):await query.insert({article_id:id,user_id:actor}).select('article_id');if(error)throw error;if(currentUser.current!==actor)return;
   set(old=>had?old.filter(v=>v!==id):[...new Set([...old,id])]);if(kind==='likes')setArticles(old=>old.map(a=>a.id===id?{...a,like_count:Math.max(0,(a.like_count??0)+(had?-1:1))}:a));
  }catch{if(currentUser.current===actor)notify(t.error);}finally{++interactionEpoch.current;mutations.current.delete(key);}
 }
 async function toggleRepost(id:string){
  if(!user){setAuthOpen(true);return;}if(!online||!profile||profile.disabled||authStatus!=='ready'||!db)return;
  const actor=user.id,key=actor+':repost:'+id;if(mutations.current.has(key))return;mutations.current.add(key);++interactionEpoch.current;
  try{const{data,error}=await db.rpc('omni_set_repost',{target_article:id,new_state:!reposted.includes(id)});if(error)throw error;if(currentUser.current!==actor)return;
   setReposted(old=>data.reposted?[...new Set([...old,id])]:old.filter(v=>v!==id));setArticles(old=>old.map(a=>a.id===id?{...a,repost_count:data.repost_count}:a));setContentVersion(v=>v+1);
  }catch{if(currentUser.current===actor)notify(t.error);}finally{++interactionEpoch.current;mutations.current.delete(key);}
 }
 async function logout(){if(!db)return;setAuthStatus('loading');const{error}=await db.auth.signOut();if(error){setAuthStatus('error');notify(t.error);}else{await sync(null);setAuthOpen(false);void refresh();}}
 return{locale,t,db,demo,user,profile,applyProfile,authStatus,retryAuth,online,articles,rememberArticles,contentVersion,loading,loadError,liked,bookmarked,reposted,toggleRepost,authOpen,setAuthOpen,toast,notify,toggle,logout,settings,categories,activeCategories,categoryName,needsProfile:!!profile&&!profile.profile_completed_at,refresh};
}
type App=ReturnType<typeof useAppState>;const Context=createContext<App|null>(null);
export function Provider({locale,children}:{locale:Locale;children:ReactNode}){const value=useAppState(locale);return <Context.Provider value={value}>{children}{value.toast&&<div className="toast" role="status">{value.toast}</div>}</Context.Provider>;}
export function useApp(){const value=useContext(Context);if(!value)throw Error('Missing app provider');return value;}
