import {SITE_ORIGIN} from '../../lib/site.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PredictionReference={kind:'market'|'order';id:string};
export function predictionReference(value:unknown):PredictionReference|null{
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||![new URL(SITE_ORIGIN).hostname,'teamcn.org','www.teamcn.org','chinateam.org','www.chinateam.org','nextchina.org','www.nextchina.org'].includes(u.hostname))return null;
 if(!/^\/(zh-CN|en|ja|es|zh-TW)\/predictions\/?$/.test(u.pathname))return null;
 const order=u.searchParams.get('share'),market=u.searchParams.get('id');
 return order&&uuid.test(order)?{kind:'order',id:order}:market&&uuid.test(market)?{kind:'market',id:market}:null;
 }catch{return null;}
}
export const predictionUrl=(locale:string,ref:PredictionReference)=>`${SITE_ORIGIN}/${locale}/predictions/?${ref.kind==='market'?'id':'share'}=${ref.id}`;
