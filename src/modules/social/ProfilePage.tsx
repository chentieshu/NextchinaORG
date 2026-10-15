'use client';
import Link from 'next/link';
import {Suspense,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {FiArrowLeft,FiLink,FiCalendar,FiEdit3} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {ConnectedBadges,ConnectedMetrics} from '@/components/ConnectedAccounts';
import {SITE_ORIGIN} from '@/lib/site';
import {FollowButton} from '@/components/FollowButton';
import {Avatar,UserIdentity} from '@/components/Avatar';
import {RichText} from '@/components/RichText';
import {Modal} from '@/components/Shell';
import {ArticleFeed} from '@/modules/news/NewsExperience';
import {socialCopy} from '@/lib/social-copy';
import {safeSource} from '@/lib/content';
import type {RichNode} from '@/lib/types';
type PublicProfile={id:string;display_name:string;handle:string;avatar_key:string|null;bio:string;website:string;created_at:string;following:boolean;follower_count:number;following_count:number;post_count:number};
export function ProfilePage(){return <Suspense><ProfileRoute/></Suspense>;}
function ProfileRoute(){const params=useSearchParams(),{user}=useApp();return <ProfileView key={params.get('id')??user?.id??'guest'} id={params.get('id')??user?.id??''}/>;}
function ProfileView({id}:{id:string}){
 const{db,user,profile,locale,t,contentVersion,notify}=useApp(),c=socialCopy[locale];
 const[data,setData]=useState<PublicProfile|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[tab,setTab]=useState<'posts'|'replies'|'media'>('posts'),[list,setList]=useState<'followers'|'following'|null>(null);
 useEffect(()=>{if(!db||!/^[0-9a-f-]{36}$/i.test(id)){setLoading(false);return;}const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);let active=true;setLoading(true);setFailed(false);db.rpc('omni_profile_page',{target_user:id}).abortSignal(abort.signal).then(({data,error})=>{if(!active)return;setFailed(!!error);if(!error)setData(data);setLoading(false);});return()=>{active=false;clearTimeout(timer);abort.abort();};},[db,id,revision,user?.id,contentVersion]);

 if(loading&&!data)return <main id="main" className="empty-state" role="status">{t.loading}</main>;
 if(!data)return <main id="main" className="empty-state"><h1>{failed?t.connectionError:c.notFound}</h1>{failed&&<button className="button" onClick={()=>setRevision(n=>n+1)}>{t.retry}</button>}<Link href={`/${locale}/`}>{t.back}</Link></main>;
 const own=user?.id===id,website=safeSource(data.website);
 return <main id="main" className="profile-page content-wrap page-wrap"><Link className="back-link" href={`/${locale}/`}><FiArrowLeft/>{socialCopy[locale].all}</Link><div className="public-profile"><div className="public-profile-top"><Avatar name={data.display_name} avatarKey={own?profile?.avatar_key:data.avatar_key} size={88}/><div className="profile-buttons">{own?<Link className="icon-button icon-control profile-edit" aria-label={c.editProfile} title={c.editProfile} href={`/${locale}/settings/#profile`}><FiEdit3/></Link>:<FollowButton id={id} following={data.following} disabled={loading} onChange={()=>setRevision(n=>n+1)}/>}<button className="icon-button" aria-label={c.copyLink} onClick={async()=>{try{await navigator.clipboard.writeText(`${SITE_ORIGIN}/${locale}/profile/?id=${id}`);notify(t.copied);}catch{notify(t.error);}}}><FiLink/></button></div></div><div className="profile-name-row"><h1>{own?profile?.display_name??data.display_name:data.display_name}</h1><ConnectedBadges id={id}/></div><p className="profile-handle">@{data.handle}</p>{data.bio&&<p className="profile-bio">{data.bio}</p>}<div className="profile-facts">{website&&<a href={website} target="_blank" rel="noopener noreferrer nofollow ugc"><FiLink/>{new URL(website).hostname}</a>}<span><FiCalendar/>{c.joined} {new Date(data.created_at).toLocaleDateString(locale,{year:'numeric',month:'short'})}</span></div><div className="profile-counts"><button onClick={()=>setList('following')}><b>{data.following_count}</b> {c.following}</button><button onClick={()=>setList('followers')}><b>{data.follower_count}</b> {c.followers}</button><span><b>{data.post_count}</b> {c.posts}</span></div><ConnectedMetrics key={id} id={id}/>{failed&&<p className="form-note" role="alert">{t.connectionError}</p>}</div><div className="profile-tabs" role="group" aria-label={c.profile}>{(['posts','replies','media'] as const).map(value=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{c[value]}</button>)}</div>{tab==='replies'?<UserReplies id={id}/>:<ArticleFeed key={tab} kind="post" author={id} mediaOnly={tab==='media'}/>} {list&&<PeopleList id={id} kind={list} close={()=>setList(null)}/>}</main>;
}
function PeopleList({id,kind,close}:{id:string;kind:'followers'|'following';close:()=>void}){
 const{db,locale,t}=useApp(),c=socialCopy[locale],[rows,setRows]=useState<PublicProfile[]>([]),[page,setPage]=useState(0),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false),[more,setMore]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!db)return;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);let active=true;setBusy(true);setFailed(false);db.rpc('omni_follow_list',{target_user:id,list_kind:kind,offset_rows:page*30}).abortSignal(abort.signal).then(({data,error})=>{if(!active)return;setFailed(!!error);if(!error){setRows(old=>page?[...old,...data.slice(0,30)]:data.slice(0,30));setMore(data.length>30);}setBusy(false);});return()=>{active=false;clearTimeout(timer);abort.abort();};},[db,id,kind,page,attempt]);
 return <Modal title={c[kind]} onClose={close}><h2>{c[kind]}</h2><div className="people-list">{rows.map(p=><div key={p.id} onClick={close}><UserIdentity id={p.id} name={p.display_name} avatarKey={p.avatar_key} size={38}/><small>@{p.handle}</small>{p.bio&&<p>{p.bio}</p>}</div>)}</div>{busy?<p role="status">{t.loading}</p>:!rows.length&&!failed?<p className="form-note">{c.empty}</p>:null}{failed&&<button className="text-link" onClick={()=>setAttempt(n=>n+1)}>{c.retry}</button>}{more&&<button className="button" disabled={busy} onClick={()=>setPage(n=>n+1)}>{c.more}</button>}</Modal>;
}
function UserReplies({id}:{id:string}){
 const{db,locale,t,contentVersion}=useApp(),c=socialCopy[locale],[rows,setRows]=useState<{id:string;article_id:string;body:string;document?:RichNode;created_at:string;content_type:string}[]>([]),[page,setPage]=useState(0),[busy,setBusy]=useState(true),[failed,setFailed]=useState(false),[more,setMore]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!db)return;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);let active=true;setBusy(true);db.rpc('omni_user_replies',{target_user:id,offset_rows:page*30}).abortSignal(abort.signal).then(({data,error})=>{if(!active)return;setFailed(!!error);if(!error){setRows(old=>page?[...old,...data.slice(0,30)]:data.slice(0,30));setMore(data.length>30);}setBusy(false);});return()=>{active=false;clearTimeout(timer);abort.abort();};},[db,id,page,attempt,contentVersion]);
 return <div className="user-replies">{rows.map(row=><article key={row.id}><time>{new Date(row.created_at).toLocaleDateString(locale)}</time><RichText text={row} compact/><Link className="text-link" href={`/${locale}/${row.content_type==='news'?'news':'community'}/?id=${row.article_id}#comments`}>{c.openPost}</Link></article>)}{busy?<p role="status">{t.loading}</p>:!rows.length&&!failed?<p className="empty-state">{c.empty}</p>:null}{failed&&<button className="button" onClick={()=>setAttempt(n=>n+1)}>{t.retry}</button>}{more&&<button className="button" disabled={busy} onClick={()=>setPage(n=>n+1)}>{c.more}</button>}</div>;
}
