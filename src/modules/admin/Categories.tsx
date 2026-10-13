'use client';
import {useRef,useState} from 'react';
import {useApp} from '@/components/Provider';
import {adminCopy} from '@/lib/admin-copy';
import {experienceCopy} from '@/lib/experience-copy';
import {locales,languageNames,type Locale} from '@/lib/i18n';
import type {ContentCategory} from '@/lib/types';
const blank=()=>({key:'',labels:Object.fromEntries(locales.map(l=>[l,''])) as Record<Locale,string>,position:100,enabled:true,updated_at:''});
export function Categories({usage,onSaved}:{usage:Record<string,number>;onSaved:()=>void}){
 const {categories,categoryName,locale,t,db,refresh,notify,online}=useApp(),c=adminCopy[locale];
 const [form,setForm]=useState<ContentCategory|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 async function act(remove=false){if(!db||!form||pending.current||!online)return;if(remove&&!confirm(c.deleteCategory))return;pending.current=true;setBusy(true);setError('');
  try{const result=remove?await db.rpc('omni_delete_category',{category_key:form.key,expected_updated_at:form.updated_at}):await db.rpc('omni_save_category',{category_key:form.key,new_labels:form.labels,new_position:form.position,new_enabled:form.enabled,expected_updated_at:form.updated_at||null});if(result.error)throw result.error;setForm(null);notify(t.saved);await refresh();onSaved();}
  catch(e){const code=(e as {code?:string}).code;setError(code==='PT409'?experienceCopy[locale].conflict:code==='PT422'?c.inUse:code==='23505'?c.duplicate:t.error);}finally{pending.current=false;setBusy(false);}
 }
 return <section className="category-manager"><p className="form-note">{c.categoryNote}</p><div className="admin-table">{categories.map(row=><article key={row.key}><div><b>{categoryName(row.key)}</b><small>{row.key} · {usage[row.key]??'—'} {t.total} · {c.order} {row.position}</small></div><span className="status-label">{row.enabled?c.enabled:t.archived}</span><button className="button small" disabled={busy} onClick={()=>{setError('');setForm({...row,labels:{...row.labels}});}}>{t.edit}</button></article>)}</div>
 {!form?<button className="button" disabled={!online} onClick={()=>{setError('');setForm(blank());}}>{c.add}</button>:<form className="category-form" onSubmit={e=>{e.preventDefault();void act();}}><h3>{form.updated_at?c.editCategory:c.add}</h3><div className="editor-row"><label>{c.key}<input required maxLength={40} pattern="[a-z][a-z0-9-]{0,39}" value={form.key} disabled={busy||!!form.updated_at} onChange={e=>setForm({...form,key:e.target.value})}/></label><label>{c.order}<input type="number" required min={0} max={9999} value={form.position} disabled={busy} onChange={e=>setForm({...form,position:Number(e.target.value)})}/></label></div><fieldset disabled={busy}><legend>{c.names}</legend><div className="category-names">{locales.map(l=><label key={l}>{languageNames[l]}<input required maxLength={40} value={form.labels[l]} onChange={e=>setForm({...form,labels:{...form.labels,[l]:e.target.value}})}/></label>)}</div></fieldset><label className="checkbox-label"><input type="checkbox" checked={form.enabled} disabled={busy} onChange={e=>setForm({...form,enabled:e.target.checked})}/>{c.enabled}</label>{error&&<p role="alert" className="inline-error">{error}</p>}<div className="composer-actions"><button className="button primary" disabled={busy||!online||form.key==='all'}>{busy?t.loading:t.save}</button><button type="button" className="button" disabled={busy} onClick={()=>setForm(null)}>{t.cancel}</button>{!!form.updated_at&&<button type="button" className="text-link danger" disabled={busy||!online||usage[form.key]!==0} onClick={()=>void act(true)}>{t.delete}</button>}</div></form>}
 </section>;
}
