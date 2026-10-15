begin;
-- Merchant issuance is an explicit platform liability, never a verified on-chain deposit.
alter table omni_private.wallet_accounts drop constraint wallet_accounts_bucket_check;
alter table omni_private.wallet_accounts drop constraint wallet_accounts_check;
alter table omni_private.wallet_accounts add constraint wallet_accounts_bucket_check check(bucket in ('purchased','earned','held','reserve','fees','merchant','codes','issuance'));
alter table omni_private.wallet_accounts add constraint wallet_accounts_check check(
 (user_id is null and bucket in ('reserve','fees','issuance')) or
 (user_id is not null and bucket in ('purchased','earned','held','merchant','codes') and balance between 0 and 10000000000000000));
alter table omni_private.wallet_journals drop constraint wallet_journals_kind_check;
alter table omni_private.wallet_journals add constraint wallet_journals_kind_check check(kind in
 ('deposit','tip','withdraw_hold','withdraw_cancel','withdraw_reject','withdraw_paid','merchant_issue','merchant_revoke','code_create','code_cancel','code_redeem'));
insert into omni_private.wallet_accounts(bucket) values('issuance');

create table omni_private.market_merchants (
 user_id uuid primary key references public.omni_profiles(id) on delete restrict,
 name text not null check(length(name) between 1 and 80),
 contact_url text not null check(length(contact_url) between 9 and 500 and contact_url ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+(:[0-9]+)?([/?#][^[:space:]]*)?$'),
 description text not null default '' check(length(description)<=500),
 enabled boolean not null default true,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create table omni_private.market_codes (
 id uuid primary key references omni_private.wallet_journals(id) on delete restrict,
 merchant_id uuid not null references omni_private.market_merchants(user_id) on delete restrict,
 code_hash text not null unique check(code_hash ~ '^[0-9a-f]{64}$'),
 suffix text not null check(suffix ~ '^[A-F0-9]{4}$'),
 units bigint not null check(units between 10000 and 10000000000 and units%10000=0),
 status text not null default 'active' check(status in ('active','redeemed','cancelled')),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 redeemed_by uuid references public.omni_profiles(id) on delete restrict,
 redeemed_at timestamptz,
 check((status='redeemed')=(redeemed_by is not null and redeemed_at is not null)),
 check(expires_at>created_at)
);
create index market_codes_merchant_page on omni_private.market_codes(merchant_id,created_at desc,id desc);
create table omni_private.market_attempts (
 user_id uuid primary key references public.omni_profiles(id) on delete cascade,
 window_at timestamptz not null, attempts integer not null check(attempts>0)
);
do $$declare t text;begin
 foreach t in array array['market_merchants','market_codes','market_attempts'] loop
  execute format('alter table omni_private.%I enable row level security',t);
  execute format('revoke all on omni_private.%I from public,anon,authenticated',t);
 end loop;
end;$$;

create function omni_private.market_owner() returns uuid language plpgsql stable set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Market access denied' using errcode='PT403';end if;
 return actor;
end;$$;

create function omni_private.market_merchant_save(handle text,shop_name text,contact text,details text,active boolean,expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner(); target uuid; m omni_private.market_merchants;
begin
 perform omni_private.require_email_verification();
 if handle is null or shop_name is null or length(trim(shop_name)) not between 1 and 80 or contact is null or length(contact)>500
 or contact !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+(:[0-9]+)?([/?#][^[:space:]]*)?$' or details is null or length(details)>500 or active is null
 then raise exception 'Invalid merchant' using errcode='PT400';end if;
 select id into target from public.omni_profiles p where p.handle=lower(trim(leading '@' from trim(market_merchant_save.handle))) and not p.disabled and p.profile_completed_at is not null;
 if target is null then raise exception 'Merchant user not found' using errcode='PT404';end if;
 perform pg_advisory_xact_lock(hashtextextended('merchant:'||target::text,0));
 select * into m from omni_private.market_merchants where user_id=target for update;
 if (m.user_id is not null and m.updated_at is distinct from expected) or (m.user_id is null and expected is not null) then raise exception 'Merchant changed' using errcode='PT409';end if;
 insert into omni_private.market_merchants(user_id,name,contact_url,description,enabled) values(target,trim(shop_name),contact,trim(details),active)
 on conflict(user_id) do update set name=excluded.name,contact_url=excluded.contact_url,description=excluded.description,enabled=excluded.enabled,updated_at=clock_timestamp() returning * into m;
 insert into public.omni_audit(actor_id,action,target) values(actor,'market.merchant.'||case when active then 'save' else 'disable' end,target::text);
 return jsonb_build_object('user_id',m.user_id,'updated_at',m.updated_at);
end;$$;

create function omni_private.market_allocate(request uuid,merchant uuid,amount bigint,action text,note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner(); prior omni_private.wallet_journals; stamp jsonb; journal uuid; delta bigint;
begin
 if request is null or merchant is null or amount is null or amount not between 10000 and 10000000000 or amount%10000<>0
 or action is null or action not in ('issue','revoke') or note is null or length(trim(note)) not between 1 and 300 then raise exception 'Invalid allocation' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 stamp=jsonb_build_object('kind','merchant_'||action,'merchant',merchant,'amount',amount::text,'note',trim(note));
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return prior.id;end if;
 perform omni_private.require_email_verification();
 perform 1 from omni_private.market_merchants where user_id=merchant and (enabled or action='revoke') for update;
 if not found then raise exception 'Merchant unavailable' using errcode='PT403';end if;
 if not exists(select 1 from public.omni_profiles where id=merchant and not disabled) then raise exception 'Merchant unavailable' using errcode='PT403';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||merchant::text,0));perform omni_private.wallet_ensure(merchant);
 if (select frozen from omni_private.wallet_users where user_id=merchant) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 insert into omni_private.wallet_accounts(user_id,bucket) values(merchant,'merchant'),(merchant,'codes') on conflict do nothing;
 if action='revoke' and (select balance from omni_private.wallet_accounts where user_id=merchant and bucket='merchant')<amount then raise exception 'Insufficient merchant points' using errcode='PT402';end if;
 delta=case action when 'issue' then amount else -amount end;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'merchant_'||action,stamp,amount) returning id into journal;
 perform omni_private.wallet_entry(journal,merchant,'merchant',delta);perform omni_private.wallet_entry(journal,null,'issuance',-delta);
 insert into public.omni_audit(actor_id,action,target) values(actor,'market.'||action,journal::text);
 return journal;
end;$$;

create function omni_private.market_code_create(request uuid,amount bigint,digest text,ending text,valid_days integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); prior omni_private.wallet_journals; stamp jsonb; journal uuid;
begin
 if request is null or amount is null or amount not between 10000 and 10000000000 or amount%10000<>0 or digest is null or digest !~ '^[0-9a-f]{64}$'
 or ending is null or ending !~ '^[A-F0-9]{4}$' or valid_days is null or valid_days not in (7,30,90,365) then raise exception 'Invalid code request' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 stamp=jsonb_build_object('kind','code_create','amount',amount::text,'digest',digest,'ending',ending,'days',valid_days);
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return jsonb_build_object('id',prior.id);end if;
 perform omni_private.require_email_verification();
 perform 1 from omni_private.market_merchants where user_id=actor and enabled for update;
 if not found then raise exception 'Merchant unavailable' using errcode='PT403';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||actor::text,0));perform omni_private.wallet_ensure(actor);
 if (select frozen from omni_private.wallet_users where user_id=actor) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 if coalesce((select balance from omni_private.wallet_accounts where user_id=actor and bucket='merchant'),0)<amount then raise exception 'Insufficient merchant points' using errcode='PT402';end if;
 -- Bounded active stock prevents abandoned codes growing without limit; cancelled/expired stock can be released.
 if (select count(*) from omni_private.market_codes where merchant_id=actor and status='active')>=1000 then raise exception 'Too many active codes' using errcode='PT429';end if;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'code_create',stamp,amount) returning id into journal;
 insert into omni_private.market_codes(id,merchant_id,code_hash,suffix,units,expires_at) values(journal,actor,digest,ending,amount,clock_timestamp()+make_interval(days=>valid_days));
 perform omni_private.wallet_entry(journal,actor,'merchant',-amount);perform omni_private.wallet_entry(journal,actor,'codes',amount);
 return jsonb_build_object('id',journal);
end;$$;

create function omni_private.market_code_cancel(request uuid,code_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); c omni_private.market_codes; prior omni_private.wallet_journals; journal uuid; stamp jsonb;
begin
 if request is null or code_id is null then raise exception 'Invalid code request' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 stamp=jsonb_build_object('kind','code_cancel','code',code_id);
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return prior.id;end if;
 select * into c from omni_private.market_codes where id=code_id for update;
 if not found or (c.merchant_id<>actor and omni_private.omni_role() is distinct from 'super_admin') then raise exception 'Market access denied' using errcode='PT403';end if;
 if c.status<>'active' then raise exception 'Code changed' using errcode='PT409';end if;
 perform omni_private.require_email_verification();
 perform 1 from omni_private.market_merchants where user_id=c.merchant_id for update;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||c.merchant_id::text,0));
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'code_cancel',stamp,c.units) returning id into journal;
 perform omni_private.wallet_entry(journal,c.merchant_id,'codes',-c.units);perform omni_private.wallet_entry(journal,c.merchant_id,'merchant',c.units);
 update omni_private.market_codes set status='cancelled' where id=c.id;
 insert into public.omni_audit(actor_id,action,target) values(actor,'market.code.cancel',c.id::text);
 return journal;
