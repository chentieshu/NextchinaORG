export class MediaError extends Error {constructor(public status:number,public code:string){super(code);}}
export async function readBounded(stream:ReadableStream<Uint8Array>|null,max:number){
 if(!stream)throw new MediaError(400,'empty_image');
 const reader=stream.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new MediaError(413,'image_too_large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
// Accept raster formats only; derive the response MIME from bytes, never the filename.
export function imageType(bytes:Uint8Array){
 if(bytes.length<24)throw new MediaError(415,'invalid_image');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'&&view.getUint32(4,true)+8===bytes.length)return {mime:'image/webp',extension:'webp'};
 if(bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10&&ascii(12,16)==='IHDR'){
  const w=view.getUint32(16),h=view.getUint32(20);if(!w||!h||w*h>40000000)throw new MediaError(415,'invalid_image');return {mime:'image/png',extension:'png'};
 }
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return {mime:'image/jpeg',extension:'jpg'};
 throw new MediaError(415,'invalid_image');
}
export function providerImageUrl(value:unknown){
 if(typeof value!=='string')return null;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  if(!(/^lh[0-9]+\.googleusercontent\.com$/.test(url.hostname)||url.hostname==='avatars.githubusercontent.com'||url.hostname==='pbs.twimg.com'||url.hostname==='abs.twimg.com'))return null;
  return url.href;
 }catch{return null;}
}
