'use client';
import dynamic from 'next/dynamic';
import type {DistributionProps,ContentChartProps,CompositionProps} from './chart-types';
const loading=()=> <div className="data-chart-placeholder" aria-hidden="true"/>;
export const DistributionChart=dynamic<DistributionProps>(()=>import('./NivoBar').then(m=>m.DistributionChart),{ssr:false,loading});
export const ContentStatusChart=dynamic<ContentChartProps>(()=>import('./NivoBar').then(m=>m.ContentStatusChart),{ssr:false,loading});
export const CompositionChart=dynamic<CompositionProps>(()=>import('./NivoPie').then(m=>m.CompositionChart),{ssr:false,loading});
