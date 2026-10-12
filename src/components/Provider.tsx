'use client';
import {createContext,useContext,useEffect,useState,useCallback,type ReactNode} from 'react';
import type {User} from '@supabase/supabase-js';
import {getSupabase} from '@/lib/supabase';
import {dictionaries,type Locale} from '@/lib/i18n';
import {demoArticles} from '@/lib/content';
import type {Article,Profile,SiteSettings} from '@/lib/types';

function useAppState(locale:Locale){
 const t=dictionaries[locale],db=getSupabase(),demo=!db;
 const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<Profile|null>(null);
 const [articles,setArticles]=useState<Article[]>(demo?demoArticles:[]),[loading,setLoading]=useState(!demo),[loadError,setLoadError]=useState(false);
 const [liked,setLiked]=useState<string[]>([]),[bookmarked,setBookmarked]=useState<string[]>([]),[authOpen,setAuthOpen]=useState(false),[toast,setToast]=useState('');
 const [settings,setSettings]=useState<SiteSettings>({id:true,notice:'',comments_enabled:true,ugc_enabled:true});
 const notify=useCallback((message:string)=>setToast(message),[]);
 const refresh=useCallback(async()=>{
  if(!db)return;
  setLoading(true);setLoadError(false);
  const [n,p,s,c]=await Promise.all([db.from('omni_articles').select('*').eq('content_type','news').eq('status','published').order('published_at',{ascending:false}).limit(500),db.from('omni_articles').select('*').eq('content_type','post').eq('status','published').order('featured',{ascending:false}).order('published_at',{ascending:false}).limit(500),db.from('omni_settings').select('*').eq('id',true).single(),db.rpc('omni_article_counts')]);
  if(n.error||p.error||s.error||c.error){setLoadError(true);}else{const counts=new Map((c.data??[]).map((v:{article_id:string;like_count:number;comment_count:number})=>[v.article_id,v]));setArticles([...(n.data??[]),...(p.data??[])].map(a=>({...a,...(counts.get(a.id)??{})})));setSettings(s.data);}
  setLoading(false);
 },[db]);
 useEffect(()=>{document.documentElement.lang=locale;localStorage.setItem('omni-locale',locale);},[locale]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{
  if(!db){try{setLiked(JSON.parse(localStorage.getItem('omni-demo-likes')??'[]'));setBookmarked(JSON.parse(localStorage.getItem('omni-demo-bookmarks')??'[]'));}catch{}return;}
  let active=true;
  const sync=async(u:User|null)=>{
   if(!active)return;setUser(u);setProfile(null);setLiked([]);setBookmarked([]);
   if(u){const [p,l,b]=await Promise.all([db.from('omni_profiles').select('*').eq('id',u.id).single(),db.from('omni_likes').select('article_id').eq('user_id',u.id),db.from('omni_bookmarks').select('article_id').eq('user_id',u.id)]);if(active){setProfile(p.data);setLiked(l.data?.map(x=>x.article_id)??[]);setBookmarked(b.data?.map(x=>x.article_id)??[]);if(p.error)notify(t.error);}}
  };
  db.auth.getSession().then(({data,error})=>{if(error)notify(t.error);void sync(data.session?.user??null);});
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>{void sync(session?.user??null);},0);});
  void refresh();return()=>{active=false;subscription.unsubscribe();};
 },[db,refresh,notify,t.error]);
 async function toggle(kind:'likes'|'bookmarks',id:string){
  const values=kind==='likes'?liked:bookmarked,set=kind==='likes'?setLiked:setBookmarked,had=values.includes(id),next=had?values.filter(v=>v!==id):[...values,id];
  if(demo){set(next);localStorage.setItem(`omni-demo-${kind}`,JSON.stringify(next));notify(t.demoAction);return;}
  if(!user){setAuthOpen(true);return;}if(!profile||profile.disabled){notify(t.disabled);return;}
  const query=db!.from(`omni_${kind}`);const {error}=had?await query.delete().eq('article_id',id).eq('user_id',user.id):await query.insert({article_id:id,user_id:user.id});
  if(error){notify(t.error);return;}set(next);
  if(kind==='likes')setArticles(a=>a.map(v=>v.id===id?{...v,like_count:Math.max(0,(v.like_count??0)+(had?-1:1))}:v));
 }
 async function logout(){if(db){const{error}=await db.auth.signOut();if(error)notify(t.error);}}
 return{locale,t,db,demo,user,profile,articles,loading,loadError,liked,bookmarked,authOpen,setAuthOpen,toast,notify,toggle,logout,settings,refresh};
}
type App=ReturnType<typeof useAppState>;
const Context=createContext<App|null>(null);
export function Provider({locale,children}:{locale:Locale;children:ReactNode}){const value=useAppState(locale);return <Context.Provider value={value}>{children}{value.toast&&<div className="toast" role="status">{value.toast}</div>}</Context.Provider>;}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('Missing app provider');return value;}
