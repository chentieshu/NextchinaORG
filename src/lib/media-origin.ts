export const MEDIA_ORIGIN='https://nextchina-media.chentieshu520.workers.dev';
export const mediaKeyPattern=/^(avatars|content)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|png|jpg)$/;
const origins=new Set([MEDIA_ORIGIN,'https://media.teamcn.org','https://media.chinateam.org','https://media.nextchina.org']);
// Persisted posts and drafts can contain previous origins. Keep the object key,
// but always read owned assets from the current service without rewriting posts.
export function storedImageKey(value:string){try{const u=new URL(value);return origins.has(u.origin)&&!u.username&&!u.password&&!u.search&&!u.hash&&mediaKeyPattern.test(u.pathname.slice(1))?u.pathname.slice(1):null;}catch{return null;}}
export function resolveMediaUrl(value:string){const key=storedImageKey(value);return key?`${MEDIA_ORIGIN}/${key}`:value;}
