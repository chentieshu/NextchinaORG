'use client';
import {ResponsivePie} from '@nivo/pie';
import {nivoTheme,chartColors} from './nivo-theme';
import {formatCount} from './format';
import type {CompositionProps} from './chart-types';
export function CompositionChart({items,locale,center}:CompositionProps){
 const data=items.map((item,i)=>({id:String(i),label:item.label,value:item.value,display:item.display??formatCount(item.value,locale)})).filter(item=>item.value>0);
 return <div className="data-chart data-donut nivo-chart" data-chart="composition" aria-hidden="true"><ResponsivePie data={data} innerRadius={.76} padAngle={2} cornerRadius={3} colors={({id})=>chartColors[Number(id)%3]} theme={nivoTheme} animate={false} borderWidth={0} enableArcLabels={false} enableArcLinkLabels={false} activeOuterRadiusOffset={3} margin={{top:8,right:8,bottom:8,left:8}} tooltip={({datum})=><div className="data-tooltip"><span>{datum.label}</span><b>{datum.data.display}</b></div>}/>{center&&<span className="data-donut-center">{center}</span>}</div>;
}
