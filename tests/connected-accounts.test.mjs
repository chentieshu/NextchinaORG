import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('OAuth badges resist metadata spoofing, revoke on unlink and quote published articles only',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const a='91000000-0000-4000-8000-000000000001',b='91000000-0000-4000-8000-000000000002';
  await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${a}','{"provider":"github","user_name":"forged","followers_count":999999}'),('${b}','{}');update omni_profiles set profile_completed_at=now();update omni_profiles set role='super_admin' where id='${b}';insert into auth.identities(user_id,provider,provider_id,identity_data) values('${a}','github','123','{"user_name":"actual-user","email":"secret@example.test"}'),('${a}','x','456','{"user_name":"actual_x"}');`);
  async function as(id,sql){await db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id??''}',false)`);return db.query(sql);}
  const connections=()=>as(null,`select omni_public_connections(array['${a}'::uuid]) p`);
  let rows=await connections();assert.equal(rows.rows[0].p.accounts.length,2);assert.equal(rows.rows[0].p.accounts[0].handle,'actual-user');assert.ok(!JSON.stringify(rows).includes('secret@'));assert.ok(!JSON.stringify(rows).includes('999999'));
  await assert.rejects(as(a,`update auth.identities set identity_data='{}'`),/permission denied/);
  await assert.rejects(as(a,`select omni_claim_x_metric_sync('999')`),/Forbidden/);
  assert.equal((await as(a,`select omni_claim_x_metric_sync('456') allowed`)).rows[0].allowed,true);
  assert.equal((await as(a,`select omni_claim_x_metric_sync('456') allowed`)).rows[0].allowed,false);
  await assert.rejects(as(null,`select omni_claim_x_metric_sync('456')`),/permission denied/);
  await db.exec(`reset role;delete from auth.identities where provider='github';`);assert.equal((await connections()).rows[0].p.accounts.length,1);
  await db.exec(`reset role;update omni_profiles set disabled=true where id='${a}';`);assert.equal((await connections()).rows.length,0);
  await db.exec(`reset role;update omni_profiles set disabled=false where id='${a}';`);
  const news=(await as(b,`insert into omni_articles(category,content_type,author_id,original_locale,translations,status) values('ai','news','${b}','en','{"en":{"title":"Published news","summary":"Summary","body":"Article body"},"ja":{"title":"ニュース","summary":"概要","body":"記事"}}','published') returning id`)).rows[0];
  const quote=(await as(a,`insert into omni_articles(category,content_type,author_id,original_locale,translations,status,quoted_article_id) values('ai','post','${a}','en','{"en":{"title":"","summary":"","body":""}}','published','${news.id}') returning id`)).rows[0];
  const summary=(await as(null,`select omni_social_context(array['${quote.id}'::uuid]) p`)).rows[0].p.quoted_article;assert.equal(summary.content_type,'news');assert.equal(summary.translations.en.title,'Published news');assert.equal(summary.translations.ja.title,'ニュース');assert.equal(summary.translations.en.body,'');
  await as(b,`update omni_articles set status='archived' where id='${news.id}'`);assert.equal((await as(null,`select omni_social_context(array['${quote.id}'::uuid]) p`)).rows[0].p.quoted_article,null);
  await assert.rejects(as(a,`insert into omni_articles(category,content_type,author_id,original_locale,translations,status,quoted_article_id) values('ai','post','${a}','en','{"en":{"title":"","summary":"","body":""}}','published','${news.id}')`),/Original content unavailable/);
 }finally{await db.close();}
});
