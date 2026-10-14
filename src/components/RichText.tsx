import type {ReactNode} from 'react';
import type {RichNode,Translation} from '@/lib/types';
import {normalizeDocument,safeContentUrl} from '@/lib/rich-content';
import {ExternalContent} from './ExternalContent';
import {CodeBlock} from './CodeBlock';
import {PostGallery} from './PostGallery';
import {splitPostDocument} from '@/lib/post-document';
export {safeContentUrl,plainDocument} from '@/lib/rich-content';
function renderNode(node:RichNode,index:number,depth=0):ReactNode{
 if(!node||typeof node!=='object'||depth>20)return null;
 const children=Array.isArray(node.content)?node.content.slice(0,2000).map((n,i)=>renderNode(n,i,depth+1)):null;
 if(node.type==='text'){
  let text:ReactNode=typeof node.text==='string'?node.text:'';
  for(const mark of (Array.isArray(node.marks)?node.marks:[]).slice(0,8)){
   if(!mark||typeof mark!=='object')continue;
   if(mark.type==='bold')text=<strong>{text}</strong>;
   else if(mark.type==='italic')text=<em>{text}</em>;
   else if(mark.type==='strike')text=<s>{text}</s>;
   else if(mark.type==='underline')text=<u>{text}</u>;
   else if(mark.type==='code')text=<code>{text}</code>;
   else if(mark.type==='link'){const href=safeContentUrl(mark.attrs?.href);if(href)text=<a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{text}</a>;}
  }
  return <span key={index}>{text}</span>;
 }
 switch(node.type){
  case 'doc':return <div key={index}>{children}</div>;
  case 'paragraph':return <p key={index}>{children?.length?children:<br/>}</p>;
  case 'heading':return node.attrs?.level===3?<h3 key={index}>{children}</h3>:<h2 key={index}>{children}</h2>;
  case 'blockquote':return <blockquote key={index}>{children}</blockquote>;
  case 'bulletList':return <ul key={index}>{children}</ul>;
  case 'orderedList':return <ol key={index}>{children}</ol>;
  case 'listItem':return <li key={index}>{children}</li>;
  case 'codeBlock':return <CodeBlock key={index} code={(node.content??[]).map(n=>n.text??'').join('')} language={typeof node.attrs?.language==='string'?node.attrs.language:undefined}/>;
  case 'embed':return <ExternalContent key={index} url={String(node.attrs?.url??'')}/>;
  case 'hardBreak':return <br key={index}/>;
  case 'horizontalRule':return <hr key={index}/>;
  case 'image':{const src=safeContentUrl(node.attrs?.src);const alt=typeof node.attrs?.alt==='string'?node.attrs.alt:'';return src?<figure key={index}><img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer"/>{alt&&<figcaption>{alt}</figcaption>}</figure>:null;}
  default:return null;
 }
}
export function RichText({text,compact=false,gallery=false}:{text:Pick<Translation,'body'|'document'>;compact?:boolean;gallery?:boolean}){const doc=normalizeDocument(text.document,text.body,compact),parts=gallery?splitPostDocument(doc):null;return <div className={`rich-prose ${compact?'compact-prose':''}`}>{renderNode(parts?.body??doc,0)}{parts&&<PostGallery images={parts.images}/>}</div>;}
