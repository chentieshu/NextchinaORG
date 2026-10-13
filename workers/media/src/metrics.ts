type Inventory={version:1;started_at:string;sampled_at:string;complete:boolean;objects:number;bytes:number;avatars:number;content:number};
const cacheKey='ops/admin-media-inventory.json';
export async function mediaInventory(bucket:R2Bucket):Promise<Inventory>{
 const cached=await bucket.get(cacheKey);
 if(cached){const data=await cached.json<Inventory>();if(data.version===1&&Date.now()-Date.parse(data.sampled_at)<300000)return data;}
 const result:Inventory={version:1,started_at:new Date().toISOString(),sampled_at:'',complete:true,objects:0,bytes:0,avatars:0,content:0};
 // Only uploaded media is counted; the internal monitoring cache is excluded.
 // Bound the scan. A partial inventory must never be presented as a bucket total.
 let pages=0;const deadline=Date.now()+10000;
 for(const prefix of ['avatars/','content/']){let cursor:string|undefined;
  do{if(pages>=20||Date.now()>deadline){result.complete=false;break;}
   const batch=await bucket.list({prefix,limit:1000,cursor});pages++;
   for(const object of batch.objects){result.objects++;result.bytes+=object.size;if(prefix==='avatars/')result.avatars++;else result.content++;}
   cursor=batch.truncated?batch.cursor:undefined;
  }while(cursor);
 }
 result.sampled_at=new Date().toISOString();
 // An unavailable cache does not make a successful live listing fail.
 await bucket.put(cacheKey,JSON.stringify(result),{httpMetadata:{contentType:'application/json'}}).catch(()=>undefined);
 return result;
}
export async function measured<T>(operation:()=>Promise<T>){const start=Date.now();try{return {status:'ok' as const,data:await operation(),duration_ms:Date.now()-start};}catch{return {status:'error' as const};}}
