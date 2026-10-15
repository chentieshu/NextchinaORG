'use client';
import {BarChart,Bar,Cell,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
export type Datum={label:string;value:number;display?:string};
export type DistributionProps={items:Datum[];locale:string;unit?:'bytes'};
const compact=(n:number,locale:string)=>new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(n);
function bytes(n:number,locale:string){const index=n>=1099511627776?4:n>=1073741824?3:n>=1048576?2:n>=1024?1:0;return new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(n/1024**index)+' '+['B','KiB','MiB','GiB','TiB'][index];}
export function DistributionChart({items,locale,unit}:DistributionProps){
 return <div className="data-chart" aria-hidden="true" style={{height:Math.max(130,items.length*38)}}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
  <BarChart data={items} layout="vertical" margin={{top:5,right:18,bottom:0,left:0}} accessibilityLayer={false}>
   <CartesianGrid horizontal={false} stroke="var(--line)" strokeDasharray="3 5"/><XAxis type="number" domain={[0,'dataMax']} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={n=>unit==='bytes'?bytes(n,locale):compact(n,locale)} allowDecimals={false}/><YAxis type="category" dataKey="label" width={100} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={label=>String(label).length>13?String(label).slice(0,12)+'…':String(label)}/>
   <Tooltip cursor={{fill:'var(--soft)'}} content={({active,payload})=>active&&payload?.[0]?<div className="data-tooltip"><span>{payload[0].payload.label}</span><b>{payload[0].payload.display??new Intl.NumberFormat(locale).format(Number(payload[0].value))}</b></div>:null}/>
   <Bar dataKey="value" maxBarSize={20} radius={[0,4,4,0]} isAnimationActive={false}>{items.map((item,i)=><Cell key={`${i}:${item.label}`} fill={`var(--data-${i%3+1})`}/>)}</Bar>
  </BarChart>
 </ResponsiveContainer></div>;
}
export type ContentChartProps={rows:{label:string;published:number;draft:number;archived:number}[];names:{published:string;draft:string;archived:string};locale:string};
export function ContentStatusChart({rows,names,locale}:ContentChartProps){
 return <div className="data-chart data-content-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
  <BarChart data={rows} layout="vertical" margin={{top:6,right:12,bottom:0,left:0}} accessibilityLayer={false}>
   <CartesianGrid horizontal={false} stroke="var(--line)" strokeDasharray="3 5"/><XAxis type="number" domain={[0,'dataMax']} axisLine={false} tickLine={false} allowDecimals={false} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={n=>compact(n,locale)}/><YAxis type="category" dataKey="label" width={72} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:12}}/>
   <Tooltip cursor={{fill:'var(--soft)'}} content={({active,payload,label})=>active&&payload?.length?<div className="data-tooltip"><span>{label}</span>{payload.map(p=><div key={String(p.dataKey)}><span>{p.name}</span><b>{new Intl.NumberFormat(locale).format(Number(p.value))}</b></div>)}</div>:null}/>
   {(['published','draft','archived'] as const).map((key,i)=><Bar key={key} dataKey={key} name={names[key]} fill={`var(--data-${i+1})`} stackId="status" maxBarSize={24} isAnimationActive={false}/>)}
  </BarChart>
 </ResponsiveContainer></div>;
}