end;$$;

create function omni_private.market_redeem(digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); c omni_private.market_codes; journal uuid; tries integer; uid uuid;
begin
 -- Return failures, rather than raising, so failed attempts remain rate limited after commit.
 insert into omni_private.market_attempts(user_id,window_at,attempts) values(actor,clock_timestamp(),1)
 on conflict(user_id) do update set attempts=case when market_attempts.window_at<clock_timestamp()-interval '10 minutes' then 1 else least(market_attempts.attempts+1,11) end,
 window_at=case when market_attempts.window_at<clock_timestamp()-interval '10 minutes' then clock_timestamp() else market_attempts.window_at end returning attempts into tries;
 if tries>10 then return jsonb_build_object('ok',false,'error','rate_limited');end if;
 if digest is null or digest !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'error','invalid_code');end if;
 select * into c from omni_private.market_codes where code_hash=digest for update;
 if not found then return jsonb_build_object('ok',false,'error','invalid_code');end if;
 if c.status='redeemed' and c.redeemed_by=actor then return jsonb_build_object('ok',true,'units',c.units::text,'id',c.id,'already_redeemed',true);end if;
 if c.status<>'active' or c.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','invalid_code');end if;
 -- Delisting stops new sales. Previously issued codes remain redeemable unless individually cancelled.
 perform 1 from omni_private.market_merchants where user_id=c.merchant_id for update;
 if c.merchant_id=actor then return jsonb_build_object('ok',false,'error','own_code');end if;
 for uid in select v from unnest(array[actor,c.merchant_id]) v order by v loop
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||uid::text,0));perform omni_private.wallet_ensure(uid);
 end loop;
 if exists(select 1 from omni_private.wallet_users where user_id in (actor,c.merchant_id) and frozen)
 or exists(select 1 from public.omni_profiles where id=c.merchant_id and disabled) then return jsonb_build_object('ok',false,'error','restricted');end if;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,c.id,'code_redeem',jsonb_build_object('code',c.id,'merchant',c.merchant_id),c.units) returning id into journal;
 perform omni_private.wallet_entry(journal,c.merchant_id,'codes',-c.units);perform omni_private.wallet_entry(journal,actor,'purchased',c.units);
 update omni_private.market_codes set status='redeemed',redeemed_by=actor,redeemed_at=clock_timestamp() where id=c.id;
 return jsonb_build_object('ok',true,'units',c.units::text,'id',c.id,'already_redeemed',false);
