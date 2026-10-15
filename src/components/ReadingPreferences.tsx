'use client';
import {useEffect,useRef,useState} from 'react';
import {useApp} from './Provider';
import {FiBookOpen} from 'react-icons/fi';
import {chinaCopy} from '@/lib/chinateam-copy';
import {socialCopy} from '@/lib/social-copy';
import {locales,languageNames,type Locale} from '@/lib/i18n';
export function ReadingPreferences(){
 const{db,user,profile,locale,t,online,applyProfile}=useApp(),c=chinaCopy[locale],s=socialCopy[locale];
 const[news,setNews]=useState<Locale|''>(profile?.news_locale??''),[embed,setEmbed]=useState(profile?.embed_mode??'click'),[reposts,setReposts]=useState(profile?.show_reposts??true),[base,setBase]=useState(profile),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),dirty=useRef(false),pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!dirty.current){setNews(profile?.news_locale??'');setEmbed(profile?.embed_mode??'click');setReposts(profile?.show_reposts??true);setBase(profile);}},[profile]);
 if(!user||!profile)return null;
 async function save(e:React.FormEvent){e.preventDefault();if(!db||!user||pending.current||!online)return;pending.current=true;setBusy(true);setError('');try{const{data,error}=await db.rpc('omni_save_reading_preferences',{new_news_locale:news||null,new_embed_mode:embed,new_show_reposts:reposts,expected_updated_at:base?.updated_at});if(error)throw error;if(!mounted.current)return;dirty.current=false;setBase(data);applyProfile(data,user.id);setSaved(true);}catch(e){if(mounted.current)setError((e as {code?:string}).code==='PT409'?s.profileConflict:s.error);}finally{pending.current=false;if(mounted.current)setBusy(false);}}
 return <section id="reading"><h2><FiBookOpen aria-hidden="true"/>{c.reading}</h2><p className="form-note">{c.readingNote}</p><form onSubmit={save} onChange={()=>{dirty.current=true;setSaved(false);}}><label>{c.newsLanguage}<select value={news} disabled={busy} onChange={e=>setNews(e.target.value as Locale|'')}><option value="">{c.allLanguages}</option>{locales.map(l=><option value={l} key={l}>{languageNames[l]}</option>)}</select></label><label>{c.embeds}<select value={embed} disabled={busy} onChange={e=>setEmbed(e.target.value as 'click'|'auto')}><option value="click">{c.clickToLoad}</option><option value="auto">{c.autoLoad}</option></select><small>{c.embedNote}</small></label><label className="check-label"><input type="checkbox" checked={reposts} disabled={busy} onChange={e=>setReposts(e.target.checked)}/>{c.repostsSetting}</label>{error&&<p className="inline-error" role="alert">{error}<button type="button" onClick={()=>location.reload()}>{s.reload}</button></p>}<button className="button" disabled={busy||!online}>{busy?t.loading:t.save}</button>{saved&&<p role="status">{t.saved}</p>}</form></section>;
}
