import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('profile identity is current and public while avatar ownership, roles, quotas and concurrent saves stay protected',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  const member='40000000-0000-4000-8000-000000000001',other='40000000-0000-4000-8000-000000000002';
  await db.exec(`insert into auth.users(id) values('${member}'),('${other}')`);
  async function as(id,sql){await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);update omni_profiles set profile_completed_at=now() where id='${id}' and profile_completed_at is null;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return db.exec(sql);}
  const first=(await as(member,'select updated_at from omni_profiles'))[0].rows[0].updated_at;
  const stamp=new Date(first).toISOString();
  const asset=(await as(member,"select omni_reserve_media('avatar',100,'webp') as asset"))[0].rows[0].asset.object_key;
  assert.ok(asset.startsWith(`avatars/${member}/`));
  const fresh=(await as(member,`select omni_save_profile('New name','${asset}','custom','${stamp}') as profile`))[0].rows[0].profile;
  assert.equal(fresh.avatar_key,asset);assert.equal(fresh.role,'member');
  await assert.rejects(as(member,`select omni_save_profile('Lost update',null,'none','${stamp}')`),/Profile changed/);
  const otherStamp=(await as(other,'select updated_at from omni_profiles'))[0].rows[0].updated_at;
  await assert.rejects(as(other,`select omni_save_profile('Other','${asset}','custom','${new Date(otherStamp).toISOString()}')`),/ownership/);
  await assert.rejects(as(member,"update omni_profiles set role='super_admin'"));
  await assert.rejects(as(member,"select * from omni_private.media_uploads"));
  await assert.rejects(as(member,"select omni_reserve_media('avatar',3000000,'png')"),/Invalid image/);
  await assert.rejects(as(member,"select omni_reserve_media('avatar',100,'svg')"),/Invalid image/);
  const post=(await as(member,`insert into omni_articles(category,original_locale,translations,author_id,content_type,status) values('ai','en','{"en":{"title":"Hello","summary":"Summary","body":"Body"}}','${member}','post','published') returning id`))[0].rows[0].id;
  await as(member,`insert into omni_comments(article_id,user_id,body) values('${post}','${member}','Comment')`);
  const name2=(await as(member,`select omni_save_profile('Renamed',null,'keep','${fresh.updated_at}') as profile`))[0].rows[0].profile;
  await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
  const pub=(await db.query(`select * from omni_public_profiles(array['${member}']::uuid[])`)).rows[0];assert.deepEqual(Object.keys(pub).sort(),['avatar_key','display_name','handle','id']);assert.equal(pub.display_name,'Renamed');
  const feed=(await db.query("select * from omni_content_feed() as data")).rows[0].data;assert.equal(feed.author_name,'Renamed');assert.equal(feed.author_avatar_key,asset);
  const comment=(await db.query(`select * from omni_rich_comments('${post}')`)).rows[0];assert.equal(comment.avatar_key,asset);assert.equal(comment.display_name,'Renamed');
  await assert.rejects(db.exec(`select omni_save_profile('Attack',null,'none','${name2.updated_at}')`));
  for(let i=1;i<50;i++)await as(member,"select omni_reserve_media('avatar',100,'webp')");
  await assert.rejects(as(member,"select omni_reserve_media('avatar',100,'webp')"),/quota/);
  await db.exec(`reset role;update omni_profiles set disabled=true where id='${other}'`);await assert.rejects(as(other,"select omni_reserve_media('content',100,'webp')"),/Account unavailable/);
 }finally{await db.close();}
});
