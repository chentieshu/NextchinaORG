import type {RichNode} from './types';
import {externalContent} from './external-content.ts';
export function safeContentUrl(value:unknown){if(typeof value!=='string')return null;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function plainDocument(text:string):RichNode{return {type:'doc',content:text.split(/\n\s*\n/).map(p=>({type:'paragraph',content:p?[{type:'text',text:p}]:[]}))};}
// Apply one allowlist before both editing and reading untrusted JSON.
export function normalizeDocument(value:unknown,fallback='',compact=false):RichNode{
 let remaining=4000;
 function visit(input:unknown,depth=0):RichNode|null{
  if(!input||typeof input!=='object'||depth>16||--remaining<0)return null;
  const n=input as RichNode,children=Array.isArray(n.content)?n.content.slice(0,Math.max(0,remaining)).flatMap(v=>{const child=visit(v,depth+1);return child?[child]:[];}):[];
  if(n.type==='text'){
   if(typeof n.text!=='string'||!n.text)return null;
   const marks=(Array.isArray(n.marks)?n.marks:[]).flatMap(m=>{if(!m||typeof m!=='object')return [];if(['bold','italic','strike','underline','code'].includes(m.type))return [{type:m.type}];const href=m.type==='link'?safeContentUrl(m.attrs?.href):null;return href?[{type:'link',attrs:{href}}]:[];}).slice(0,8);
   return {type:'text',text:n.text.slice(0,100000),...(marks.length?{marks}:{})};
  }
  if(n.type==='image'){const src=compact?null:safeContentUrl(n.attrs?.src);return src?{type:'image',attrs:{src,alt:typeof n.attrs?.alt==='string'?n.attrs.alt.slice(0,300):''}}:null;}
  if(n.type==='embed'){const data=compact?null:externalContent(n.attrs?.url);return data?{type:'embed',attrs:{url:data.url}}:null;}
  if(['doc','paragraph','blockquote','bulletList','orderedList','listItem','codeBlock','heading'].includes(n.type??''))return {type:compact&&n.type==='heading'?'paragraph':n.type,...(n.type==='codeBlock'?{attrs:{language:n.attrs?.language}}:{}),...(n.type==='heading'&&!compact?{attrs:{level:n.attrs?.level===3?3:2}}:{}),content:children};
  if(['hardBreak','horizontalRule'].includes(n.type??''))return {type:n.type};
  return null;
 }
 // Repair nesting as well as names: malformed stored JSON must not crash the editor schema.
 function inline(nodes:RichNode[]):RichNode[]{return nodes.flatMap(n=>n.type==='text'||n.type==='hardBreak'?[n]:inline(n.content??[]));}
 function blocks(nodes:RichNode[]):RichNode[]{return nodes.flatMap((n):RichNode[]=>{
  if(n.type==='text'||n.type==='hardBreak')return [{type:'paragraph',content:[n]}];
  if(n.type==='doc'||n.type==='listItem')return blocks(n.content??[]);
  if(n.type==='paragraph'||n.type==='heading')return [{...n,content:inline(n.content??[])}];
  if(n.type==='codeBlock')return [{type:'codeBlock',attrs:{language:typeof n.attrs?.language==='string'&&/^[a-z0-9+#.-]{1,24}$/i.test(n.attrs.language)?n.attrs.language:''},content:inline(n.content??[]).map(t=>({type:'text',text:t.type==='hardBreak'?'\n':t.text??''}))}];
  if(n.type==='blockquote'){const content=blocks(n.content??[]);return [{type:'blockquote',content:content.length?content:[{type:'paragraph',content:[]}]}];}
  if(n.type==='bulletList'||n.type==='orderedList'){const items=(n.content??[]).map(child=>{const content=blocks(child.type==='listItem'?child.content??[]:[child]);if(content[0]?.type!=='paragraph')content.unshift({type:'paragraph',content:[]});return {type:'listItem',content};});return items.length?[{type:n.type,content:items}]:[];}
  return [n];
 });}
 const doc=visit(value);if(doc?.type!=='doc')return plainDocument(fallback.slice(0,100000));const content=blocks(doc.content??[]);return {type:'doc',content:content.length?content:[{type:'paragraph',content:[]}]};
}
export function hasDocumentContent(doc:RichNode){if(documentText(doc).trim())return true;return JSON.stringify(normalizeDocument(doc)).includes('"type":"image"')||JSON.stringify(normalizeDocument(doc)).includes('"type":"embed"');}
export function documentText(doc:RichNode):string{
 function text(n:RichNode):string{if(n.type==='text')return n.text??'';if(n.type==='hardBreak')return '\n';const children=(n.content??[]).map(text);return children.join(['doc','bulletList','orderedList','blockquote','listItem'].includes(n.type??'')?'\n\n':'');}
 return text(normalizeDocument(doc)).trim();
}
