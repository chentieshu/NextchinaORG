'use client';
import {useEffect,useState} from 'react';
import {useApp} from '@/components/Provider';
import {formatPoints} from './money';
import {GatewaySetup} from './Gateway';
import {gatewayCopy} from './gateway-copy';
import {walletCopy} from './copy';
import {WithdrawalList} from './WalletPage';
import './wallet.css';
type Summary={accounts:number;journals:number;purchased:string;earned:string;held:string;balanced:boolean;settings:{deposits_enabled:boolean;tipping_enabled:boolean;withdrawals_enabled:boolean}};
export function WalletAdmin(){const{db,locale,profile}=useApp(),c=walletCopy[locale],[data,setData]=useState<Summary|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!db||profile?.role!=='super_admin')return;let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);setError(false);void db.rpc('omni_wallet_admin_summary').abortSignal(controller.signal).then(result=>{if(!active)return;if(result.error)setError(true);else setData(result.data);});const refresh=()=>setAttempt(n=>n+1);window.addEventListener('wallet:changed',refresh);return()=>{active=false;clearTimeout(timer);controller.abort();window.removeEventListener('wallet:changed',refresh);};},[db,profile?.id,profile?.role,attempt]);
 if(profile?.role!=='super_admin')return null;
 return <div className="wallet-admin">{error&&<p className="inline-error" role="alert">{c.error}<button onClick={()=>setAttempt(n=>n+1)}>{c.retry}</button></p>}{data?<><div className="wallet-admin-totals">{(['accounts','journals','purchased','earned','held'] as const).map(k=><div key={k}><span>{c[k]}</span><strong>{k==='accounts'||k==='journals'?Number(data[k]).toLocaleString(locale):formatPoints(data[k],locale)}</strong></div>)}</div><p className={data.balanced?'form-note':'inline-error'}>{data.balanced?c.balanced:c.unbalanced}</p><section className="wallet-setup"><h3>{c.setup}</h3><p>{gatewayCopy[locale].feeNote}</p><dl>{([['deposit','deposits_enabled'],['tip','tipping_enabled'],['withdraw','withdrawals_enabled']] as const).map(([label,key])=><div key={key}><dt>{c[label]}</dt><dd>{data.settings[key]?c.enabled:c.closed}</dd></div>)}</dl></section></>:!error&&<p role="status">{c.loading}</p>}<GatewaySetup/><h3>{c.queue}</h3><WithdrawalList admin/></div>;
}
