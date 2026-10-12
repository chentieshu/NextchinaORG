'use client';
import Link from 'next/link';
import {useState} from 'react';
import {FiEdit3,FiLock,FiTrash2,FiStar,FiEyeOff,FiUnlock} from 'react-icons/fi';
import {useApp} from './Provider';
import {forumCopy} from '@/lib/forum-copy';
import type {Article} from '@/lib/types';
export function ContentManagement({article,onChange}:{article:Article;onChange?:()=>void}){
 const{db,profile,user,locale,t,notify,refresh}=useApp(),c=forumCopy[locale];const[busy,setBusy]=useState(false);
 const admin=!!profile&&!profile.disabled&&profile.role!=='member',own=!!user&&user.id===article.author_id&&article.content_type==='post'&&!profile?.disabled;
 if(!admin&&!own)return null;
 async function change(values:Partial<Article>){if(!db||busy)return;if(values.moderated&&!confirm(c.confirmHide))return;setBusy(true);const{error}=await db.from('omni_articles').update(values).eq('id',article.id).select('id').single();setBusy(false);if(error){notify(t.error);return;}notify(t.saved);void refresh();if(onChange)onChange();else window.location.reload();}
 async function remove(){if(!db||busy||!confirm(c.confirmRemove))return;setBusy(true);const{error}=await db.from('omni_articles').delete().eq('id',article.id).select('id').single();setBusy(false);if(error){notify(t.error);return;}void refresh();if(onChange)onChange();else window.location.href=`/${locale}/${article.content_type==='post'?'':'news/'}`;}
 return <div className="content-management">{(admin||!article.locked&&!article.moderated)&&<Link className="button small" href={`/${locale}/write/?id=${article.id}`}><FiEdit3/>{t.edit}</Link>}{admin&&<><button className="button small" disabled={busy} onClick={()=>change({featured:!article.featured})}><FiStar/>{article.featured?c.unpin:c.pin}</button><button className="button small" disabled={busy} onClick={()=>change({locked:!article.locked})}>{article.locked?<FiUnlock/>:<FiLock/>}{article.locked?c.unlock:c.lock}</button><button className="button small" disabled={busy} onClick={()=>change(article.status==='published'?{status:'archived',moderated:true}:{status:'published',moderated:false})}><FiEyeOff/>{article.status==='published'?c.hide:c.restore}</button></>}<button className="button small danger" disabled={busy} onClick={remove}><FiTrash2/>{t.delete}</button></div>;
}
