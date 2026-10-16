'use client';
import Link from 'next/link';
import {useApp} from '@/components/Provider';
import {MarketDetail} from './Exchange';
import {useOfficial} from './OfficialSeries';
import {officialCopy} from './official-copy';
import {liveCopy} from './live-copy';
import './terminal.css';

export default function BtcTerminal(){
 const{locale,online}=useApp(),state=useOfficial(),d=state.data,c=liveCopy[locale],o=officialCopy[locale];
 const blocked=!online||state.error||!d?.current||!d.enabled||!d.healthy;
 return <main id="main" className="exchange-page btc-terminal">
  <header className="terminal-header"><div><span className="terminal-symbol" aria-hidden="true">₿</span><h1>{o.title}</h1></div><nav aria-label={c.markets}>
   <Link href={`/${locale}/predictions/`}>{c.markets}</Link><Link href={`/${locale}/predictions/?view=portfolio`}>{c.portfolio}</Link><Link href={`/${locale}/predictions/?series=btc-3m`}>{c.history}</Link>
  </nav></header>
  {(state.error||!online||d&&(!d.enabled||!d.healthy))&&<p className="history-warning" role="status">{d&&!d.enabled?o.paused:o.unhealthy} <button className="text-link" onClick={state.reload}>{o.retry}</button></p>}
  <MarketDetail id={d?.current?.id??null} live blocked={blocked}/>
 </main>;
}
