'use client';
import {ResponsiveBar} from '@nivo/bar';
import {nivoTheme,chartColors} from './nivo-theme';
import {compactCount,formatCount,formatBytes} from './format';
import type {DistributionProps,ContentChartProps} from './chart-types';
const short=(label:string|number)=>String(label).length>15?String(label).slice(0,14)+'…':String(label);
const countTicks=(max:number)=>max<=5?Array.from({length:max+1},(_,i)=>i):[0,Math.ceil(max/2),max];
export function DistributionChart({items,locale,unit}:DistributionProps){
 const data=items.map((item,index)=>({id:String(index),label:item.label,value:item.value,display:item.display??formatCount(item.value,locale)})).reverse(),max=Math.max(...items.map(item=>item.value),1),ticks=unit==='bytes'?[0,max/2,max]:countTicks(max);
 return <div className="data-chart nivo-chart" data-chart="distribution" aria-hidden="true" style={{height:Math.max(176,items.length*42+36)}}><ResponsiveBar data={data} keys={['value']} indexBy="id" layout="horizontal" margin={{top:8,right:24,bottom:32,left:106}} padding={.5} valueScale={{type:'linear',min:0,max:'auto'}} colors={({data})=>chartColors[Number(data.id)%3]} theme={nivoTheme} animate={false} borderRadius={3} enableLabel={false} enableGridX enableGridY={false} gridXValues={ticks} axisTop={null} axisRight={null} axisLeft={{tickSize:0,tickPadding:10,format:id=>short(items[Number(id)]?.label??id)}} axisBottom={{tickSize:0,tickPadding:10,tickValues:ticks,format:n=>unit==='bytes'?formatBytes(Number(n),locale,1):compactCount(Number(n),locale)}} tooltip={({data})=><div className="data-tooltip"><span>{data.label}</span><b>{data.display}</b></div>} isFocusable={false}/></div>;
}
export function ContentStatusChart({rows,names,locale}:ContentChartProps){
 const ticks=countTicks(Math.max(...rows.map(row=>row.published+row.draft+row.archived),1));
 return <div className="data-chart data-content-chart nivo-chart" data-chart="content-status" aria-hidden="true"><ResponsiveBar data={[...rows].reverse()} keys={['published','draft','archived']} indexBy="label" layout="horizontal" groupMode="stacked" margin={{top:8,right:24,bottom:32,left:68}} padding={.58} valueScale={{type:'linear',min:0,max:'auto'}} colors={({id})=>chartColors[['published','draft','archived'].indexOf(String(id))]} theme={nivoTheme} animate={false} enableLabel={false} enableGridX enableGridY={false} gridXValues={ticks} axisTop={null} axisRight={null} axisLeft={{tickSize:0,tickPadding:10}} axisBottom={{tickSize:0,tickPadding:10,tickValues:ticks,format:n=>compactCount(Number(n),locale)}} tooltip={({id,value,indexValue})=><div className="data-tooltip"><span>{indexValue} · {names[id as keyof typeof names]}</span><b>{formatCount(value,locale)}</b></div>} isFocusable={false}/></div>;
}
