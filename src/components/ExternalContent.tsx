'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {FiExternalLink,FiPlay,FiLink,FiStar,FiGitBranch} from 'react-icons/fi';
import {FaGithub,FaSpotify,FaYoutube,FaXTwitter} from 'react-icons/fa6';
import {SiBilibili} from 'react-icons/si';
import {PredictionCard} from '@/modules/predictions/ReferenceCard';
import {predictionReference} from '@/modules/predictions/reference';
import {externalContent,type MediaItem} from '@/lib/external-content';
import {useLinkPreview} from '@/lib/use-link-preview';
import {chinaCopy} from '@/lib/chinateam-copy';
import {socialCopy} from '@/lib/social-copy';
import {useApp} from './Provider';
const icons={youtube:FaYoutube,bilibili:SiBilibili,x:FaXTwitter,spotify:FaSpotify,github:FaGithub,link:FiLink};
type Twitter={widgets:{createTweet:(id:string,node:HTMLElement,options:Record<string,unknown>)=>Promise<HTMLElement|undefined>}};
let twitterPromise:Promise<Twitter>|null=null;
function twitter(){if(twitterPromise)return twitterPromise;twitterPromise=new Promise((resolve,reject)=>{const existing=(window as Window&{twttr?:Twitter}).twttr;if(existing?.widgets){resolve(existing);return;}const script=document.createElement('script');script.src='https://platform.twitter.com/widgets.js';script.async=true;const timer=setTimeout(()=>{script.remove();twitterPromise=null;reject(Error('timeout'));},12000);script.onload=()=>{clearTimeout(timer);const api=(window as Window&{twttr?:Twitter}).twttr;if(api?.widgets)resolve(api);else{twitterPromise=null;reject(Error('unavailable'));}};script.onerror=()=>{clearTimeout(timer);script.remove();twitterPromise=null;reject(Error('unavailable'));};document.head.append(script);});return twitterPromise;}
export function ExternalContent({url}:{url:string}){return predictionReference(url)?<PredictionCard url={url}/>:<RemoteContent url={url}/>;}
function RemoteContent({url}:{url:string}){
 const{locale,profile}=useApp(),c=socialCopy[locale],ct=chinaCopy[locale],data=externalContent(url),metadata=useLinkPreview(url),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),container=useRef<HTMLDivElement>(null);
 useEffect(()=>{setLoaded(profile?.embed_mode==='auto');setFailed(false);},[url,profile?.embed_mode]);
 useEffect(()=>{if(!loaded||data?.provider!=='x'||!data.id)return;let active=true;const node=container.current;if(!node)return;node.replaceChildren();twitter().then(api=>active?api.widgets.createTweet(data.id!,node,{dnt:true,conversation:'none',align:'center',theme:document.documentElement.dataset.theme==='dark'?'dark':'light'}):undefined).then(value=>{if(active&&!value)setFailed(true);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;node.replaceChildren();};},[loaded,data?.id,data?.provider]);
 if(!data)return null;const Icon=icons[data.provider],playable=!!data.embed||data.provider==='x';
 const preview=metadata.preview,thumbnail=preview?.thumbnail_url;
 return <div ref={metadata.ref} className={`external-content provider-${data.provider}`}><div className="external-heading"><Icon/><span>{data.provider==='link'?new URL(data.url).hostname:data.label}</span><a href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={c.openExternal}><FiExternalLink/></a></div>{!loaded&&playable?<div className={`external-placeholder ${thumbnail?'with-thumbnail':''}`}>{thumbnail&&<img src={thumbnail} alt="" loading="lazy" decoding="async" onError={e=>{e.currentTarget.style.display='none';}}/>}<button className="button" onClick={()=>setLoaded(true)}><FiPlay/>{c.loadEmbed}</button><small>{c.externalNotice}</small></div>:loaded&&data.embed?<iframe title={preview?.title??data.label} src={data.embed} loading="lazy" allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={()=>setFailed(true)}/>:loaded&&data.provider==='x'?<div ref={container} className="x-embed"/>:null}<a className="link-preview-body" href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc"><strong>{preview?.title??data.label}</strong>{preview?.description&&<p>{preview.description}</p>}{preview?.author&&<p>{preview.author}</p>}{data.provider==='github'&&preview?.available&&<span className="repository-stats">{preview.language&&<span>{preview.language}</span>}<span><FiStar/>{(preview.stars??0).toLocaleString(locale)}</span><span><FiGitBranch/>{(preview.forks??0).toLocaleString(locale)}</span></span>}<small className="sr-only">{new URL(data.url).hostname}{data.provider==='link'?new URL(data.url).pathname.slice(0,100):''}</small></a>{failed&&<p className="form-note">{c.embedFailed}</p>}{preview&&!preview.available&&['github','youtube','spotify'].includes(data.provider)&&<p className="form-note preview-unavailable">{ct.previewUnavailable}</p>}{failed&&<a className="text-link external-fallback" href={data.url} target="_blank" rel="noopener noreferrer nofollow ugc">{c.openExternal}</a>}</div>;
}
export function MediaPreview({items,href}:{items:MediaItem[];href:string}){const ref=items.find(i=>i.type==='embed'&&predictionReference(i.url));return ref?<PredictionCard url={ref.url} compact/>:<RemoteMediaPreview items={items} href={href}/>;}
function RemoteMediaPreview({items,href}:{items:MediaItem[];href:string}){
 const{locale}=useApp(),c=socialCopy[locale],first=items[0],metadata=useLinkPreview(first?.url??'',first?.type==='embed'),[failed,setFailed]=useState(false);if(!first)return null;const data=externalContent(first.url);if(!data)return null;const Icon=icons[data.provider],thumbnail=first.type==='image'?first.url:metadata.preview?.thumbnail_url;
 return <Link ref={metadata.ref} className={`post-media-preview ${thumbnail&&!failed?'has-photo':''}`} href={href} aria-label={c.openPost}>{thumbnail&&!failed?<><img src={thumbnail} alt={first.type==='image'?first.alt??'':metadata.preview?.title??data.label} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>{first.type==='embed'&&<span className="media-platform"><Icon/></span>}</>:<><Icon/><span>{metadata.preview?.title??data.label}</span><FiExternalLink/></>}{items.length>1&&<small>+{items.length-1}</small>}</Link>;
}
