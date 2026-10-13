import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('onboarding is enforced by the database; preferences serialize and public search cannot expose private content',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const a='80000000-0000-4000-8000-000000000001',b='80000000-0000-4000-8000-000000000002';await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${a}','{"profile_completed_at":"2020-01-01","role":"super_admin"}'),('${b}','{}')`);
  async function as(id,sql){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return db.query(sql);}
  const stamp=p=>new Date(p.updated_at).toISOString();const me=async id=>(await as(id,'select * from omni_profiles')).rows[0];
  let p=await me(a);assert.equal(p.profile_completed_at,null);assert.equal(p.role,'member');
  const insert=(status='published')=>`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"","summary":"","body":"findneedle original"}}','${a}','post','${status}') returning id`;
  await assert.rejects(as(a,insert()),/Complete your profile/);
  await assert.rejects(as(a,"update omni_profiles set profile_completed_at=now()"),/permission/);
  await assert.rejects(as(a,`select omni_complete_profile('Reader','bad handle','en','${stamp(p)}')`),/Invalid profile/);
  p=(await as(a,`select omni_complete_profile('Reader','FindNeedle','en','${stamp(p)}') p`)).rows[0].p;assert.equal(p.handle,'findneedle');assert.ok(p.profile_completed_at);
  const before=stamp(p);p=(await as(a,`select omni_save_preferences('ja','dark','${before}') p`)).rows[0].p;assert.equal(p.theme,'dark');assert.equal(p.ui_locale,'ja');
  await assert.rejects(as(a,`select omni_save_preferences('es','light','${before}')`),/Profile changed/);
  await assert.rejects(as(a,`select omni_save_preferences('fr','dark','${stamp(p)}')`),/Invalid preferences/);
  const post=(await as(a,insert())).rows[0].id;await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");const draft=(await db.query(insert('draft'))).rows[0].id;
  p=await me(b);await assert.rejects(as(b,`select omni_complete_profile('Other','FINDNEEDLE','en','${stamp(p)}')`),/unique/);
  for(const statement of [`insert into omni_likes(article_id,user_id) values('${post}','${b}')`,`insert into omni_bookmarks(article_id,user_id) values('${post}','${b}')`,`insert into omni_comments(article_id,user_id,body) values('${post}','${b}','findneedle reply')`,`insert into omni_follows(follower_id,following_id) values('${b}','${a}')`])await assert.rejects(as(b,statement),/Complete your profile/);
  await as(b,`select omni_complete_profile('Other','other_reader','en','${stamp(p)}')`);
  await as(b,`insert into omni_comments(article_id,user_id,body) values('${post}','${b}','findneedle reply')`);
  await assert.rejects(as(a,`update omni_articles set translations=translations||'{"ja":{"title":"","summary":"","body":"translated"}}'::jsonb where id='${post}'`),/one original body/);
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_profiles set role='editor' where id='${b}';`);
  const news=(await as(b,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"News","summary":"Summary","body":"News body"},"ja":{"title":"findneedle ニュース","summary":"翻訳","body":"翻訳された記事"}}','${b}','news','published') returning id`)).rows[0].id;
  await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
  const search=async(kind='all')=>(await db.query(`select omni_search('findneedle','${kind}') r`)).rows.map(v=>v.r);
  const rows=await search();assert.deepEqual(rows.map(r=>r.kind).sort(),['news','post','reply','user']);assert.ok(rows.some(r=>r.article?.id===post));assert.ok(rows.some(r=>r.article?.id===news));assert.ok(!rows.some(r=>r.article?.id===draft));
  const person=rows.find(r=>r.kind==='user').profile;assert.deepEqual(Object.keys(person).sort(),['avatar_key','bio','display_name','handle','id']);
  assert.equal((await search('news')).length,1);assert.equal((await db.query("select omni_search('%')")).rows.length,0);
  assert.equal((await db.query("select omni_search('')")).rows.length,0);
  await as(b,`update omni_articles set status='archived',moderated=true where id='${post}'`);
  await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");assert.deepEqual((await search()).map(r=>r.kind).sort(),['news','user']);
 }finally{await db.close();}
});
