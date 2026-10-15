'use client';
import {useApp} from '@/components/Provider';
import {CompositionChart} from '@/components/data/Charts';
import {dataCopy} from '@/components/data/copy';
import {workspaceCopy} from '@/modules/admin/copy';
import {walletCopy} from './copy';
import {formatPoints} from './money';
export function PointsComposition({data}:{data:{purchased:string;earned:string;held:string}}){
 const{locale}=useApp(),c=walletCopy[locale],ui=workspaceCopy[locale],d=dataCopy[locale];
 const keys=['purchased','earned','held'] as const,total=keys.reduce((sum,key)=>sum+BigInt(data[key]),0n),items=keys.map(key=>({label:c[key],value:total>0n?Number(BigInt(data[key])*1000000n/total):0,display:formatPoints(data[key],locale)+' '+c.points}));
 return <section className="data-panel" aria-label={ui.amounts}><div className="data-panel-header"><h3>{ui.amounts}</h3><span>{d.snapshot}</span></div><div className="data-composition-layout">{total>0n?<CompositionChart items={items} locale={locale} center={c.points}/>:<p className="data-panel-empty">{d.empty}</p>}<dl className="data-breakdown">{items.map((row,i)=><div key={row.label}><dt><i className="data-swatch" aria-hidden="true" style={{background:`var(--data-${i+1})`}}/>{row.label}</dt><dd>{row.display}</dd></div>)}</dl></div></section>;
}
