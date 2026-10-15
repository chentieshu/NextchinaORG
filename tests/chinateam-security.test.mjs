import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('reposts, quotes, independent drafts preserve authority and public visibility',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,raw_user_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.mfa_amr_claims(session_id uuid,authentication_method text,updated_at timestamptz);create table auth.mfa_factors(id uuid,user_id uuid,status text);create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const a='90000000-0000-4000-8000-000000000001',b='90000000-0000-4000-8000-000000000002',admin='90000000-0000-4000-8000-000000000003';
  await db.exec(`insert into auth.users(id) values('${a}'),('${b}'),('${admin}');update omni_profiles set profile_completed_at=now();update omni_profiles set role='super_admin' where id='${admin}';`);
  const quote=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
  async function as(id,sql,aal='aal1'){await db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id??''}',false),set_config('request.jwt.claims','{"aal":"${aal}"}',false)`);return db.query(sql);}
  const payload=(body,extra={})=>({translations:{en:{title:'',summary:body,body}},original_locale:'en',category:'ai',cover_style:0,source_url:null,content_type:'post',quoted_article_id:null,...extra});
  const publish=(id,p,stamp=null,draft=null,remaining=null)=>`select omni_publish_content(${id?`'${id}'`:'null'},${quote(p)},${stamp?`'${stamp}'`:'null'},${draft?`'${draft}'`:'null'},${remaining?quote(remaining):'null'}) p`;
  const original=(await as(a,publish(null,payload('original text')))).rows[0].p;
  assert.equal((await as(b,`select omni_set_repost('${original.id}',true) p`)).rows[0].p.repost_count,1);
  assert.equal((await as(b,`select omni_set_repost('${original.id}',true) p`)).rows[0].p.repost_count,1);
  let feed=(await as(null,`select omni_content_feed(author_filter=>'${b}') p`)).rows;assert.equal(feed.length,1);assert.equal(feed[0].p.reposter_id,b);assert.equal(feed[0].p.author_id,a);
  assert.equal((await as(null,`select omni_content_feed(author_filter=>'${b}',include_reposts=>false)`)).rows.length,0);
  const quoted=(await as(b,publish(null,payload('',{quoted_article_id:original.id})))).rows[0].p;assert.equal(quoted.has_quote,true);
  let social=(await as(null,`select omni_social_context(array['${quoted.id}'::uuid]) p`)).rows[0].p;assert.match(social.quoted_article.translations.en.summary,/original text/);
  await assert.rejects(as(a,`update omni_articles set quoted_article_id='${quoted.id}' where id='${original.id}'`),/Quote identity/);
  const draft={translations:payload('private changes').translations,original:'en',category:'ai',source:'',cover:0,quotedArticle:null};
  const save=`select omni_save_content_draft('${original.id}',${quote(draft)},'${original.updated_at}',null) d`;
  await assert.rejects(as(b,save),/Forbidden/);
  const stored=(await as(a,save)).rows[0].d;await assert.rejects(as(a,save),/Draft changed/);
  await assert.rejects(as(a,publish(original.id,payload('unseen cloud draft'),original.updated_at)),/Draft changed/);
  assert.equal((await as(null,`select translations->'en'->>'body' body from omni_articles where id='${original.id}'`)).rows[0].body,'original text');
  assert.equal((await as(b,'select * from omni_content_drafts')).rows.length,0);
  const updated=(await as(a,publish(original.id,payload('published changes'),original.updated_at,stored.updated_at))).rows[0].p;assert.equal(updated.status,'published');assert.equal(updated.translations.en.body,'published changes');
  await assert.rejects(as(a,publish(original.id,payload('stale overwrite'),original.updated_at)),/Content changed/);
  assert.equal((await as(a,'select * from omni_content_drafts')).rows.length,0);
  // The private translation remains private after publishing another language.
  const newsDraft={...draft,translations:{en:{title:'News',summary:'',body:'English story'},ja:{title:'非公開',summary:'',body:'private Japanese'}}};
  const news=(await as(admin,publish(null,payload('English story',{content_type:'news',translations:{en:{title:'News',summary:'',body:'English story'}}}),null,null,newsDraft))).rows[0].p;
  assert.equal(news.translations.ja,undefined);assert.equal((await as(null,"select omni_content_feed(content_kind=>'news',news_language=>'ja')")).rows.length,0);
  assert.equal((await as(admin,'select payload from omni_content_drafts')).rows[0].payload.translations.ja.body,'private Japanese');
  await as(admin,`update omni_articles set status='archived',moderated=true where id='${original.id}'`);
  assert.equal((await as(null,`select omni_social_context(array['${quoted.id}'::uuid]) p`)).rows[0].p.quoted_article,null);
  await assert.rejects(as(b,`select omni_set_repost('${original.id}',true)`),/row-level security/);
  await as(admin,`delete from omni_articles where id='${original.id}'`);
  social=(await as(null,`select omni_social_context(array['${quoted.id}'::uuid]) p`)).rows[0].p;assert.equal(social.has_quote,true);assert.equal(social.quoted_article,null);
  assert.equal((await as(b,`select omni_set_repost('${quoted.id}',false) p`)).rows[0].p.reposted,false);
  await db.exec(`reset role;insert into auth.mfa_factors values(gen_random_uuid(),'${admin}','verified');`);
  assert.equal((await as(admin,'select omni_private.omni_role() role','aal2')).rows[0].role,'super_admin');
  assert.equal((await as(admin,'select omni_private.omni_role() role')).rows[0].role,'super_admin','retired TOTP factors do not block normal content roles');
 }finally{await db.close();}
});
