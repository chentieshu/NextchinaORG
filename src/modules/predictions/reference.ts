const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PredictionReference={kind:'market'|'order';id:string};
export function predictionReference(value:unknown):PredictionReference|null{
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!['teamcn.org','www.teamcn.org'].includes(u.hostname))return null;
 if(!/^\/(zh-CN|en|ja|es|zh-TW)\/predictions\/?$/.test(u.pathname))return null;
 const order=u.searchParams.get('share'),market=u.searchParams.get('id');
 return order&&uuid.test(order)?{kind:'order',id:order}:market&&uuid.test(market)?{kind:'market',id:market}:null;
 }catch{return null;}
}
export const predictionUrl=(locale:string,ref:PredictionReference)=>`https://teamcn.org/${locale}/predictions/?${ref.kind==='market'?'id':'share'}=${ref.id}`;
