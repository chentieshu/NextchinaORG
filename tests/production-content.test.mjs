import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('paginated summaries, private bookmarks and rich comments preserve database permissions',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  const member='30000000-0000-4000-8000-000000000001',other='30000000-0000-4000-8000-000000000002',editor='30000000-0000-4000-8000-000000000003';
  await db.exec(`insert into auth.users(id) values('${member}'),('${other}'),('${editor}');update omni_profiles set role='editor' where id='${editor}'`);
  const translations=JSON.stringify({en:{title:'Find this story',summary:'Open conversation',body:'Private payload should never be in a feed',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Body'}]},{type:'image',attrs:{src:'http://unsafe.example.test/image.png'}},{type:'image',attrs:{src:'https://images.example.test/post.png'}}]}}});
  const data=`'ai','en','${translations}'::jsonb`;
  const post=(await db.query(`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values(${data},'${member}','post','published') returning id`)).rows[0].id;
  const draft=(await db.query(`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values(${data},'${member}','post','draft') returning id`)).rows[0].id;
  const foreign=(await db.query(`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values(${data},'${other}','post','draft') returning id`)).rows[0].id;
  async function role(id,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_profiles set profile_completed_at=now() where id='${id}' and profile_completed_at is null;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return db.query(sql);}
  async function feed(args=''){return (await db.query(`select public.omni_content_feed(${args}) as item`)).rows.map(r=>r.item);}
  await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)");const publicRows=await feed();assert.equal(publicRows.length,1);assert.equal(publicRows[0].id,post);assert.equal(publicRows[0].translations.en.body,'');assert.equal(publicRows[0].translations.en.document,undefined);assert.equal(publicRows[0].thumbnail_url,'https://images.example.test/post.png');
  assert.deepEqual(await feed("bookmarks_only=>true"),[]);assert.deepEqual(await feed("own_only=>true"),[]);assert.equal((await feed("filter_query=>'Open conversation'")).length,1);assert.equal((await feed("filter_query=>'%'")).length,0,'search treats wildcard characters literally');
  await role(member,`insert into omni_bookmarks(user_id,article_id) values('${member}','${post}')`);assert.equal((await feed("bookmarks_only=>true"))[0].id,post);const own=await feed("own_only=>true");assert.ok(own.some(a=>a.id===draft));assert.ok(!own.some(a=>a.id===foreign));
  await role(other,'select 1');assert.deepEqual(await feed("bookmarks_only=>true"),[]);
  const rich=JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Rich comment',marks:[{type:'bold'}]}]}]});
  const comment=(await role(member,`insert into omni_comments(article_id,user_id,body,document) values('${post}','${member}','Rich comment','${rich}') returning *`)).rows[0];assert.equal(comment.document.content[0].content[0].marks[0].type,'bold');
  const comments=(await db.query(`select * from omni_rich_comments('${post}',0)`)).rows;assert.equal(comments[0].document.type,'doc');const counts=(await db.query(`select * from public.omni_content_counts('${post}')`)).rows[0];assert.equal(Number(counts.comment_count),1);assert.deepEqual(Object.keys(counts).sort(),['comment_count','like_count']);assert.deepEqual((await db.query(`select * from public.omni_content_counts('${foreign}')`)).rows,[]);
  assert.equal((await role(other,`update omni_comments set document=null where id='${comment.id}' returning id`)).rows.length,0,'another member cannot edit rich content');
  await assert.rejects(role(member,`update omni_comments set document='{"type":"script"}' where id='${comment.id}'`));
  await assert.rejects(role(member,`update omni_comments set document=jsonb_build_object('type','doc','padding',repeat('x',65000)) where id='${comment.id}'`));
  await assert.rejects(role(member,`update omni_comments set updated_at='1999-01-01' where id='${comment.id}'`));
  await role(editor,`update omni_comments set document='${rich}',body='Moderated text' where id='${comment.id}'`);assert.equal((await db.query(`select document from omni_comments where id='${comment.id}'`)).rows[0].document,null,'older plain-text clients cannot leave stale rich content');
  await role(editor,`update omni_comments set document='${rich}' where id='${comment.id}'`);
  await role(editor,`update omni_articles set status='archived',moderated=true where id='${post}'`);await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");assert.equal((await db.query(`select * from omni_rich_comments('${post}',0)`)).rows.length,0);assert.deepEqual((await db.query(`select * from public.omni_content_counts('${post}')`)).rows,[]);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");await db.exec(`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) select 'ai','en','${translations}','${editor}','post','published' from generate_series(1,55)`);
  await db.exec("set role anon");const first=await feed('page_size=>20'),next=await feed('page_size=>20,offset_rows=>20');assert.equal(first.length,21);assert.equal(next.length,21);assert.equal(first.slice(0,20).filter(a=>next.slice(0,20).some(b=>a.id===b.id)).length,0);assert.equal((await feed('page_size=>10000')).length,51,'server caps the page size');
 }finally{await db.close();}
});
