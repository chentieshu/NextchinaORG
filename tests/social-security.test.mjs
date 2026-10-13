import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('social posts, profile identities, follow ownership and deep replies preserve cross-user boundaries',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const a='60000000-0000-4000-8000-000000000001',b='60000000-0000-4000-8000-000000000002';await db.exec(`insert into auth.users(id) values('${a}'),('${b}')`);
 async function as(id,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_profiles set profile_completed_at=now() where id='${id}' and profile_completed_at is null;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return db.exec(sql);}
 const post=(await as(a,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"","summary":"","body":"A post without a title"}}','${a}','post','published') returning id`))[0].rows[0].id;
 await assert.rejects(as(a,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"","summary":"","body":""}}','${a}','post','published')`),/Post content required/);
 await assert.rejects(as(a,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"News","summary":"Summary","body":"News"}}','${a}','news','published')`));
 const hidden=(await as(b,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"","summary":"","body":"Private draft"}}','${b}','post','draft') returning id`))[0].rows[0].id;
 await as(a,`insert into omni_follows(follower_id,following_id) values('${a}','${b}')`);
 await assert.rejects(as(b,`insert into omni_follows(follower_id,following_id) values('${a}','${b}')`));
 await assert.rejects(as(a,`insert into omni_follows(follower_id,following_id) values('${a}','${a}')`));
 await as(b,`delete from omni_follows where follower_id='${a}'`);assert.equal((await as(a,'select count(*) as n from omni_follows'))[0].rows[0].n,1);
 let pub=(await as(a,`select omni_profile_page('${b}') as p`))[0].rows[0].p;assert.equal(pub.following,true);assert.equal(pub.follower_count,1);assert.ok(!('role' in pub));assert.ok(!('email' in pub));
 let own=(await as(a,'select * from omni_profiles'))[0].rows[0];const stamp=new Date(own.updated_at).toISOString();const fresh=(await as(a,`select omni_update_bio('ALICE','Hello','https://example.org','${stamp}') as p`))[0].rows[0].p;assert.equal(fresh.handle,'alice');await assert.rejects(as(a,`select omni_update_bio('alice','Lost edit','','${stamp}')`),/Profile changed/);
 own=(await as(b,'select * from omni_profiles'))[0].rows[0];await assert.rejects(as(b,`select omni_update_bio('alice','','','${new Date(own.updated_at).toISOString()}')`),/unique/);
 const root=(await as(a,`insert into omni_comments(article_id,user_id,body) values('${post}','${a}','Root reply') returning id`))[0].rows[0].id;
 const child=(await as(b,`insert into omni_comments(article_id,user_id,parent_id,body) values('${post}','${b}','${root}','Reply to root') returning id,depth`))[0].rows[0];assert.equal(child.depth,1);
 const third='60000000-0000-4000-8000-000000000003';await db.exec(`reset role;insert into auth.users(id) values('${third}')`);
 const grandchild=(await as(third,`insert into omni_comments(article_id,user_id,parent_id,body) values('${post}','${third}','${child.id}','Third round') returning id,depth`))[0].rows[0];assert.equal(grandchild.depth,2);
 // Different article parents are rejected before the existing comment throttle.
 await assert.rejects(as(a,`insert into omni_comments(article_id,user_id,parent_id,body) values('${hidden}','${a}','${child.id}','Cross article')`));
 await assert.rejects(as(a,`update omni_comments set parent_id='${child.id}' where id='${root}'`));
 await assert.rejects(as(a,`select omni_remove_comment('${child.id}')`),/unavailable/);
 await as(a,`select omni_remove_comment('${root}')`);
 const roots=(await as(b,`select * from omni_thread_replies('${post}') as c`))[0].rows.map(r=>r.c);assert.equal(roots.length,1);assert.equal(roots[0].deleted,true);assert.equal(roots[0].body,'[deleted]');assert.equal(roots[0].reply_count,1);
 const children=(await as(b,`select * from omni_thread_replies('${post}','${root}') as c`))[0].rows.map(r=>r.c);assert.equal(children[0].body,'Reply to root');
 assert.equal(children[0].reply_count,1);await as(b,`select omni_remove_comment('${child.id}')`);
 const remaining=(await as(third,`select * from omni_thread_replies('${post}','${child.id}') as c`))[0].rows[0].c;assert.equal(remaining.body,'Third round');
 assert.equal((await as(a,`select comment_count from omni_content_counts('${post}')`))[0].rows[0].comment_count,1);
 const image={type:'image',attrs:{src:'https://media.nextchina.org/content/test.webp'}};
 const media=JSON.stringify({en:{title:'',summary:'',body:'',document:{type:'doc',content:Array.from({length:4},()=>image)}}});
 await as(a,`update omni_articles set translations='${media}' where id='${post}'`);
 const tooMany=JSON.stringify({en:{title:'',summary:'',body:'',document:{type:'doc',content:Array.from({length:5},()=>image)}}});
 await assert.rejects(as(a,`update omni_articles set translations='${tooMany}' where id='${post}'`),/Maximum four images/);
 await as(a,`update omni_articles set translations='{"en":{"title":"","summary":"","body":"A post without a title"}}' where id='${post}'`);
 await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");assert.equal((await db.query(`select * from omni_thread_replies('${hidden}')`)).rows.length,0);
 const feed=(await db.query(`select * from omni_content_feed(author_filter=>'${a}') as a`)).rows;assert.equal(feed.length,1);assert.equal(feed[0].a.translations.en.title,'');assert.match(feed[0].a.translations.en.summary,/without a title/);
 }finally{await db.close();}
});
