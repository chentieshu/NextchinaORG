'use client';
import {Suspense,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {FiArrowLeft,FiChevronDown,FiEye,FiEdit3} from 'react-icons/fi';
import {useApp} from '@/components/Provider';
import {AccountGate} from '@/components/AccountGate';
import {UserIdentity} from '@/components/Avatar';
import {RichEditor} from '@/components/RichEditor';
import {ThreadComposer} from '@/components/ThreadComposer';
import {threadCopy} from '@/lib/thread-copy';
import {postParts,withPostParts,threadWritingData,partHasContent,partPayload} from '@/lib/post-thread';
import {composerCopy} from '@/lib/composer-copy';
import {RichText} from '@/components/RichText';
import {QuoteCard} from '@/components/SocialActions';
import {chinaCopy} from '@/lib/chinateam-copy';
import {forumCopy} from '@/lib/forum-copy';
import {socialCopy} from '@/lib/social-copy';
import {experienceCopy} from '@/lib/experience-copy';
import {adminCopy} from '@/lib/admin-copy';
import {locales,languageNames,type Locale} from '@/lib/i18n';
import {normalizeDocument,documentText,hasDocumentContent} from '@/lib/rich-content';
import {readDraft,writingData,type WritingData,type LocalDraft} from '@/lib/drafts';
import {safeSource} from '@/lib/content';
import {contentHref} from '@/lib/content-href';
import type {Article,Translation} from '@/lib/types';
type Draft={payload:WritingData;updated_at:string;base_updated_at:string};
export function Writer(){return <Suspense><WriterRoute/></Suspense>;}
function WriterRoute(){const{user,authStatus}=useApp(),params=useSearchParams();if(authStatus!=='ready')return <AccountGate/>;return <WritingRoom key={`${user?.id}:${params.get('id')}:${params.get('kind')}:${params.get('quote')}:${params.get('append')}`} appendId={params.get('append')} id={params.get('id')} kind={params.get('kind')==='news'?'news':'post'} quoteId={params.get('quote')}/>;}
function WritingRoom({id,kind:requestedKind,quoteId,appendId}:{id:string|null;kind:'news'|'post';quoteId:string|null;appendId:string|null}){
 const{db,user,profile,locale,t,demo,online,settings,setAuthOpen,refresh,activeCategories,categories,categoryName,loading:categoriesLoading,loadError:categoriesError}=useApp(),router=useRouter(),c=forumCopy[locale],x=experienceCopy[locale],s=socialCopy[locale],ct=chinaCopy[locale],tc=threadCopy[locale];
 const[appendTarget,setAppendTarget]=useState<Article|null>(null);
 const[article,setArticle]=useState<Article|null>(null),[form,setForm]=useState<WritingData>({...writingData(null,locale),quotedArticle:quoteId}),[language,setLanguage]=useState<Locale>(locale),[quote,setQuote]=useState<Article|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false),[baseline,setBaseline]=useState(''),[localState,setLocalState]=useState<'none'|'saved'|'error'>('none'),[saved,setSaved]=useState(false),[cloud,setCloud]=useState<Draft|null>(null),[pendingDraft,setPendingDraft]=useState<LocalDraft|null>(null);
 const parts=postParts(form),threadMode=!!appendId||!!article?.thread_id&&article.status==='draft'||parts.length>1;
 const kind=article?.content_type??requestedKind,admin=!!profile&&!profile.disabled&&profile.role!=='member',closed=kind==='post'&&!settings.ugc_enabled&&!admin;
 const allowed=(!appendId||!!appendTarget&&appendTarget.author_id===user?.id&&appendTarget.content_type==='post'&&appendTarget.status==='published'&&!appendTarget.locked&&!appendTarget.moderated)&&!!user&&!!profile&&!profile.disabled&&!closed&&(kind==='post'||admin)&&(!article||admin||article.author_id===user.id&&!article.locked&&!article.moderated);
 const key=`nextchina-draft:${user?.id??'demo'}:${id??requestedKind}${!id&&quoteId?':quote:'+quoteId:''}${appendId?':append:'+appendId:''}`,serialized=JSON.stringify(form),dirty=loaded&&serialized!==baseline;
 const committed=useRef(false),dirtyRef=useRef(dirty),latest=useRef(form),articleRef=useRef(article),pending=useRef(false),mounted=useRef(true),title=useRef<HTMLTextAreaElement>(null);dirtyRef.current=dirty&&!committed.current;latest.current=form;articleRef.current=article;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!user){setLoaded(true);return;}if(!db)return;let active=true;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);setLoaded(false);setFailed(false);
  void(async()=>{try{let remote:Article|null=null,draft:Draft|null=null,threadRows:Article[]=[],appendAnchor:Article|null=null;if(appendId){const result=await db.from('omni_articles').select('*').eq('id',appendId).abortSignal(abort.signal).maybeSingle();if(result.error||!result.data)throw Error('missing');appendAnchor=result.data;if(active)setAppendTarget(result.data);}if(id){const[result,stored]=await Promise.all([db.from('omni_articles').select('*').eq('id',id).abortSignal(abort.signal).maybeSingle(),db.from('omni_content_drafts').select('payload,updated_at,base_updated_at').eq('article_id',id).eq('user_id',user.id).abortSignal(abort.signal).maybeSingle()]);if(result.error||stored.error)throw result.error??stored.error;remote=result.data;draft=stored.data;if(!remote)throw Error('missing');if(remote.thread_id&&remote.status==='draft'){const thread=await db.rpc('omni_post_thread',{target_article:remote.id}).abortSignal(abort.signal);if(thread.error||!thread.data?.length)throw Error('missing');threadRows=thread.data as Article[];remote=threadRows[0];}}if(!active)return;setArticle(remote);setCloud(draft);let original={...writingData(remote,locale),...(!remote?{quotedArticle:quoteId}:{}),...(appendAnchor?{original:appendAnchor.original_locale,category:appendAnchor.category}:{})};if(remote?.content_type==='post'&&remote.status==='draft')original=threadWritingData(original,threadRows.length?threadRows:[remote]);let local:LocalDraft|null=null;try{local=readDraft(localStorage.getItem(key));}catch{}
   const savedDraft=draft?readDraft(JSON.stringify({...draft.payload,time:Date.parse(draft.updated_at),baseUpdatedAt:draft.base_updated_at})):null;
   if(savedDraft&&(!local||savedDraft.time>local.time))local=savedDraft;
   const newer=local&&(local===savedDraft||!remote||local.time>Date.parse(remote.updated_at??remote.created_at)),conflict=!!(newer&&remote&&local?.baseUpdatedAt&&local.baseUpdatedAt!==remote.updated_at);
   const chosen=newer&&!conflict&&local?draftForm(local):original;setForm(chosen);setLanguage(chosen.original);setBaseline(JSON.stringify(draft&&!conflict?savedDraft?draftForm(savedDraft):original:original));setLocalState(newer&&!conflict?'saved':'none');setPendingDraft(conflict?local:null);setLoaded(true);
  }catch{if(active){setFailed(true);setLoaded(true);}}finally{clearTimeout(timer);}})();return()=>{active=false;clearTimeout(timer);abort.abort();};
 },[db,id,user?.id,key,locale,quoteId,appendId,attempt]);
 useEffect(()=>{if(!db||!form.quotedArticle){setQuote(null);return;}const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),12000);let active=true;setQuote(null);db.from('omni_articles').select('*').eq('id',form.quotedArticle).eq('status','published').abortSignal(abort.signal).maybeSingle().then(async({data,error})=>{if(error||!data)return;const who=await db.rpc('omni_public_profiles',{profile_ids:[data.author_id]}).abortSignal(abort.signal);if(active)setQuote({...data,author_name:who.data?.[0]?.display_name,author_handle:who.data?.[0]?.handle,author_avatar_key:who.data?.[0]?.avatar_key});});return()=>{active=false;clearTimeout(timer);abort.abort();};},[db,form.quotedArticle]);
 function draftForm(d:WritingData):WritingData{const {translations,original,category,source,cover,quotedArticle,firstPartKey,firstPartId,firstPartUpdatedAt,threadParts,threadSnapshot}=d;return {translations,original,category,source,cover,quotedArticle:quotedArticle??null,firstPartKey,firstPartId,firstPartUpdatedAt,threadParts,threadSnapshot};}
 function persist(){if(committed.current||!dirtyRef.current||!allowed)return true;try{localStorage.setItem(key,JSON.stringify({...latest.current,version:4,baseUpdatedAt:articleRef.current?.updated_at,time:Date.now()}));return true;}catch{return false;}}
 useEffect(()=>{if(!dirty||!allowed)return;setSaved(false);setLocalState('none');const timer=setTimeout(()=>setLocalState(persist()?'saved':'error'),650);return()=>clearTimeout(timer);},[serialized,dirty,allowed,key]);
 useEffect(()=>{function leave(e:BeforeUnloadEvent){if(!dirtyRef.current&&!uploading)return;persist();e.preventDefault();e.returnValue='';}function hide(){persist();}function link(e:MouseEvent){if((!dirtyRef.current&&!uploading)||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey)return;const a=(e.target as Element).closest?.('a[href]');if(!a||a.getAttribute('target')==='_blank'||a.getAttribute('href')?.startsWith('#'))return;persist();if(!confirm(x.leave)){e.preventDefault();e.stopPropagation();}}
  window.addEventListener('beforeunload',leave);window.addEventListener('pagehide',hide);document.addEventListener('click',link,true);return()=>{persist();window.removeEventListener('beforeunload',leave);window.removeEventListener('pagehide',hide);document.removeEventListener('click',link,true);};
 },[key,allowed,uploading,x.leave]);
 useEffect(()=>{if(loaded&&!article&&!categoriesLoading&&!categoriesError&&activeCategories.length&&!categories.some(c=>c.key===form.category))setForm(old=>({...old,category:activeCategories[0].key}));},[loaded,article,categoriesLoading,categoriesError,categories,form.category]);
 const current:Translation=form.translations[kind==='post'?form.original:language]??{title:'',summary:'',body:''},categoryValid=!categoriesLoading&&!categoriesError&&(article?.category===form.category||activeCategories.some(c=>c.key===form.category));
 useEffect(()=>{if(title.current){title.current.style.height='auto';title.current.style.height=title.current.scrollHeight+'px';}},[current.title,loaded,language,preview]);
 function update(values:Partial<Translation>){setForm(old=>({...old,translations:{...old.translations,[kind==='post'?old.original:language]:{title:'',summary:'',body:'',...old.translations[kind==='post'?old.original:language],...values}}}));}
 async function saveThread(status:'draft'|'published'){
  if(!db||!user||pending.current)return;
  if(appendId&&status==='draft'){const ok=persist();setLocalState(ok?'saved':'error');setError(ok?tc.local:x.localError);return;}
  if(parts.some(part=>!partHasContent(part))){setError(tc.empty);return;}
  const payload=parts.map(part=>partPayload(part,form));if(new TextEncoder().encode(JSON.stringify(payload)).length>950000){setError(x.tooLong);return;}
  const expected=form.threadSnapshot??(article?[{id:article.id,updated_at:article.updated_at}]:[]);
  if(article&&!form.firstPartId)payload[0].id=article.id;
  const args={parts:payload,new_status:status,expected_parts:expected,append_to:appendId};
  pending.current=true;setBusy(true);persist();try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(args))),signature=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
   let request:{signature:string;id:string}|null=null;try{request=JSON.parse(localStorage.getItem(key+':request')??'null');}catch{}
   if(request?.signature!==signature){request={signature,id:crypto.randomUUID()};localStorage.setItem(key+':request',JSON.stringify(request));}
   const result=await db.rpc('omni_write_post_thread',{...args,request_id:request!.id});if(result.error)throw result.error;
   if(!mounted.current)return;const rows=result.data as Article[];if(!rows.length)throw Error('missing');
   committed.current=status==='published'||id!==rows[0].id;const stored=rows[0],next=threadWritingData(writingData(stored,locale),rows);dirtyRef.current=false;setSaved(true);setArticle(stored);setForm(next);setBaseline(JSON.stringify(next));setCloud(null);
   try{localStorage.removeItem(key);localStorage.removeItem(key+':request');}catch{}void refresh();
   if(status==='published')router.push(contentHref(stored,locale));else if(id!==stored.id)router.replace('/'+locale+'/write/?id='+stored.id);
  }catch(e){if(mounted.current){const err=e as {code?:string;message?:string};setError(err.code==='PT409'?x.conflict:err.code==='PT403'?tc.unavailable:err.message?.includes('30 seconds')?c.postRate:err.message?.includes('limit')?tc.tooMany:t.error);}}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 async function save(status:'draft'|'published'){
  if(!db||!user||!allowed||pending.current||uploading||!online)return;setError('');if(!categoryValid){setError(adminCopy[locale].unavailable);return;}
  if(kind==='post'&&threadMode){await saveThread(status);return;}
  const translations=Object.fromEntries(Object.entries(form.translations).filter(([l,v])=>(kind==='news'||l===form.original)&&v&&([v.title,v.summary,v.body].some(v=>v.trim())||hasDocumentContent(normalizeDocument(v.document,v.body))||kind==='post'&&!!form.quotedArticle)).map(([l,v])=>{const document=normalizeDocument(v!.document,v!.body),body=documentText(document);return[l,{title:kind==='post'?'':v!.title.trim(),summary:kind==='post'?body.slice(0,180):v!.summary.trim()||body.slice(0,180),body,document}];})) as Article['translations'];
  if(kind==='post'&&form.quotedArticle&&!translations[form.original])translations[form.original]={title:'',summary:'',body:'',document:normalizeDocument(null)};
  const cloudOnly=status==='draft'&&article?.status==='published',publishLocale=kind==='news'?language:form.original,target=translations[publishLocale];
  if(!cloudOnly&&(!target||(kind==='news'?!(target.title&&target.body):!hasDocumentContent(target.document!)&&!form.quotedArticle))){setError(kind==='post'?ct.emptyPost:c.invalid);return;}
  if(Object.values(translations).some(v=>v&&(v.title.length>200||v.summary.length>500||v.body.length>100000))||new TextEncoder().encode(JSON.stringify(form)).length>950000){setError(x.tooLong);return;}if(form.source&&!safeSource(form.source)){setError(x.invalidUrl);return;}
  pending.current=true;setBusy(true);persist();try{
   if(cloudOnly){const{data,error}=await db.rpc('omni_save_content_draft',{target_article:article!.id,new_payload:form,expected_article_at:article!.updated_at,expected_draft_at:cloud?.updated_at??null});if(error)throw error;if(!mounted.current)return;setCloud(data);setBaseline(JSON.stringify(form));setSaved(true);dirtyRef.current=false;try{localStorage.removeItem(key);}catch{}return;}
   const publishedTranslations=article?.status==='published'?article.translations:{};
   const selected=kind==='news'&&status==='published'?{...publishedTranslations,[publishLocale]:target}:translations;
   const original=kind==='news'&&status==='published'?(article?.status==='published'?article.original_locale:publishLocale):form.original;
   const payload={translations:selected,original_locale:original,category:form.category,source_url:form.source||null,cover_style:form.cover,content_type:kind,quoted_article_id:form.quotedArticle??null};
   const remaining=kind==='news'&&status==='published'&&Object.keys(form.translations).some(l=>l!==publishLocale&&JSON.stringify(form.translations[l as Locale])!==JSON.stringify(publishedTranslations[l as Locale]))?form:null;
   const result=status==='published'?await db.rpc('omni_publish_content',{target_article:article?.id??null,new_payload:payload,expected_article_at:article?.updated_at??null,expected_draft_at:cloud?.updated_at??null,remaining_payload:remaining}):article?await db.from('omni_articles').update({...payload,status}).eq('id',article.id).eq('updated_at',article.updated_at).select('*').single():await db.from('omni_articles').insert({...payload,status,author_id:user.id}).select('*').single();
   if(result.error)throw result.error;if(!mounted.current)return;const stored=result.data as Article;committed.current=status==='published'||!id;dirtyRef.current=false;setSaved(true);setArticle(stored);const next=stored.content_type==='post'&&stored.status==='draft'?threadWritingData(writingData(stored,locale),[stored]):writingData(stored,locale);setForm(next);setBaseline(JSON.stringify(next));try{localStorage.removeItem(key);}catch{}void refresh();
   if(status==='published')router.push(contentHref(stored,locale));else if(!id)router.replace(`/${locale}/write/?id=${stored.id}`);
  }catch(e){if(mounted.current){const err=e as {code?:string;message?:string};setError(err.code==='PT409'||err.code==='PGRST116'?x.conflict:err.code==='PT404'?ct.unavailable:err.message?.includes('30 seconds')?c.postRate:t.error);}}finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 async function discard(){if(!db||!article||!cloud||pending.current||!confirm(ct.discardConfirm))return;pending.current=true;setBusy(true);try{const{error}=await db.rpc('omni_discard_content_draft',{target_article:article.id,expected_draft_at:cloud.updated_at});if(error)throw error;try{localStorage.removeItem(key);}catch{}dirtyRef.current=false;setCloud(null);setAttempt(n=>n+1);}catch{setError(x.conflict);}finally{pending.current=false;setBusy(false);}}
 if(!user)return <main id="main" className="empty-state protected"><h1>{c.write}</h1><button className="button primary" onClick={()=>setAuthOpen(true)}>{t.login}</button></main>;
 if(!loaded)return <main id="main" className="empty-state" role="status">{t.loading}</main>;
 if(failed)return <main id="main" className="empty-state"><p role="alert">{x.connection}</p><button className="button" onClick={()=>setAttempt(n=>n+1)}>{t.retry}</button></main>;
 if(!allowed)return <main id="main" className="empty-state"><h1>{appendId?tc.unavailable:profile?.disabled?t.disabled:article?.moderated?c.moderated:article?.locked?c.locked:closed?c.closed:c.notAllowed}</h1><Link href={`/${locale}/`}>{c.back}</Link></main>;
 const disabled=busy||uploading||demo||!online||!categoryValid;
 const hasContent=kind==='post'?parts.every(partHasContent):hasDocumentContent(normalizeDocument(current.document,current.body));
 function keyboardPost(e:React.KeyboardEvent){if(kind==='post'&&(e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.nativeEvent.isComposing&&!disabled&&hasContent){e.preventDefault();void save('published');}}

 return <main id="main" onKeyDown={keyboardPost} className={`writing-room ${kind==='post'?'post-writing':''}`}><div className="writer-topbar"><Link href={`/${locale}/${kind==='news'?'admin/':''}`} className="writer-back" aria-label={kind==='news'?c.news:c.forum}><FiArrowLeft/>{kind==='news'?c.news:c.forum}</Link><span className="draft-status" role="status">{busy?x.pending:saved&&!dirty?cloud?ct.cloudDraft:x.saved:localState==='error'?x.localError:dirty?localState==='saved'?x.local:x.unsaved:article?x.saved:t.draft}</span><div className="writer-actions"><button className="text-link writer-preview-toggle" aria-label={preview?c.continue:c.preview} title={preview?c.continue:c.preview} disabled={busy||uploading} onClick={()=>setPreview(!preview)}>{preview?<FiEdit3/>:<FiEye/>}<span>{preview?c.continue:c.preview}</span></button><button className="button" aria-label={c.saveDraft} disabled={disabled} onClick={()=>void save('draft')}><span className="writer-draft-full">{c.saveDraft}</span><span className="writer-draft-short" aria-hidden="true">{t.draft}</span></button><button className="button primary" disabled={disabled||kind==='post'&&!hasContent} onClick={()=>void save('published')}>{busy?c.saving:kind==='news'?ct.publishLanguage:article?.status==='published'?ct.publishChanges:parts.length>1?tc.publish:c.publish}</button></div></div><div className="writer-paper">
  {appendId&&appendTarget&&<div className="thread-continuing"><span>{tc.continuing}</span><Link href={contentHref(appendTarget,locale)}>{tc.view}</Link></div>}
  {pendingDraft&&<div className="draft-recovery"><p>{x.localDraft} {x.conflict}</p><button className="button small" onClick={()=>{setForm(old=>{const restored=draftForm(pendingDraft);if(article?.status!=='draft'||!old.threadSnapshot)return restored;const snapshot=old.threadSnapshot;return {...withPostParts(restored,postParts(restored).map(p=>{const remote=snapshot.find(s=>s.id===p.id);return {...p,id:remote?.id,updated_at:remote?.updated_at};})),threadSnapshot:snapshot};});setPendingDraft(null);}}>{x.restore}</button><button className="text-link" onClick={()=>{try{localStorage.removeItem(key);}catch{}setPendingDraft(null);}}>{x.discard}</button></div>}
  {kind==='post'&&<div className="composer-author"><UserIdentity id={user.id} name={profile?.display_name} avatarKey={profile?.avatar_key} handle={profile?.handle} size={40}/><small>{ct.public}</small></div>}
  {article?.status==='published'&&<p className="form-note live-draft-note">{ct.liveDraft}{cloud&&<button className="text-link" disabled={busy} onClick={()=>void discard()}>{ct.discardDraft}</button>}</p>}
  {kind==='news'&&<div className="writer-languages"><label>{x.translations}<select value={language} disabled={busy} onChange={e=>setLanguage(e.target.value as Locale)}>{locales.map(l=><option key={l} value={l}>{languageNames[l]}{form.translations[l]?.body?' ✓':''}</option>)}</select></label><span>{ct.publishLanguageNote}</span></div>}
  {kind==='post'?<ThreadComposer quote={form.quotedArticle?<QuoteCard article={quote} onRemove={!id?()=>setForm(old=>({...old,quotedArticle:null})):undefined}/>:undefined} parts={parts} disabled={busy} preview={preview} canAdd={!article||article.status==='draft'} onBusyChange={setUploading}
   onUpdate={(id,text)=>setForm(old=>withPostParts(old,postParts(old).map(part=>part.key===id?{...part,text}:part)))}
   onOrder={keys=>setForm(old=>{const all=postParts(old);return withPostParts(old,keys.map(key=>all.find(p=>p.key===key)!));})}
   onAdd={()=>setForm(old=>withPostParts(old,[...postParts(old),{key:crypto.randomUUID(),text:{title:'',summary:'',body:''}}]))}/>
   :preview?<article className="writing-preview"><h1>{current.title||c.emptyTitle}</h1><p className="writing-summary">{current.summary}</p><RichText text={current}/></article>:<><textarea ref={title} className="writing-title" aria-label={t.title} placeholder={c.title} maxLength={200} rows={1} value={current.title} disabled={busy} onChange={e=>update({title:e.target.value.replace(/\n/g,'')})}/><textarea className="writing-summary" aria-label={t.summary} placeholder={c.subtitle} maxLength={500} rows={2} value={current.summary} disabled={busy} onChange={e=>update({summary:e.target.value})}/><RichEditor key={language} document={normalizeDocument(current.document,current.body)} locale={locale} disabled={busy} maxImages={20} onBusyChange={setUploading} onChange={(document,body)=>update({document,body})}/></>}

  <div className="writer-count">{kind==='post'&&<span className="post-shortcut">{composerCopy[locale].shortcut}</span>}<span>{parts.length>1&&kind==='post'?tc.thread+' · '+parts.length:current.body.length.toLocaleString(locale)+' / 100,000'}</span></div>
  <details className="writer-settings"><summary>{kind==='post'?composerCopy[locale].options:x.settings}<FiChevronDown/></summary><label>{t.category}<select disabled={busy} value={form.category} onChange={e=>setForm(old=>({...old,category:e.target.value}))}>{!activeCategories.some(c=>c.key===form.category)&&<option value={form.category}>{categoryName(form.category)}</option>}{activeCategories.map(row=><option key={row.key} value={row.key}>{categoryName(row.key)}</option>)}</select></label>{kind==='news'&&<label>{t.sourceUrl}<input type="url" disabled={busy} value={form.source} onChange={e=>setForm(old=>({...old,source:e.target.value}))} placeholder="https://"/></label>}</details>
  {!categoryValid&&!categoriesLoading&&<p className="form-note" role="alert">{categoriesError?x.connection:adminCopy[locale].unavailable}<button className="text-link" onClick={()=>void refresh()}>{t.retry}</button></p>}{!online&&<p className="form-note">{x.offline}</p>}{error&&<p className="form-note" role="alert">{error}{error===x.conflict&&<button onClick={()=>{persist();setAttempt(n=>n+1);}}>{x.reload}</button>}</p>}
 </div></main>;
}
