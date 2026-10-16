import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {MEDIA_ORIGIN,resolveMediaUrl,storedImageKey} from '../src/lib/media-origin.ts';
import {normalizeDocument} from '../src/lib/rich-content.ts';
import {contentMedia} from '../src/lib/external-content.ts';
import {predictionReference,predictionUrl} from '../src/modules/predictions/reference.ts';
const key='content/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.webp';
test('historical media and references resolve to the default origin without trusting lookalike hosts',()=>{
 for(const host of ['media.nextchina.org','media.chinateam.org','media.teamcn.org']){
  const src=`https://${host}/${key}`,doc={type:'doc',content:[{type:'image',attrs:{src}}]};
  assert.equal(resolveMediaUrl(src),`${MEDIA_ORIGIN}/${key}`);
  assert.equal(normalizeDocument(doc).content[0].attrs.src,`${MEDIA_ORIGIN}/${key}`);
  assert.equal(contentMedia(doc)[0].url,`${MEDIA_ORIGIN}/${key}`);
 }
 for(const url of [`https://media.teamcn.org.evil.test/${key}`,`https://user@media.teamcn.org/${key}`,`https://media.teamcn.org/${key}?next=x`])assert.equal(storedImageKey(url),null);
 const ref={kind:'market',id:'20000000-0000-4000-8000-000000000001'};
 assert.deepEqual(predictionReference(predictionUrl('en',ref)),ref);
 assert.deepEqual(predictionReference(`https://teamcn.org/en/predictions/?id=${ref.id}`),ref);
 assert.equal(predictionReference(`https://omniremix.pages.dev.evil.test/en/predictions/?id=${ref.id}`),null);
});
test('image-only posts accept current and historical origins while empty posts and excess photos remain rejected',async()=>{
 const db=new PGlite();try{
 await db.exec('create schema omni_private; create table public.image_test(translations jsonb,original_locale text,content_type text,has_quote boolean default false,status text,updated_at timestamptz,published_at timestamptz);');
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_default_cloudflare_media_origins.sql'));
 await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('create trigger validate before insert on public.image_test for each row execute function omni_private.omni_validate_article();');
 const insert=images=>db.query("insert into public.image_test(translations,original_locale,content_type,status) values($1,'en','post','published')",[JSON.stringify({en:{title:'',summary:'',body:'',document:{type:'doc',content:images.map(src=>({type:'image',attrs:{src}}))}}})]);
 for(const host of [MEDIA_ORIGIN,'https://media.teamcn.org','https://media.nextchina.org','https://media.chinateam.org'])await insert([`${host}/${key}`]);
 await assert.rejects(insert([]),/Post content required/);
 await assert.rejects(insert([`https://media.teamcn.org.evil.test/${key}`]),/Post content required/);
 await assert.rejects(insert(Array(5).fill(`${MEDIA_ORIGIN}/${key}`)),/Maximum four images/);
 }finally{await db.close();}
});
