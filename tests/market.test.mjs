import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {createVoucher,voucherDigest,normalizeVoucher,marketUnits,safeMerchantContact} from '../src/modules/wallet/market.ts';

test('voucher entropy, normalization, exact point amounts and safe contact links',async()=>{
 const codes=new Set(Array.from({length:200},()=>createVoucher()));assert.equal(codes.size,200);
 for(const code of codes){assert.match(code,/^CT-(?:[0-9A-F]{8}-){3}[0-9A-F]{8}$/);assert.equal((await voucherDigest(code)).length,64);}
 const code=createVoucher();assert.equal(await voucherDigest(code.toLowerCase().replaceAll('-',' ')),await voucherDigest(code));assert.equal(normalizeVoucher('ＣＴ-ＡＢＣＤ'),'ABCD');assert.equal(await voucherDigest('invalid'),null);
 assert.equal(marketUnits('1000000'),'10000000000');for(const v of ['0','-1','1.5','1e3','01','1000001',' 1'])assert.equal(marketUnits(v),null);
 for(const v of ['javascript:alert(1)','http://example.test','https://user:pass@example.test'])assert.equal(safeMerchantContact(v),null);assert.equal(safeMerchantContact('https://example.test/contact'),'https://example.test/contact');
});

test('market authority, issuance, code reservation, redemption and cancellation preserve the ledger',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,raw_user_meta_data jsonb default '{}');
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create table auth.mfa_amr_claims(session_id uuid,authentication_method text,updated_at timestamptz);
   create table auth.mfa_factors(id uuid,user_id uuid,status text);
   create table auth.identities(id uuid default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f.slice(0,14)<'20261015122707').sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  const owner=randomUUID(),merchant=randomUUID(),buyer=randomUUID(),other=randomUUID(),editor=randomUUID();
  const root=async sql=>{await db.exec('reset role');return (await db.query(sql)).rows;};
  const as=async(id,sql)=>{await db.exec(`reset role;set role ${id?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${id??''}',false),set_config('request.jwt.claims','${JSON.stringify({session_id:id,email:id+'@example.test'})}',false)`);return (await db.query(sql)).rows[0]?.s;};
  await root(`insert into auth.users(id,email,email_confirmed_at) select id,id::text||'@example.test',now() from unnest(array['${owner}','${merchant}','${buyer}','${other}','${editor}']::uuid[]) id`);
  await root(`update public.omni_profiles set profile_completed_at=now()`);
  await root(`update public.omni_profiles set role='super_admin' where id='${owner}'`);await root(`update public.omni_profiles set role='editor' where id='${editor}'`);
  await root(`update public.omni_profiles set handle='market_seller' where id='${merchant}'`);
  await root('insert into auth.sessions select id,id,null from auth.users');
  const save=(expected='null',active=true)=>`select omni_market_merchant_save('market_seller','Test shop','https://example.test/contact','A shop',${active},${expected}) s`;
  await assert.rejects(as(null,'select omni_market_list()'),/permission denied/);
  await assert.rejects(as(buyer,save()),/Market access denied/);await assert.rejects(as(editor,save()),/Market access denied/);
  await assert.rejects(as(owner,save()),/Recent email verification required/);
  await root(`insert into auth.mfa_amr_claims select id,'otp',now() from auth.users`);
  let shop=await as(owner,save());assert.equal(shop.user_id,merchant);
  await assert.rejects(as(owner,save()),/Merchant changed/);
  await assert.rejects(as(merchant,'select omni_market_list(\'merchants\')'),/Market access denied/);
  await assert.rejects(as(buyer,'select * from omni_private.market_codes'),/permission denied/);
  await assert.rejects(as(buyer,`select omni_market_list('codes',null,'${merchant}')`),/Market access denied/);
  const issueKey=randomUUID(),allocate=(key=issueKey,amount=10000000,action='issue')=>`select omni_market_allocate('${key}','${merchant}',${amount},'${action}','Reference 001') s`;
  await assert.rejects(as(merchant,allocate()),/Market access denied/);
  const issued=await as(owner,allocate());assert.equal(await as(owner,allocate()),issued);await assert.rejects(as(owner,allocate(issueKey,20000000)),/Wallet request changed/);
  assert.equal((await as(merchant,'select omni_market_snapshot() s')).merchant.available,'10000000');assert.equal((await as(merchant,'select omni_wallet_snapshot() s')).purchased,'0');
  const make=async(amount=2000000)=>{const code=createVoucher(),digest=await voucherDigest(code),request=randomUUID();return{code,digest,query:`select omni_market_code_create('${request}',${amount},'${digest}','${code.slice(-4)}',30) s`};};
  const voucher=await make(),created=await as(merchant,voucher.query);assert.deepEqual(await as(merchant,voucher.query),created);
  let s=await as(merchant,'select omni_market_snapshot() s');assert.equal(s.merchant.available,'8000000');assert.equal(s.merchant.reserved,'2000000');
  await assert.rejects(as(buyer,(await make()).query),/Merchant unavailable/);await assert.rejects(as(merchant,(await make(9000000)).query),/Insufficient merchant points/);
  await assert.rejects(as(owner,allocate(randomUUID(),9000000,'revoke')),/Insufficient merchant points/);
  const redeem=`select omni_market_redeem('${voucher.digest}') s`;assert.equal((await as(merchant,redeem)).error,'own_code');
  let r=await as(buyer,redeem);assert.equal(r.ok,true);assert.equal(r.units,'2000000');assert.equal((await as(buyer,redeem)).already_redeemed,true);assert.equal((await as(other,redeem)).error,'invalid_code');
  assert.equal((await as(buyer,'select omni_wallet_snapshot() s')).purchased,'2000000');assert.equal((await as(buyer,'select omni_wallet_snapshot() s')).earned,'0');
  await assert.rejects(as(merchant,`select omni_market_code_cancel('${randomUUID()}','${created.id}')`),/Code changed/);
  const cancelled=await make(),cancelledId=(await as(merchant,cancelled.query)).id,cancelKey=randomUUID(),cancel=`select omni_market_code_cancel('${cancelKey}','${cancelledId}') s`;
  await assert.rejects(as(other,cancel),/Market access denied/);const cancelledJournal=await as(merchant,cancel);assert.equal(await as(merchant,cancel),cancelledJournal);assert.equal((await as(other,`select omni_market_redeem('${cancelled.digest}') s`)).error,'invalid_code');
  const expires=await make(),expiresId=(await as(merchant,expires.query)).id;
  await root(`update omni_private.market_codes set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='${expiresId}'`);assert.equal((await as(buyer,`select omni_market_redeem('${expires.digest}') s`)).error,'invalid_code');
  await as(owner,`select omni_market_code_cancel('${randomUUID()}','${expiresId}') s`);
  const old=await make(),oldId=(await as(merchant,old.query)).id;shop=await as(owner,save(`'${shop.updated_at}'`,false));await assert.rejects(as(merchant,(await make()).query),/Merchant unavailable/);assert.equal((await as(buyer,`select omni_market_redeem('${old.digest}') s`)).ok,true,'delisting honors codes already issued');
  await as(owner,allocate(randomUUID(),6000000,'revoke'));s=await as(owner,'select omni_market_snapshot() s');assert.deepEqual(s.summary,{issued:'10000000',revoked:'6000000',available:'0',reserved:'0',redeemed:'4000000'});
  await assert.rejects(as(owner,allocate(randomUUID(),1000000)),/Merchant unavailable/);
  shop=await as(owner,save(`'${shop.updated_at}'`,true));await as(owner,allocate(randomUUID(),1000000));
  const c1=await make(1000000),c2=await make(1000000);await as(merchant,'select 1');const concurrent=await Promise.allSettled([db.query(c1.query),db.query(c2.query)]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1,'oversubscription cannot create unfunded codes');
  for(let i=0;i<11;i++)r=await as(other,`select omni_market_redeem('${'f'.repeat(64)}') s`);assert.equal(r.error,'rate_limited');assert.ok((await root(`select attempts from omni_private.market_attempts where user_id='${other}'`))[0].attempts>=10);
  await root(`update omni_private.wallet_users set frozen=true where user_id='${merchant}'`);await assert.rejects(as(owner,allocate(randomUUID(),1000000)),/Wallet frozen/);
  const rows=await root('select coalesce(sum(balance),0)::text total from omni_private.wallet_accounts');assert.equal(rows[0].total,'0');
  const unbalanced=await root('select j.id from omni_private.wallet_journals j join omni_private.wallet_entries e on e.journal_id=j.id group by j.id having sum(e.amount)<>0');assert.equal(unbalanced.length,0);
  const codes=await root('select * from omni_private.market_codes');assert.ok(codes.every(c=>!JSON.stringify(c).includes(voucher.code)));
  const list=await as(owner,`select jsonb_agg(c) s from omni_market_list('codes',null,'${merchant}') c`);assert.ok(list.every(c=>!('code_hash' in c)&&!('redeemed_by' in c)));
  await assert.rejects(as(merchant,'update omni_private.wallet_accounts set balance=999999'),/permission denied/);
  assert.equal((await root('select tipping_enabled from omni_private.wallet_settings'))[0].tipping_enabled,false,'migration and issuance never enable money features');
 }finally{await db.close();}
});

