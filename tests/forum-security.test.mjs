import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('forum ownership, moderation, rich content and comment permissions are enforced in the database',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files)await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 const owner='10000000-0000-4000-8000-000000000001',editor='10000000-0000-4000-8000-000000000002',member='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000004';
 await db.exec(`insert into auth.users(id) values('${owner}'),('${editor}'),('${member}'),('${other}');update omni_profiles set role='super_admin' where id='${owner}';update omni_profiles set role='editor' where id='${editor}';`);
 const data=`'ai','en','{"en":{"title":"Forum test","summary":"Summary","body":"Body","document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}}}'`;
 async function as(id,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_profiles set profile_completed_at=now() where id='${id}' and profile_completed_at is null;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return db.exec(sql);}
 async function root(sql){await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");return db.exec(sql);}
 const post=(await as(member,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status,created_at) values(${data},'${member}','post','published','1999-01-01') returning *`))[0].rows[0];
 assert.equal(post.content_type,'post');assert.ok(new Date(post.created_at).getFullYear()>2020,'database owns creation time');assert.equal(post.author_name,'Explorer');
 await assert.rejects(as(member,`insert into omni_articles(category,original_locale,translations,author_id,content_type) values(${data},'${member}','post')`),/30 seconds/);
 await assert.rejects(as(other,`insert into omni_articles(category,original_locale,translations,author_id,content_type) values(${data},'${member}','post')`));
 await assert.rejects(as(other,`insert into omni_articles(category,original_locale,translations,author_id) values(${data},'${other}')`));
 await assert.rejects(as(other,`insert into omni_articles(category,original_locale,translations,author_id,content_type,featured) values(${data},'${other}','post',true)`));
 for(const change of ["content_type='news'","featured=true",`author_id='${other}'`,"created_at='1999-01-01'","published_at='1999-01-01'","locked=true","moderated=true"]){await assert.rejects(as(member,`update omni_articles set ${change} where id='${post.id}'`),change);}
 assert.equal((await as(other,`update omni_articles set source_url='https://example.com' where id='${post.id}' returning id`))[0].rows.length,0);
 assert.equal((await as(other,`delete from omni_articles where id='${post.id}' returning id`))[0].rows.length,0);
 await as(member,`update omni_articles set source_url='https://example.com' where id='${post.id}'`);
 const draft=(await root(`insert into omni_articles(category,original_locale,translations,author_id,content_type) values(${data},'${member}','post') returning id`))[0].rows[0].id;
 assert.equal((await as(other,`select id from omni_articles where id='${draft}'`))[0].rows.length,0);
 assert.equal((await as(member,`select id from omni_articles where id='${draft}'`))[0].rows.length,1);
 await as(member,`update omni_articles set status='published' where id='${draft}'`);
 await as(editor,`update omni_articles set locked=true,featured=true where id='${post.id}'`);
 assert.equal((await as(member,`update omni_articles set source_url=null where id='${post.id}' returning id`))[0].rows.length,0,'locked author cannot edit');
 await assert.rejects(as(member,`insert into omni_comments(article_id,user_id,body) values('${post.id}','${member}','Locked')`));
 await as(editor,`update omni_articles set locked=false where id='${post.id}'`);
 const comment=(await as(member,`insert into omni_comments(article_id,user_id,body) values('${post.id}','${member}','Initial') returning id`))[0].rows[0].id;
 await as(member,`update omni_comments set body='Own edit' where id='${comment}'`);
 assert.equal((await as(other,`update omni_comments set body='Other edit' where id='${comment}' returning id`))[0].rows.length,0);
 await as(editor,`update omni_comments set body='Moderated' where id='${comment}'`);
 await assert.rejects(as(editor,`update omni_comments set user_id='${editor}' where id='${comment}'`));
 await as(editor,`update omni_articles set moderated=true,status='archived' where id='${post.id}'`);
 assert.equal((await as(member,`update omni_articles set status='published' where id='${post.id}' returning id`))[0].rows.length,0,'author cannot republish moderated post');
 await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
 assert.equal((await db.query(`select id from omni_articles where id in ('${post.id}')`)).rows.length,0);
 await assert.rejects(db.exec(`insert into omni_articles(category,original_locale,translations,content_type) values(${data},'post')`));
 await as(editor,`update omni_articles set moderated=false,status='published' where id='${post.id}';delete from omni_comments where id='${comment}'`);
 await as(owner,`update omni_settings set ugc_enabled=false`);
 await assert.rejects(as(other,`insert into omni_articles(category,original_locale,translations,author_id,content_type) values(${data},'${other}','post')`));
 assert.equal((await as(editor,`update omni_settings set ugc_enabled=true returning id`))[0].rows.length,0);
 await as(owner,`update omni_settings set ugc_enabled=true;select omni_manage_user('${other}','member',true)`);
 await assert.rejects(as(other,`insert into omni_articles(category,original_locale,translations,author_id,content_type) values(${data},'${other}','post')`));
 const news=(await as(editor,`insert into omni_articles(category,original_locale,translations,author_id,status) values(${data},'${editor}','published') returning content_type`))[0].rows[0];assert.equal(news.content_type,'news');
 assert.ok((await as(owner,"select * from omni_audit where action='UPDATE:omni_comments'"))[0].rows.length>=2);
 await as(member,`delete from omni_articles where id='${post.id}'`);
 assert.equal((await as(editor,`select * from omni_articles where id='${post.id}'`))[0].rows.length,0);
 }finally{await db.close();}
});
