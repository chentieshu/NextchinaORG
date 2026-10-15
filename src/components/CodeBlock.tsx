'use client';
import {useApp} from './Provider';
import {FiCopy} from 'react-icons/fi';
import {IconButton} from './IconControl';
import {socialCopy} from '@/lib/social-copy';
export function CodeBlock({code,language}:{code:string;language?:string}){const{locale,t,notify}=useApp();return <div className="code-block"><div><span>{language||'Code'}</span><IconButton label={socialCopy[locale].copyCode} onClick={async()=>{try{await navigator.clipboard.writeText(code);notify(t.copied);}catch{notify(t.error);}}}><FiCopy/></IconButton></div><pre><code>{code}</code></pre></div>;}
