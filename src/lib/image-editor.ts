export type CropArea={x:number;y:number;width:number;height:number};
export async function loadImage(url:string){const image=new Image();image.decoding='async';image.src=url;await image.decode();if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40000000)throw Error('invalid_image');return image;}
export function validateImageFile(file:File){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('invalid_image');if(file.size>10*1024*1024||file.size===0)throw Error('image_too_large');}
function blobFromCanvas(canvas:HTMLCanvasElement){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('invalid_image')),'image/webp',.88));}
export async function cropAvatar(url:string,area:CropArea,rotation:number){
 const image=await loadImage(url),r=rotation*Math.PI/180,w=image.naturalWidth,h=image.naturalHeight;
 const bw=Math.abs(Math.cos(r)*w)+Math.abs(Math.sin(r)*h),bh=Math.abs(Math.sin(r)*w)+Math.abs(Math.cos(r)*h);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');if(!ctx||area.width<=0||area.height<=0)throw Error('invalid_image');
 ctx.scale(512/area.width,512/area.height);ctx.translate(bw/2-area.x,bh/2-area.y);ctx.rotate(r);ctx.drawImage(image,-w/2,-h/2);return blobFromCanvas(canvas);
}
export async function prepareContentImage(file:File){validateImageFile(file);const url=URL.createObjectURL(file);try{const image=await loadImage(url),ratio=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw Error('invalid_image');ctx.drawImage(image,0,0,canvas.width,canvas.height);const blob=await blobFromCanvas(canvas);if(blob.size>4*1024*1024)throw Error('image_too_large');return blob;}finally{URL.revokeObjectURL(url);}}
export async function cropContentImage(url:string,area:CropArea,rotation:number){
 const image=await loadImage(url),r=rotation*Math.PI/180,w=image.naturalWidth,h=image.naturalHeight;
 if(!Number.isFinite(area.width)||!Number.isFinite(area.height)||area.width<=0||area.height<=0)throw Error('invalid_image');
 const bw=Math.abs(Math.cos(r)*w)+Math.abs(Math.sin(r)*h),bh=Math.abs(Math.sin(r)*w)+Math.abs(Math.cos(r)*h),ratio=Math.min(1,2048/Math.max(area.width,area.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(area.width*ratio));canvas.height=Math.max(1,Math.round(area.height*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw Error('invalid_image');
 ctx.scale(canvas.width/area.width,canvas.height/area.height);ctx.translate(bw/2-area.x,bh/2-area.y);ctx.rotate(r);ctx.drawImage(image,-w/2,-h/2);const blob=await blobFromCanvas(canvas);if(blob.size>4*1024*1024)throw Error('image_too_large');return blob;
}
