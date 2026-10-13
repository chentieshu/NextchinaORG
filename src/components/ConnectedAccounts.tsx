'use client';
import {useEffect,useState} from 'react';
import {FaGithub,FaXTwitter} from 'react-icons/fa6';
import {useApp} from './Provider';
import {useConnections} from '@/lib/connected-accounts';
import {connectedCopy} from '@/lib/connected-copy';
import {MEDIA_ORIGIN} from '@/lib/media';
export function ConnectedBadges({id}:{id?:string|null}){
 const accounts=useConnections(id),{locale}=useApp(),c=connectedCopy[locale];
 return accounts.length?<span className="connected-badges">{accounts.map(a=><a className="connected-badge" key={a.provider} href={a.url} target="_blank" rel="noopener noreferrer me" title={`${a.provider==='x'?'X':'GitHub'} · @${a.handle} · ${c.bound}`} aria-label={`${a.provider==='x'?'X':'GitHub'} @${a.handle} · ${c.bound}`} onClick={e=>e.stopPropagation()}>{a.provider==='x'?<FaXTwitter/>:<FaGithub/>}<span aria-hidden="true" className="binding-check">✓</span></a>)}</span>:null;
}
type Metric={provider:'github'|'x';provider_id:string;status:'ok'|'stale'|'unavailable'|'not_synced'|'not_configured'|'partial';count:number|null;checked_at:string|null;url:string;handle:string;can_sync?:boolean};
export function ConnectedMetrics({id}:{id:string}){
 const accounts=useConnections(id),{locale,user,db,online}=useApp(),c=connectedCopy[locale];
 const[metrics,setMetrics]=useState<Metric[]>([]),[error,setError]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[cooldown,setCooldown]=useState(false);
 const identity=accounts.map(a=>`${a.provider}:${a.provider_id}`).join('|');
 useEffect(()=>{setMetrics([]);setCooldown(false);if(!identity)return;const abort=new AbortController();let active=true;setError(false);fetch(`${MEDIA_ORIGIN}/v1/social-metrics?user=${encodeURIComponent(id)}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)]),referrerPolicy:'no-referrer'}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(active)setMetrics(data.metrics);}).catch(()=>{if(active)setError(true);});return()=>{active=false;abort.abort();};},[id,identity,revision]);
 async function sync(){if(!db||busy||!online)return;setBusy(true);setError(false);try{const{data}=await db.auth.getSession();if(!data.session)throw Error();const r=await fetch(`${MEDIA_ORIGIN}/v1/social-metrics/sync`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`},signal:AbortSignal.timeout(25000)});if(r.status===429){setCooldown(true);return;}if(!r.ok)throw Error();setRevision(n=>n+1);}catch{setError(true);}finally{setBusy(false);}}
 if(!accounts.length)return null;
 return <div className="connected-metrics"><div className="external-counts">{metrics.filter(m=>m.status!=='not_configured'&&accounts.some(a=>a.provider===m.provider&&a.provider_id===m.provider_id)).map(m=><a key={m.provider} href={m.url} target="_blank" rel="noopener noreferrer" title={`${m.provider==='github'?c.scope:c.followers}${m.checked_at?` · ${c.updated} ${new Date(m.checked_at).toLocaleString(locale)}`:''}`}><span>{m.provider==='github'?<FaGithub/>:<FaXTwitter/>}<b>{m.count===null?'—':m.count.toLocaleString(locale)}</b> {m.provider==='github'?c.stars:c.followers}</span><small>{m.status==='ok'?m.checked_at?`${c.updated} ${new Date(m.checked_at).toLocaleDateString(locale)}`:'':c[m.status]}</small></a>)}</div>{user?.id===id&&metrics.some(m=>m.provider==='x'&&m.can_sync)&&<div className="social-sync"><button className="text-link" disabled={busy||!online||cooldown} title={c.syncNote} onClick={()=>void sync()}>{busy?'…':c.refresh}</button><small>{c.cooldown}</small></div>}{error&&<p role="status" className="form-note">{c.error}</p>}</div>;
}