end;$$;

create function omni_private.market_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 return jsonb_build_object('merchant',(select to_jsonb(m)||jsonb_build_object(
 'available',coalesce((select balance::text from omni_private.wallet_accounts where user_id=actor and bucket='merchant'),'0'),
 'reserved',coalesce((select balance::text from omni_private.wallet_accounts where user_id=actor and bucket='codes'),'0')) from omni_private.market_merchants m where m.user_id=actor),
 'frozen',coalesce((select frozen from omni_private.wallet_users where user_id=actor),false),
 'summary',case when omni_private.omni_role()='super_admin' then jsonb_build_object(
 'issued',coalesce((select sum(units)::text from omni_private.wallet_journals where kind='merchant_issue'),'0'),
 'revoked',coalesce((select sum(units)::text from omni_private.wallet_journals where kind='merchant_revoke'),'0'),
 'available',coalesce((select sum(balance)::text from omni_private.wallet_accounts where bucket='merchant'),'0'),
 'reserved',coalesce((select sum(balance)::text from omni_private.wallet_accounts where bucket='codes'),'0'),
 'redeemed',coalesce((select sum(units)::text from omni_private.wallet_journals where kind='code_redeem'),'0')) else null end);
end;$$;

create function omni_private.market_list(view_kind text default 'market',before_id uuid default null,merchant uuid default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); is_owner boolean:=omni_private.omni_role()='super_admin';begin
 if view_kind is null or view_kind not in ('market','merchants','codes','allocations') then raise exception 'Invalid market view' using errcode='PT400';end if;
 if view_kind in ('merchants','allocations') and not is_owner then raise exception 'Market access denied' using errcode='PT403';end if;
 if view_kind in ('market','merchants') then
  return query select jsonb_build_object('id',m.user_id,'user_id',m.user_id,'name',m.name,'contact_url',m.contact_url,'description',m.description,'enabled',m.enabled,
   'updated_at',m.updated_at,'display_name',p.display_name,'handle',p.handle,'avatar_key',p.avatar_key)||
   case when view_kind='merchants' then jsonb_build_object('available',coalesce(a.balance,0)::text,'reserved',coalesce(b.balance,0)::text) else '{}'::jsonb end
  from omni_private.market_merchants m join public.omni_profiles p on p.id=m.user_id
  left join omni_private.wallet_accounts a on a.user_id=m.user_id and a.bucket='merchant'
  left join omni_private.wallet_accounts b on b.user_id=m.user_id and b.bucket='codes'
  where (view_kind='merchants' or (m.enabled and not p.disabled and not coalesce((select frozen from omni_private.wallet_users where user_id=m.user_id),false)))
  and (before_id is null or m.user_id>before_id) order by m.user_id limit 21;
 elsif view_kind='codes' then
  if merchant is not null and merchant<>actor and not is_owner then raise exception 'Market access denied' using errcode='PT403';end if;
  return query select jsonb_build_object('id',c.id,'suffix',c.suffix,'units',c.units::text,'status',case when c.status='active' and c.expires_at<=now() then 'expired' else c.status end,
   'expires_at',c.expires_at,'created_at',c.created_at,'redeemed_at',c.redeemed_at)
  from omni_private.market_codes c where c.merchant_id=coalesce(merchant,actor)
   and (before_id is null or (c.created_at,c.id)<(select b.created_at,b.id from omni_private.market_codes b where b.id=before_id and b.merchant_id=coalesce(merchant,actor)))
  order by c.created_at desc,c.id desc limit 21;
 else
  return query select jsonb_build_object('id',j.id,'kind',j.kind,'units',j.units::text,'note',j.fingerprint->>'note','created_at',j.created_at,'merchant_name',m.name,'actor_name',p.display_name)
  from omni_private.wallet_journals j join omni_private.market_merchants m on m.user_id=(j.fingerprint->>'merchant')::uuid join public.omni_profiles p on p.id=j.actor_id
  where j.kind in ('merchant_issue','merchant_revoke') and (merchant is null or m.user_id=merchant)
   and (before_id is null or j.sequence<(select sequence from omni_private.wallet_journals where id=before_id)) order by j.sequence desc limit 21;
 end if;
