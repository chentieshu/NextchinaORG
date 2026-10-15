import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';

test('indexed unified search ranks accounts, preserves multilingual media and enforces public visibility for every role',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table auth.mfa_amr_claims(session_id uuid,authentication_method text,updated_at timestamptz);create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,raw_user_meta_data jsonb default '{}');create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const a='92000000-0000-4000-8000-000000000001',b='92000000-0000-4000-8000-000000000002',disabled='92000000-0000-4000-8000-000000000003',incomplete='92000000-0000-4000-8000-000000000004';
  await db.exec(`insert into auth.users(id,email) values('${a}','private-account@example.test'),('${b}','admin-secret@example.test'),('${disabled}','disabled@example.test'),('${incomplete}','incomplete@example.test');update omni_profiles set profile_completed_at=now(),display_name='中文用户',bio='人工智能 开源 developer';update omni_profiles set handle='needle',display_name='Needle' where id='${a}';update omni_profiles set handle='needles',role='super_admin' where id='${b}';update omni_profiles set disabled=true where id='${disabled}';update omni_profiles set profile_completed_at=null where id='${incomplete}';`);
  async function seed(body,extra={}){
   const values={author:a,kind:'post',status:'published',translations:{'zh-CN':{title:'',summary:'',body}},...extra};
   return (await db.query(`insert into omni_articles(category,original_locale,translations,author_id,content_type,status,quoted_article_id) values('ai','zh-CN',$1,$2,$3,$4,$5) returning id`,[JSON.stringify(values.translations),values.author,values.kind,values.status,values.quote??null])).rows[0].id;
  }
  const post=await seed('needle 人工智能与开源的未来 #AI 100% a_b'),draft=await seed('needle secret draft',{status:'draft'}),archived=await seed('needle hidden archived',{status:'archived'});
  await seed('needle hidden disabled',{author:disabled});await seed('needle hidden incomplete',{author:incomplete});
  const media=await seed('needle picture',{translations:{'zh-CN':{title:'',summary:'',body:'needle picture',document:{type:'doc',content:[{type:'image',attrs:{src:'https://media.chinateam.org/image.webp'}}]}}}});
  const embed=await seed('needle https://www.youtube.com/watch?v=abcdefghijk');
  const news=await seed('',{author:b,kind:'news',translations:{'zh-CN':{title:'中文新闻',summary:'摘要',body:'中文正文'},ja:{title:'needle ニュース',summary:'日本語',body:'日本語の技術'}}});
  const quote=await seed('needle quote',{quote:news});
  // Fixture setup only: rate limiting is covered by the existing write suites.
  await db.exec('alter table omni_comments disable trigger omni_comment_throttle');
  await db.query(`insert into omni_comments(article_id,user_id,body,created_at) values($1,$2,'needle reply',now()-interval '1 hour'),($3,$2,'needle hidden draft reply',now()-interval '1 hour'),($1,$4,'needle hidden disabled reply',now()-interval '1 hour')`,[post,a,draft,disabled]);
  await db.query(`insert into omni_comments(article_id,user_id,body,deleted,created_at) values($1,$2,'needle removed reply',true,now()-interval '1 hour')`,[post,a]);
  await db.exec('alter table omni_comments enable trigger omni_comment_throttle');
  await db.exec("update omni_comments set deleted=true where body='needle removed reply'");
  for(let i=0;i<24;i++)await seed('pagination item '+i,{author:b});
  await db.exec(`insert into omni_follows(follower_id,following_id) values('${b}','${a}')`);
  async function search(q,kind='all',sort='relevant',offset=0,follow=false,size=20,actor=null){
   await db.exec(`reset role;set role ${actor?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${actor??''}',false)`);
   return (await db.query('select omni_search_v2($1,$2,$3,$4,$5,$6) value',[q,kind,sort,offset,follow,size])).rows.map(r=>r.value);
  }
  let rows=await search('needle');assert.equal(rows[0].profile.id,a);assert.equal(rows[1].profile.id,b);assert.ok(rows.some(r=>r.kind==='reply'));assert.ok(rows.some(r=>r.article?.id===news));
  assert.ok(!JSON.stringify(rows).includes('hidden'));assert.ok(!JSON.stringify(rows).includes('secret'));assert.ok(!JSON.stringify(rows).includes('removed reply'));assert.ok(!rows.some(r=>[draft,archived].includes(r.article?.id)));
  assert.deepEqual(Object.keys(rows[0].profile).sort(),['avatar_key','bio','display_name','following','handle','id']);
  assert.equal(rows.find(r=>r.article?.id===news).article.matched_locale,'ja');
  assert.equal((await search('中文正文 日本語','news')).length,0);
  assert.equal(rows.find(r=>r.article?.id===quote).article.quoted_article.id,news);
  assert.equal(rows.find(r=>r.article?.id===media).article.media[0].url,'https://media.chinateam.org/image.webp');
  assert.equal((await search('@NEEDLE','user'))[0].profile.id,a);
  assert.equal((await search('开源 人工智能','post'))[0].article.id,post);
  assert.equal((await search('#AI','post'))[0].article.id,post);
  assert.equal((await search('%','post')).length,1);assert.equal((await search('_','post')).length,1);
  assert.equal((await search('private-account@example.test')).length,0);assert.equal((await search('')).length,0);assert.equal((await search('needle','invalid')).length,0);
  assert.deepEqual((await search('needle','media')).map(r=>r.article.id).sort(),[media,embed].sort());
  assert.equal((await search('needle','all','latest',0,true)).length,0);
  rows=await search('needle','all','relevant',0,true,20,b);assert.ok(rows.length>0);assert.ok(rows.every(r=>r.kind==='user'?r.profile.id===a:r.kind==='reply'?r.reply.user_id===a:r.article.author_id===a));
  assert.ok((await search('needle','user','relevant',0,true,20,b))[0].profile.following);
  assert.ok(!(await search('needle','all','relevant',0,false,20,b)).some(r=>r.article?.id===draft));
  const page1=await search('pagination','post','latest',0),page2=await search('pagination','post','latest',20);
  assert.equal(page1.length,21);assert.equal(page2.length,4);assert.equal(new Set([...page1.slice(0,20),...page2].map(r=>r.article.id)).size,24);
  assert.equal((await search('pagination','post','latest',0,false,5)).length,6);
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_articles set status='archived' where id='${news}'`);
  rows=await search('needle');assert.equal(rows.find(r=>r.article?.id===quote).article.quoted_article,null);assert.ok(!rows.some(r=>r.article?.id===news));
  await db.exec(`reset role;insert into omni_articles(category,original_locale,translations,author_id,content_type,status) select 'ai','zh-CN',jsonb_build_object('zh-CN',jsonb_build_object('title','','summary','','body','unrelated text '||n)),'${a}','post','published' from generate_series(1,1200) n;analyze omni_articles;`);
  const plan=(await db.query("explain select id from omni_articles where status='published' and omni_private.omni_search_text(translations,original_locale,content_type) like '%needle%'" )).rows;
  assert.match(JSON.stringify(plan),/omni_articles_search/);
 }finally{await db.close();}
});
