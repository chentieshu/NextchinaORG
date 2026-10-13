'use client';
import {useApp} from './Provider';
import {socialCopy} from '@/lib/social-copy';
export function CodeBlock({code,language}:{code:string;language?:string}){const{locale,t,notify}=useApp();return <div className="code-block"><div><span>{language||'Code'}</span><button className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(code);notify(t.copied);}catch{notify(t.error);}}}>{socialCopy[locale].copyCode}</button></div><pre><code>{code}</code></pre></div>;}
