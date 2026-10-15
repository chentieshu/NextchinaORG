'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {IChartApi,ISeriesApi,UTCTimestamp,Time} from 'lightweight-charts';
import {FiBarChart2,FiRefreshCw} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {formatPoints} from '../wallet/money';
import './chart.css';
import {chartCopy} from './chart-copy';
import {exchangeCopy} from './exchange-copy';
import {chartUpdateKind,mergeCandles,validHistory,HISTORY_LIMIT,type Candle,type History,type Period} from './chart-data';

export default function MarketChart({marketId,refreshKey}:{marketId:string;refreshKey:string}) {
 const{locale,db,online}=useApp(),c=chartCopy[locale];
 const[period,setPeriod]=useState<Period>('1d'),[snapshot,setSnapshot]=useState<{key:string;data:History}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState<Candle|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const onlineRef=useRef(online);onlineRef.current=online;
 const key=marketId+':'+period,data=snapshot?.key===key?snapshot.data:null,rows=data?.rows??[],current=useRef(data),container=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),line=useRef<ISeriesApi<'Area'>|null>(null),bars=useRef<ISeriesApi<'Histogram'>|null>(null),drawn=useRef<Candle[]>([]),active=useRef(0),flight=useRef<AbortController|null>(null),currentKey=useRef(key);current.current=data;currentKey.current=key;
 const load=useCallback(async(older=false)=>{
  if(!db||!onlineRef.current||flight.current)return;const controller=new AbortController();flight.current=controller;const run=active.current,prior=current.current;setLoading(true);setError(false);
  try{const r=await db.rpc('omni_exchange_history',{target:marketId,period,...(older&&prior?.next_before?{before_time:prior.next_before}:prior?.rows.length?{since_time:new Date(prior.rows.at(-1)!.time*1000).toISOString()}:{} )}).abortSignal(AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]));
   if(run!==active.current||currentKey.current!==key)return;if(r.error||!validHistory(r.data))throw Error();const fresh=r.data;
   const reset=!older&&fresh.has_more;const from=fresh.from_time?Math.floor(Date.parse(fresh.from_time)/1000/fresh.step)*fresh.step:0;
   const merged=mergeCandles(reset?[]:prior?.rows??[],fresh.rows,from);
   setSnapshot({key,data:{...fresh,rows:merged,has_more:older||reset||!prior?fresh.has_more:prior.has_more,next_before:merged.length?new Date(merged[0].time*1000).toISOString():null}});
  }catch{if(run===active.current&&!controller.signal.aborted)setError(true);}finally{if(run===active.current){flight.current=null;setLoading(false);}}
 },[db,marketId,period,key]);
 useEffect(()=>{++active.current;flight.current?.abort();flight.current=null;setSelected(null);setSnapshot(null);void load();return()=>{++active.current;flight.current?.abort();flight.current=null;};},[load]);
 useEffect(()=>{if(document.visibilityState==='visible')void load();},[refreshKey,online,load]);
 const ready=rows.length>0;
 useEffect(()=>{
  if(!ready||!container.current)return;let disposed=false,observer:MutationObserver|undefined;setFailed(false);drawn.current=[];
  void import('lightweight-charts').then(lib=>{
   if(disposed||!container.current)return;
   const instance=lib.createChart(container.current,{autoSize:true,height:290,layout:{attributionLogo:true},grid:{vertLines:{visible:false}},rightPriceScale:{borderVisible:false,scaleMargins:{top:.08,bottom:.24}},timeScale:{borderVisible:false,timeVisible:true,secondsVisible:false,tickMarkFormatter:(t:Time,type:number)=>{const date=new Date(Number(t)*1000);return type===lib.TickMarkType.Year?date.toLocaleDateString(locale,{year:'numeric'}):type===lib.TickMarkType.Month?date.toLocaleDateString(locale,{month:'short'}):type===lib.TickMarkType.DayOfMonth?date.toLocaleDateString(locale,{month:'short',day:'numeric'}):date.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',hour12:false});}},handleScroll:{mouseWheel:false,vertTouchDrag:false,horzTouchDrag:true,pressedMouseMove:true},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:false},localization:{locale,timeFormatter:(t:Time)=>new Date(Number(t)*1000).toLocaleString(locale)}});
   chart.current=instance;line.current=instance.addSeries(lib.AreaSeries,{lineWidth:2,lineType:lib.LineType.WithSteps,priceLineVisible:false,priceFormat:{type:'custom',minMove:1,formatter:(v:number)=>v<0||v>100?'':`${v.toLocaleString(locale)}%`},autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})});
   bars.current=instance.addSeries(lib.HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false});bars.current.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0},visible:false});
   const colors=()=>{const css=getComputedStyle(document.documentElement),get=(name:string)=>css.getPropertyValue(name).trim();instance.applyOptions({layout:{background:{type:lib.ColorType.Solid,color:get('--card')},textColor:get('--muted'),fontFamily:get('--font-ui'),fontSize:11},grid:{horzLines:{color:get('--line')}},crosshair:{vertLine:{color:get('--muted'),labelBackgroundColor:get('--fg')},horzLine:{color:get('--muted'),labelBackgroundColor:get('--fg')}}});line.current?.applyOptions({lineColor:get('--accent'),topColor:get('--accent-soft'),bottomColor:get('--card')});bars.current?.applyOptions({color:get('--data-3')});};
   colors();observer=new MutationObserver(colors);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
   instance.subscribeCrosshairMove(e=>{const value=current.current?.rows.find(r=>r.time===Number(e.time));setSelected(value??null);});
   sync(current.current?.rows??[],true);
  }).catch(()=>{if(!disposed)setFailed(true);});
  return()=>{disposed=true;observer?.disconnect();chart.current?.remove();chart.current=null;line.current=null;bars.current=null;drawn.current=[];};
 },[ready,locale,attempt]);
 function sync(next:Candle[],initial=false){if(!chart.current||!line.current||!bars.current)return;const kind=chartUpdateKind(drawn.current,next),price=(r:Candle)=>({time:r.time as UTCTimestamp,value:r.close}),volume=(r:Candle)=>({time:r.time as UTCTimestamp,value:Number(r.volume)/10000});
  if(kind==='replace'){line.current.setData(next.map(price));bars.current.setData(next.map(volume));}else if(kind==='update'){for(const r of next.slice(Math.max(0,drawn.current.length-1))){line.current.update(price(r));bars.current.update(volume(r));}}if(initial)chart.current.timeScale().fitContent();drawn.current=next;
 }
 useEffect(()=>{sync(rows);},[data]);
 const point=selected??rows.at(-1);
 return <section className="market-history" aria-label={c.chart} data-history-count={rows.length}>
  <div className="history-toolbar"><div className="history-ranges" role="group" aria-label={c.range}>{(['1h','1d','1w','all'] as const).map((p,i)=><button type="button" key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)}>{[c.hour,c.day,c.week,c.all][i]}</button>)}</div><button type="button" className="icon-button" title={c.reset} aria-label={c.reset} disabled={!ready} onClick={()=>chart.current?.timeScale().fitContent()}><FiRefreshCw/></button></div>
  <div className="history-point" aria-live="off">{point?<><span>{new Date(point.time*1000).toLocaleString(locale)}</span><strong>{point.close}%</strong><span>{c.volume}: {formatPoints(point.volume,locale)}</span></>:<span>{loading?'…':error?'—':c.noHistory}</span>}</div>
  {error&&<p role="alert" className="history-warning">{data?c.stale:exchangeCopy[locale].error} <button className="text-link" onClick={()=>void load()}>{c.freshness}</button></p>}
  {ready?<div className="history-canvas" ref={container} role="img" aria-label={c.chart}/>:<div className="history-empty" role="status"><FiBarChart2/>{loading?'…':error?'—':c.noHistory}</div>}
  {failed&&<p role="alert">{c.chartError} <button className="text-link" onClick={()=>setAttempt(n=>n+1)}>{c.freshness}</button></p>}
  <div className="history-footer">{data?.has_more&&<button className="text-link" disabled={loading||rows.length>=HISTORY_LIMIT} onClick={()=>void load(true)}>{c.older}</button>}{data&&<time>{c.asof} {new Date(data.server_time).toLocaleTimeString(locale)}</time>}</div>
  {rows.length>=HISTORY_LIMIT&&data?.has_more&&<p className="form-note">{c.loadLimit}</p>}
  <details className="history-table"><summary>{c.table} ({Math.min(rows.length,100).toLocaleString(locale)} / {rows.length.toLocaleString(locale)})</summary><div><table><caption>{c.chart}</caption><thead><tr><th>{c.time}</th><th>{c.price}</th><th>{c.volume}</th></tr></thead><tbody>{rows.slice(-100).reverse().map(p=><tr key={p.time}><td>{new Date(p.time*1000).toLocaleString(locale)}</td><td>{p.close}%</td><td>{formatPoints(p.volume,locale)}</td></tr>)}</tbody></table></div></details>
  <p className="chart-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a> · Copyright (с) 2025 TradingView, Inc.</p>
 </section>;
}
