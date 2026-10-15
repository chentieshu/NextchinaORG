import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('categories and settings serialize edits; owner can manage all content while metrics remain private',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.mfa_amr_claims(session_id uuid,authentication_method text,updated_at timestamptz);create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,raw_user_meta_data jsonb default '{}');create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const owner='70000000-0000-4000-8000-000000000001',editor='70000000-0000-4000-8000-000000000002',member='70000000-0000-4000-8000-000000000003';
 await db.exec(`insert into auth.users(id) values('${owner}'),('${editor}'),('${member}');update omni_profiles set role='super_admin' where id='${owner}';update omni_profiles set role='editor' where id='${editor}'`);
 async function as(id,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_profiles set profile_completed_at=now() where id='${id}' and profile_completed_at is null;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return db.exec(sql);}
 const labels=JSON.stringify({'zh-CN':'工具',en:'Tools',ja:'ツール',es:'Herramientas','zh-TW':'工具'}),save=`select omni_save_category('tools','${labels}',1,true) as c`;
 await assert.rejects(as(member,save),/Forbidden/);await assert.rejects(as(editor,save),/Forbidden/);
 let cat=(await as(owner,save))[0].rows[0].c;
 await assert.rejects(as(owner,`select omni_save_category('invalid','{"en":"Missing"}',1,true)`),/Five translated names/);
 const post=(await as(member,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('tools','en','{"en":{"title":"","summary":"","body":"Member original"}}','${member}','post','published') returning id`))[0].rows[0].id;
 await as(owner,`select omni_save_category('tools','${labels}',3,false,'${cat.updated_at}')`);
 await assert.rejects(as(owner,`select omni_save_category('tools','${labels}',2,true,'${cat.updated_at}')`),/Category changed/);
 cat=(await as(owner,`select to_jsonb(c) as c from omni_categories c where key='tools'`))[0].rows[0].c;
 await assert.rejects(as(owner,`select omni_delete_category('tools','${cat.updated_at}')`),/Category is in use/);
 await assert.rejects(as(owner,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('tools','en','{"en":{"title":"Valid news","summary":"Summary","body":"News body"}}','${owner}','news','draft')`),/Category unavailable/);
 await as(owner,`update omni_articles set translations='{"en":{"title":"","summary":"","body":"Owner edited member post"}}',locked=true,status='archived',moderated=true where id='${post}'`);
 await as(owner,`update omni_articles set status='published',moderated=false,locked=false where id='${post}'`);
 const comment=(await as(member,`insert into omni_comments(article_id,user_id,body) values('${post}','${member}','Member reply') returning id`))[0].rows[0].id;
 await as(owner,`update omni_comments set body='Owner edited reply' where id='${comment}';select omni_remove_comment('${comment}')`);
 const news=(await as(editor,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"Editor news","summary":"Summary","body":"News body"}}','${editor}','news','draft') returning id`))[0].rows[0].id;
 await as(owner,`update omni_articles set status='published' where id='${news}'`);
 const found=(await as(owner,`select * from omni_admin_content('post',filter_query=>'owner edited') as a`))[0].rows[0].a;assert.equal(found.id,post);assert.ok(found.author_name);
 const overview=(await as(owner,'select omni_admin_overview() as v'))[0].rows[0].v;assert.equal(overview.members,3);assert.equal(overview.categories.tools,1);assert.equal(overview.comments,0);
 assert.equal((await as(editor,'select omni_admin_overview() as v'))[0].rows[0].v.members,null);
 await assert.rejects(as(member,'select omni_admin_content(\'post\')'),/Forbidden/);await assert.rejects(as(editor,'select omni_admin_metrics()'),/Forbidden/);
 const metrics=(await as(owner,'select omni_admin_metrics() as m'))[0].rows[0].m;assert.ok(metrics.database_bytes>0);assert.equal(metrics.upload_reservations_24h,0);assert.ok(!('email' in metrics));
 const stamp=(await as(owner,'select to_jsonb(s) as s from omni_settings s'))[0].rows[0].s.updated_at;
 await as(owner,`select omni_save_settings('Updated',true,false,'${stamp}')`);await assert.rejects(as(owner,`select omni_save_settings('Stale',false,true,'${stamp}')`),/Settings changed/);
 await assert.rejects(as(editor,`select omni_save_settings('',true,true,'${stamp}')`),/Forbidden/);
 await as(owner,`delete from omni_articles where id in ('${post}','${news}');select omni_delete_category('tools','${cat.updated_at}')`);
 await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");assert.equal((await db.query('select count(*) n from omni_categories')).rows[0].n,5);await assert.rejects(db.exec('select omni_admin_metrics()'),/permission denied/);
 }finally{await db.close();}
});