end;$$;

create function public.omni_market_merchant_save(handle text,shop_name text,contact text,details text,active boolean,expected timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$select omni_private.market_merchant_save(handle,shop_name,contact,details,active,expected);$$;
create function public.omni_market_allocate(request uuid,merchant uuid,amount bigint,action text,note text) returns uuid language sql security invoker set search_path='' as $$select omni_private.market_allocate(request,merchant,amount,action,note);$$;
create function public.omni_market_code_create(request uuid,amount bigint,digest text,ending text,valid_days integer) returns jsonb language sql security invoker set search_path='' as $$select omni_private.market_code_create(request,amount,digest,ending,valid_days);$$;
create function public.omni_market_code_cancel(request uuid,code_id uuid) returns uuid language sql security invoker set search_path='' as $$select omni_private.market_code_cancel(request,code_id);$$;
create function public.omni_market_redeem(digest text) returns jsonb language sql security invoker set search_path='' as $$select omni_private.market_redeem(digest);$$;
create function public.omni_market_snapshot() returns jsonb language sql security invoker set search_path='' as $$select omni_private.market_snapshot();$$;
create function public.omni_market_list(view_kind text default 'market',before_id uuid default null,merchant uuid default null) returns setof jsonb language sql security invoker set search_path='' as $$select omni_private.market_list(view_kind,before_id,merchant);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='omni_private' and p.proname like 'market_%') or (n.nspname='public' and p.proname like 'omni_market_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname<>'market_owner' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$$;
commit;
