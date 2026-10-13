'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {FiExternalLink,FiPlay,FiLink} from 'react-icons/fi';
import {FaGithub,FaSpotify,FaYoutube,FaXTwitter} from 'react-icons/fa6';
import {SiBilibili} from 'react-icons/si';
import {externalContent,type MediaItem} from '@/lib/external-content';
import {socialCopy} from '@/lib/social-copy';
import {useApp} from './Provider';
const icons={youtube:FaYoutube,bilibili:SiBilibili,x:FaXTwitter,spotify:FaSpotify,github:FaGithub,link:FiLink};
type Twitter={widgets:{createTweet:(id:string,node:HTMLElement,options:Record<string,unknown>)=>Promise<HTMLElement|undefined>}};
let twitterPromise:Promise<Twitter>|null=null;
function twitter(){if(twitterPromise)return twitterPromise;twitterPromise=new Promise((resolve,reject)=>{const existing=(window as Window&{twttr?:Twitter}).twttr;if(existing?.widgets){resolve(existing);return;}const script=document.createElement('script');script.src='https://platform.twitter.com/widgets.js';script.async=true;const timer=setTimeout(()=>{script.remove();twitterPromise=null;reject(Error('timeout'));},12000);script.onload=()=>{clearTimeout(timer);const api=(window as Window&{twttr?:Twitter}).twttr;if(api?.widgets)resolve(api);else{twitterPromise=null;reject(Error('unavailable'));}};script.onerror=()=>{clearTimeout(timer);script.remove();twitterPromise=null;reject(Error('unavailable'));};document.head.append(script);});return twitterPromise;}
export function ExternalContent({url}:{url:string}){
 const{locale}=useApp(),c=socialCopy[locale],data=externalContent(url),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),container=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!loaded||data?.provider!=='x'||!data.id)return;let active=true;const node=container.current;if(!node)return;node.replaceChildren();twitter().then(api=>active?api.widgets.createTweet(data.id!,node,{dnt:true,conversation:'none',align:'center',theme:document.documentElement.dataset.theme==='dark'?'dark':'light'}):undefined).then(value=>{if(active&&!value)setFailed(true);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;node.replaceChildren();};},[loaded,data?.id,data?.provider]);
 if(!data)return null;const Icon=icons[data.provider],playable=!!data.embed||data.provider==='x';
 return <div className={`external-content provider-${data.provider}`}><div className="external-heading"><Icon/><span>{data.label}</span><a href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={c.openExternal}><FiExternalLink/></a></div>{!loaded&&playable?<div className="external-placeholder"><button className="button" onClick={()=>setLoaded(true)}><FiPlay/>{c.loadEmbed}</button><small>{c.externalNotice}</small></div>:loaded&&data.embed?<iframe title={data.label} src={data.embed} loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={()=>setFailed(true)}/>:loaded&&data.provider==='x'?<div ref={container} className="x-embed"/>:<a className="external-url" href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc">{data.url}</a>}{failed&&<p className="form-note">{c.embedFailed}</p>}{loaded&&<a className="text-link external-fallback" href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc">{c.openExternal}</a>}</div>;
}
export function MediaPreview({items,href}:{items:MediaItem[];href:string}){
 const{locale}=useApp(),c=socialCopy[locale],first=items[0],[failed,setFailed]=useState(false);if(!first)return null;const data=externalContent(first.url);if(!data)return null;const Icon=icons[data.provider];
 return <Link className={`post-media-preview ${first.type==='image'?'has-photo':''}`} href={href} aria-label={c.openPost}>{first.type==='image'&&!failed?<img src={first.url} alt={first.alt??''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<><Icon/><span>{data.label}</span><FiExternalLink/></>}{items.length>1&&<small>+{items.length-1}</small>}</Link>;
}
