import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';

test('post threads are atomic, idempotent, private as drafts and independently moderated',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,raw_user_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.mfa_amr_claims(session_id uuid,authentication_method text,updated_at timestamptz);create table auth.mfa_factors(id uuid,user_id uuid,status text);create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  const a=randomUUID(),b=randomUUID(),admin=randomUUID();
  await db.exec(`insert into auth.users(id) values('${a}'),('${b}'),('${admin}');update omni_profiles set profile_completed_at=now();update omni_profiles set role='super_admin' where id='${admin}';`);
  const json=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
  async function as(id,sql){await db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id??''}',false)`);return db.query(sql);}
  const part=(body,extra={})=>({content_type:'post',original_locale:'en',category:'ai',translations:{en:{title:'',summary:body,body}},...extra});
  const call=(parts,status='published',expected=[],append=null,req=randomUUID())=>`select omni_write_post_thread('${req}',${json(parts)},'${status}',${json(expected)},${append?`'${append}'`:'null'}) result`;
  const snapshot=rows=>rows.map(({id,updated_at})=>({id,updated_at}));
  await assert.rejects(as(null,call([part('a'),part('b')])),/permission denied/);
  await assert.rejects(as(a,call([part('valid'),part('')])),/Post content required/);
  assert.equal((await as(null,'select count(*) n from omni_articles')).rows[0].n,0,'no partial publish');
  await assert.rejects(as(a,call([part('news',{content_type:'news'})])),/Posts only/);
  const req=randomUUID(),draftCall=call([part('First'),part('Second'),part('Third')],'draft',[],null,req);
  let rows=(await as(a,draftCall)).rows[0].result;
  assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.thread_id)).size,1);
  assert.deepEqual((await as(a,draftCall)).rows[0].result.map(r=>r.id),rows.map(r=>r.id),'same request is not duplicated');
  await assert.rejects(as(b,draftCall),/Request changed/);
  await assert.rejects(as(a,call([part('changed')],'draft',[],null,req)),/Request changed/);
  assert.equal((await as(null,`select omni_post_thread('${rows[0].id}')`)).rows.length,0);
  assert.equal((await as(b,`select omni_post_thread('${rows[0].id}')`)).rows.length,0);
  assert.equal((await as(a,`select omni_post_thread('${rows[1].id}')`)).rows.length,3);
  await assert.rejects(as(b,call(rows.map(r=>part('stolen',{id:r.id})),'published',snapshot(rows))),/Draft unavailable/);
  await assert.rejects(as(a,`update omni_articles set thread_position=10 where id='${rows[0].id}'`),/Thread identity/);
  await assert.rejects(as(a,`insert into omni_articles(content_type,author_id,translations,original_locale,category,status,thread_id,thread_position) values('post','${a}',${json(part('forged').translations)},'en','ai','published','${rows[0].thread_id}',4)`),/Thread identity/);
  await assert.rejects(as(a,`select * from omni_private.omni_thread_requests`),/permission denied/);
  // Draft reordering/removing parts is atomic, and stale snapshots cannot overwrite it.
  const old=rows;rows=(await as(a,call([part('Third revised',{id:old[2].id}),part('First',{id:old[0].id})],'draft',snapshot(old)))).rows[0].result;
  assert.equal(rows[0].thread_position,1);assert.equal(rows[1].thread_position,2);
  await assert.rejects(as(a,call(old.map(r=>part('stale',{id:r.id})),'published',snapshot(old))),/Content changed/);
  rows=(await as(a,call(rows.map(r=>part(r.translations.en.body,{id:r.id})),'published',snapshot(rows)))).rows[0].result;
  assert.equal((await as(null,`select omni_post_thread('${rows[1].id}') p`)).rows.length,2);
  let feed=(await as(null,'select omni_content_feed() p')).rows;assert.equal(feed.length,1);assert.equal(feed[0].p.thread_count,2);assert.equal(feed[0].p.id,rows[0].id);
  assert.equal((await as(null,`select omni_content_feed(author_filter=>'${a}') p`)).rows.length,2,'profile retains separate posts');
  await assert.rejects(as(b,call([part('hijack')],'published',[],rows[0].id)),/Thread unavailable/);
  await assert.rejects(as(admin,call([part('hijack')],'published',[],rows[0].id)),/Thread unavailable/);
  await assert.rejects(as(a,call([part('rapid continuation')],'published',[],rows[0].id)),/30 seconds/);
  await db.exec(`reset role;update omni_private.omni_thread_requests set created_at=now()-interval '1 minute';alter table omni_articles disable trigger omni_article_guard;update omni_articles set created_at=now()-interval '1 minute';alter table omni_articles enable trigger omni_article_guard;`);
  const more=(await as(a,call([part('Fourth')],'published',[],rows[1].id))).rows[0].result;
  assert.equal(more[0].thread_position,3);assert.equal(more[0].author_id,a);
  await as(admin,`update omni_articles set status='archived',moderated=true where id='${rows[0].id}'`);
  const visible=(await as(null,`select omni_post_thread('${rows[1].id}') p`)).rows;assert.equal(visible.length,2);assert.equal(visible[0].p.id,rows[1].id);
  feed=(await as(null,'select omni_content_feed() p')).rows;assert.equal(feed[0].p.id,rows[1].id);assert.equal(feed[0].p.thread_count,2);
  await assert.rejects(as(a,call([part('bypass moderation')],'published',[],rows[1].id)),/Thread unavailable/);
  await as(admin,`delete from omni_articles where id='${rows[0].id}'`);
  assert.equal((await as(null,`select omni_post_thread('${rows[1].id}')`)).rows.length,2,'head deletion does not orphan the thread');
  await db.exec(`reset role;insert into auth.mfa_factors values(gen_random_uuid(),'${a}','verified');`);
  assert.equal((await as(a,'select omni_private.omni_role() role')).rows[0].role,'member');
  // The scoped permit must close even if a database caller keeps the transaction open.
  await db.exec('begin');const scoped=(await as(admin,call([part('Scoped one'),part('Scoped two')]))).rows[0].result;
  await assert.rejects(as(admin,`update omni_articles set thread_position=10 where id='${scoped[0].id}'`),/Thread identity/);await db.exec('rollback');
  await assert.rejects(as(admin,call(Array.from({length:21},()=>part('Too many')))),/Maximum 20/);
 }finally{await db.close();}
});
