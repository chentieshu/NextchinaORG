import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {normalizeEmailCode,emailVerificationFailure} from '../src/lib/email-verification.ts';

test('email code input preserves leading zeros and reports useful failure states',()=>{
 assert.equal(normalizeEmailCode('０８１８ ０４１２'),'08180412');assert.equal(normalizeEmailCode(' 005 924 '),'005924');
 assert.equal(emailVerificationFailure({code:'otp_expired'}),'invalidCode');assert.equal(emailVerificationFailure({status:429}),'rateLimited');assert.equal(emailVerificationFailure({code:'account_changed'}),'sessionChanged');
});

test('email proof is server-owned, recent, session-bound and cannot be replaced by AAL2 or user metadata',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,raw_user_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
  create table auth.mfa_amr_claims(session_id uuid,authentication_method text,updated_at timestamptz);
  create table auth.mfa_factors(id uuid,user_id uuid,status text);
  create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const a='90000000-0000-4000-8000-000000000011',b='90000000-0000-4000-8000-000000000012',session='90000000-0000-4000-8000-000000000013';
  const root=async sql=>{await db.exec('reset role');return (await db.exec(sql)).at(-1);};
  const as=async(id=a,claims={session_id:session,email:'a@example.test',aal:'aal1'},sql='select omni_email_verification_status() s')=>{await db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id??''}',false),set_config('request.jwt.claims','${JSON.stringify(claims)}',false)`);return (await db.query(sql)).rows[0]?.s;};
  await root(`insert into auth.users(id,email,email_confirmed_at) values('${a}','a@example.test',now()),('${b}','b@example.test',now());update omni_profiles set profile_completed_at=now();update omni_profiles set role='super_admin' where id='${a}';insert into auth.sessions values('${session}','${a}',null);`);
  assert.equal((await as()).verified,false);
  assert.equal((await as(a,{session_id:session,email:'a@example.test',aal:'aal2',user_metadata:{email_verified:true}})).verified,false);
  await root(`insert into auth.mfa_amr_claims values('${session}','oauth',now())`);assert.equal((await as()).verified,false);
  await root(`update auth.mfa_amr_claims set authentication_method='otp'`);let result=await as();assert.equal(result.verified,true);assert.ok(Date.parse(result.expires_at)>Date.now());
  assert.equal((await as(b,{session_id:session,email:'b@example.test'})).verified,false,'another user cannot use this session');
  assert.equal((await as(a,{session_id:session,email:'changed@example.test'})).verified,false,'old email proof is invalid after email changes');
  await root(`update auth.mfa_amr_claims set updated_at=now()-interval '11 minutes'`);assert.equal((await as()).verified,false);
  await assert.rejects(as(a,undefined,'select omni_wallet_admin_setup(null,false) s'),/Recent email verification required/);
  await root(`update auth.mfa_amr_claims set updated_at=now()+interval '1 minute'`);assert.equal((await as()).verified,false);
  await root(`update auth.mfa_amr_claims set updated_at=now();update auth.users set phone='+12345678' where id='${a}'`);assert.equal((await as()).verified,false,'phone OTP must not pass as email proof');
  await root(`update auth.users set phone=null where id='${a}';update auth.sessions set not_after=now()-interval '1 second'`);assert.equal((await as()).verified,false);
  await root(`update auth.sessions set not_after=null;update omni_profiles set disabled=true where id='${a}'`);assert.equal((await as()).verified,false);
  await root(`update omni_profiles set disabled=false where id='${a}'`);
  assert.equal((await as(a,undefined,'select omni_wallet_admin_setup(null,false) s')).email_verified,true);
  await assert.rejects(as(a,undefined,'select * from auth.mfa_amr_claims'),/permission denied/);
  await assert.rejects(as(null),/permission denied/);
  await root('delete from auth.sessions');assert.equal((await as()).verified,false,'revoked sessions cannot reuse still-valid access tokens');
 }finally{await db.close();}
});
