import {normalizeDocument} from './rich-content';
import type {RichNode} from './types';
export type PostImage={src:string;alt:string};
export const MAX_POST_IMAGES=4;
export function splitPostDocument(value:RichNode){
 const images:PostImage[]=[];
 function strip(node:RichNode):RichNode|null{
  if(node.type==='image'){images.push({src:String(node.attrs?.src??''),alt:String(node.attrs?.alt??'')});return null;}
  return {...node,...(node.content?{content:node.content.flatMap(child=>{const next=strip(child);return next?[next]:[];})}:{})};
 }
 const body=strip(normalizeDocument(value))!;
 return {body:normalizeDocument(body),images};
}
export function joinPostDocument(body:RichNode,images:PostImage[]):RichNode{
 return normalizeDocument({type:'doc',content:[...(splitPostDocument(body).body.content??[]),...images.map(image=>({type:'image',attrs:{src:image.src,alt:image.alt}}))]});
}
