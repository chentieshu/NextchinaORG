'use client';
import {Suspense,useEffect} from 'react';
import dynamic from 'next/dynamic';
import {useSearchParams,useRouter} from 'next/navigation';
import {useApp} from './Provider';
import Exchange,{MarketFallback} from '@/modules/predictions/Exchange';
import BtcTerminal from '@/modules/predictions/BtcTerminal';
const LegacyForum=dynamic(()=>import('@/modules/forum/Forum').then(m=>m.ForumPage));
function HomeRoute(){
 const params=useSearchParams(),router=useRouter(),{locale}=useApp();
 // Root post links predate the market home. Keep bookmarks readable.
 const legacy=['id','scope','category','sort'].some(key=>params.has(key));
 useEffect(()=>{if(legacy)router.replace(`/${locale}/square/?${params}`+location.hash);},[legacy,locale,params,router]);
 const board=['view','q','sector','state','order','series','share'].some(key=>params.has(key));
 return legacy?<LegacyForum/>:board?<Exchange/>:<BtcTerminal/>;
}
export default function Home(){return <Suspense fallback={<MarketFallback/>}><HomeRoute/></Suspense>;}
