'use client';
import {FiBarChart2,FiFileText,FiMessageCircle,FiUsers,FiLayers} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {ContentStatusChart,DistributionChart} from '@/components/data/Charts';
import {dataCopy} from '@/components/data/copy';
import {forumCopy} from '@/lib/forum-copy';
import {adminCopy} from '@/lib/admin-copy';
export type OverviewData={sampled_at:string;content:{content_type:'post'|'news';status:string;count:number}[];comments:number;members:number|null;categories:Record<string,number>};
export type OverviewTarget='posts'|'articles'|'moderation'|'members';
export function Overview({data,owner,onSelect}:{data:OverviewData;owner:boolean;onSelect:(tab:OverviewTarget,status?:string)=>void}){
 const{locale,t,categoryName}=useApp(),c=dataCopy[locale],f=forumCopy[locale],a=adminCopy[locale],number=new Intl.NumberFormat(locale);
 const count=(kind:'post'|'news',status?:string)=>data.content.filter(row=>row.content_type===kind&&(!status||row.status===status)).reduce((n,row)=>n+Number(row.count),0);
 const rows=(['post','news'] as const).map(kind=>({label:kind==='post'?f.post:f.news,published:count(kind,'published'),draft:count(kind,'draft'),archived:count(kind,'archived')}));
 const names={published:t.published,draft:t.draft,archived:t.archived};
 const categories=Object.entries(data.categories).filter(([,value])=>Number(value)>0).sort((a,b)=>b[1]-a[1]);
 const categoryRows=categories.slice(0,7).map(([key,value])=>({label:categoryName(key),value:Number(value)}));if(categories.length>7)categoryRows.push({label:c.other,value:categories.slice(7).reduce((n,[,v])=>n+Number(v),0)});
 const cards=[{tab:'posts' as const,label:f.posts,value:count('post'),Icon:FiMessageCircle},{tab:'articles' as const,label:f.news,value:count('news'),Icon:FiFileText},{tab:'moderation' as const,label:t.moderation,value:data.comments,Icon:FiLayers},...(owner?[{tab:'members' as const,label:t.members,value:data.members,Icon:FiUsers}]:[])];
 return <><div className="overview-grid">{cards.map(({tab,label,value,Icon})=><button key={tab} onClick={()=>onSelect(tab)} title={`${c.view} · ${label}`}><span><Icon aria-hidden="true"/>{label}</span><strong>{value===null?'—':number.format(value)}</strong></button>)}</div>
 <div className="data-dashboard-panels"><section className="data-panel" aria-label={c.content}><div className="data-panel-header"><h3><FiBarChart2 aria-hidden="true"/>{c.content}</h3><span title={c.source}>{c.snapshot}</span></div>
 {rows.some(row=>row.published+row.draft+row.archived>0)?<ContentStatusChart rows={rows} names={names} locale={locale}/>:<p className="data-panel-empty">{c.empty}</p>}
 <table className="data-comparison"><caption className="sr-only">{c.content}</caption><thead><tr><th scope="col">{c.type}</th>{(['published','draft','archived'] as const).map((state,i)=><th key={state} scope="col"><i aria-hidden="true" className="data-swatch" style={{background:`var(--data-${i+1})`}}/> {names[state]}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.label}><th scope="row">{row.label}</th>{(['published','draft','archived'] as const).map(state=><td key={state}><button title={`${row.label} · ${names[state]} · ${c.view}`} aria-label={`${row.label} · ${names[state]}: ${number.format(row[state])}`} onClick={()=>onSelect(i===0?'posts':'articles',state)}>{number.format(row[state])}</button></td>)}</tr>)}</tbody></table>
 </section>{categoryRows.length>0&&<section className="data-panel" aria-label={c.categories}><div className="data-panel-header"><h3><FiLayers aria-hidden="true"/>{c.categories}</h3><span>{a.current}</span></div><DistributionChart items={categoryRows} locale={locale}/><dl className="data-breakdown">{categoryRows.map((row,i)=><div key={`${i}:${row.label}`}><dt><i className="data-swatch" aria-hidden="true" style={{background:`var(--data-${i%3+1})`}}/>{row.label}</dt><dd>{number.format(row.value)}</dd></div>)}</dl></section>}</div></>;
}
