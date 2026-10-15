'use client';
import dynamic from 'next/dynamic';
import type {DistributionProps,ContentChartProps} from './Recharts';
const loading=()=> <div className="data-chart-placeholder" aria-hidden="true"/>;
export const DistributionChart=dynamic<DistributionProps>(()=>import('./Recharts').then(m=>m.DistributionChart),{ssr:false,loading});
export const ContentStatusChart=dynamic<ContentChartProps>(()=>import('./Recharts').then(m=>m.ContentStatusChart),{ssr:false,loading});
