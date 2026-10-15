begin;
-- Payment rails stay closed until a verified deposit allocator and payout verifier exist.
-- All monetary values are integer micro-USDT (6 decimals): 10,000 units = 1 point.
create table omni_private.wallet_settings (
 id boolean primary key default true check(id),
 deposits_enabled boolean not null default false,
 tipping_enabled boolean not null default false,
 withdrawals_enabled boolean not null default false,
 withdrawal_min_units bigint not null default 1000000 check(withdrawal_min_units between 1 and 10000000000000),
 withdrawal_fee_bps integer not null default 100 check(withdrawal_fee_bps between 0 and 10000),
 check(not withdrawals_enabled or (withdrawal_min_units is not null and withdrawal_fee_bps is not null and withdrawal_fee_bps<10000))
);
insert into omni_private.wallet_settings(id) values(true);
create table omni_private.wallet_users (
 user_id uuid primary key references public.omni_profiles(id) on delete restrict,
 frozen boolean not null default false
);
create table omni_private.wallet_accounts (
 id bigint generated always as identity primary key,
 user_id uuid references omni_private.wallet_users(user_id) on delete restrict,
 bucket text not null check(bucket in ('purchased','earned','held','reserve','fees')),
 balance bigint not null default 0,
 unique nulls not distinct(user_id,bucket),
 check((user_id is null and bucket in ('reserve','fees')) or (user_id is not null and bucket in ('purchased','earned','held') and balance between 0 and 10000000000000000))
);
insert into omni_private.wallet_accounts(bucket) values('reserve'),('fees');
create table omni_private.wallet_journals (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 actor_id uuid not null references public.omni_profiles(id) on delete restrict,
 request_id uuid not null,
 kind text not null check(kind in ('deposit','tip','withdraw_hold','withdraw_cancel','withdraw_reject','withdraw_paid')),
 fingerprint jsonb not null,
 units bigint not null check(units between 1 and 10000000000000),
 created_at timestamptz not null default clock_timestamp(),
 transaction_id bigint not null default txid_current(),
 unique(actor_id,request_id)
);
create table omni_private.wallet_entries (
 journal_id uuid not null references omni_private.wallet_journals(id) on delete restrict,
 account_id bigint not null references omni_private.wallet_accounts(id) on delete restrict,
 amount bigint not null check(amount<>0 and amount between -10000000000000 and 10000000000000),
 primary key(journal_id,account_id)
);
create index wallet_entries_account on omni_private.wallet_entries(account_id,journal_id);
create table omni_private.wallet_deposits (
 journal_id uuid primary key references omni_private.wallet_journals(id) on delete restrict,
 allocation_id uuid not null unique,
 tx_hash text not null check(tx_hash ~ '^[0-9a-f]{64}$'),
 event_index integer not null check(event_index>=0),
 amount_micro_usdt bigint not null check(amount_micro_usdt>0),
 proof_reference text not null check(length(proof_reference) between 1 and 300),
 unique(tx_hash,event_index)
);
create table omni_private.wallet_withdrawals (
 id uuid primary key references omni_private.wallet_journals(id) on delete restrict,
 user_id uuid not null references omni_private.wallet_users(user_id) on delete restrict,
 units bigint not null check(units>0),
 fee_units bigint not null check(fee_units>=0 and fee_units<units),
 destination text not null check(destination ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
 status text not null default 'pending' check(status in ('pending','processing','cancelled','rejected','paid')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 tx_hash text check(tx_hash ~ '^[0-9a-f]{64}$'),
 event_index integer check(event_index>=0),
 unique(tx_hash,event_index),
 check((status='paid')=(tx_hash is not null and event_index is not null))
);
create index wallet_withdrawals_user on omni_private.wallet_withdrawals(user_id,created_at desc);
create index wallet_withdrawals_queue on omni_private.wallet_withdrawals(status,created_at,id);

-- Private schema is not exposed through PostgREST. API roles receive no table privileges.
do $$declare t text;begin
 foreach t in array array['wallet_settings','wallet_users','wallet_accounts','wallet_journals','wallet_entries','wallet_deposits','wallet_withdrawals'] loop
  execute format('alter table omni_private.%I enable row level security',t);
  execute format('revoke all on omni_private.%I from public,anon,authenticated',t);
 end loop;
end;$$;

create function omni_private.wallet_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Wallet history is immutable' using errcode='PT403';end;$$;
create trigger wallet_journals_immutable before update or delete on omni_private.wallet_journals for each row execute function omni_private.wallet_immutable();
create trigger wallet_entries_immutable before update or delete on omni_private.wallet_entries for each row execute function omni_private.wallet_immutable();
create trigger wallet_deposits_immutable before update or delete on omni_private.wallet_deposits for each row execute function omni_private.wallet_immutable();

create function omni_private.wallet_apply_entry() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from omni_private.wallet_journals where id=new.journal_id and transaction_id=txid_current()) then
  raise exception 'Journal already sealed' using errcode='PT409';
 end if;
 update omni_private.wallet_accounts set balance=balance+new.amount where id=new.account_id;
 return new;
end;$$;
create trigger wallet_entry_apply before insert on omni_private.wallet_entries for each row execute function omni_private.wallet_apply_entry();
create function omni_private.wallet_check_balance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select count(*)<2 or coalesce(sum(amount),1)<>0 from omni_private.wallet_entries where journal_id=new.id) then
  raise exception 'Unbalanced wallet journal' using errcode='23514';
 end if;return null;
end;$$;
create constraint trigger wallet_journal_balanced after insert on omni_private.wallet_journals deferrable initially deferred for each row execute function omni_private.wallet_check_balance();

create function omni_private.wallet_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or omni_private.omni_role() is null or not exists(select 1 from public.omni_profiles where id=actor and profile_completed_at is not null) then
  raise exception 'Wallet access denied' using errcode='PT403';end if;return actor;
end;$$;
create function omni_private.wallet_ensure(target uuid) returns void language plpgsql set search_path='' as $$
begin
 insert into omni_private.wallet_users(user_id) values(target) on conflict do nothing;
 insert into omni_private.wallet_accounts(user_id,bucket) values(target,'purchased'),(target,'earned'),(target,'held') on conflict do nothing;
end;$$;
create function omni_private.wallet_require_mfa() returns void language plpgsql stable set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')<>'aal2' then
  raise exception 'Wallet MFA required' using errcode='PT401';
 end if;
end;$$;
create function omni_private.wallet_entry(journal uuid,owner_id uuid,account_bucket text,delta bigint) returns void language plpgsql set search_path='' as $$
begin
 if delta=0 then return;end if;
 insert into omni_private.wallet_entries(journal_id,account_id,amount)
 select journal,id,delta from omni_private.wallet_accounts where user_id is not distinct from owner_id and bucket=account_bucket;
 if not found then raise exception 'Wallet account missing';end if;
end;$$;

create function omni_private.wallet_tron_address(address text) returns boolean language plpgsql immutable set search_path='' as $$
declare alphabet constant text:='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; value numeric:=0;
 bytes bytea:=decode(repeat('00',25),'hex'); i integer;
begin
 if address is null or address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then return false;end if;
 for i in 1..34 loop value=value*58+strpos(alphabet,substr(address,i,1))-1;end loop;
 for i in reverse 24..0 loop bytes=set_byte(bytes,i,mod(value,256)::integer);value=div(value,256);end loop;
 return value=0 and get_byte(bytes,0)=65 and substring(bytes from 22 for 4)=substring(sha256(sha256(substring(bytes from 1 for 21))) from 1 for 4);
end;$$;
alter table omni_private.wallet_withdrawals add constraint wallet_destination_checksum check(omni_private.wallet_tron_address(destination));

create function omni_private.wallet_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); result jsonb;
begin
 select jsonb_build_object('purchased',coalesce(max(a.balance) filter(where a.bucket='purchased'),0)::text,
 'earned',coalesce(max(a.balance) filter(where a.bucket='earned'),0)::text,'held',coalesce(max(a.balance) filter(where a.bucket='held'),0)::text)
 into result from omni_private.wallet_accounts a where a.user_id=actor;
 return result||(select jsonb_build_object('deposits_enabled',s.deposits_enabled,'tipping_enabled',s.tipping_enabled,
 'withdrawals_enabled',s.withdrawals_enabled,'withdrawal_min_units',s.withdrawal_min_units::text,'withdrawal_fee_bps',s.withdrawal_fee_bps::text,
 'frozen',coalesce((select frozen from omni_private.wallet_users where user_id=actor),false)) from omni_private.wallet_settings s where id);
end;$$;

-- The author is resolved from the published content in the database, never supplied by the client.
create function omni_private.wallet_tip(request uuid,article uuid,amount bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); recipient uuid; prior omni_private.wallet_journals; stamp jsonb;
 journal uuid; bought bigint; income bigint; from_bought bigint; uid uuid;
begin
 if request is null or amount is null or amount not between 1 and 10000000000000 then raise exception 'Invalid amount' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 stamp=jsonb_build_object('kind','tip','article',article,'amount',amount::text);
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return prior.id;end if;
 if not (select tipping_enabled from omni_private.wallet_settings where id) then raise exception 'Wallet paused' using errcode='PT503';end if;
 select author_id into recipient from public.omni_articles where id=article and status='published' and not moderated;
 if recipient is null or recipient=actor or not exists(select 1 from public.omni_profiles where id=recipient and not disabled) then raise exception 'Recipient unavailable' using errcode='PT403';end if;
 -- Canonical user lock order prevents opposing tips from deadlocking, even during account creation.
 for uid in select v from unnest(array[actor,recipient]) v order by v loop
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||uid::text,0));perform omni_private.wallet_ensure(uid);
 end loop;
 if exists(select 1 from omni_private.wallet_users where user_id in (actor,recipient) and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 select balance into bought from omni_private.wallet_accounts where user_id=actor and bucket='purchased';
 select balance into income from omni_private.wallet_accounts where user_id=actor and bucket='earned';
 if bought+income<amount then raise exception 'Insufficient points' using errcode='PT402';end if;
 from_bought=least(bought,amount);
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'tip',stamp,amount) returning id into journal;
 perform omni_private.wallet_entry(journal,actor,'purchased',-from_bought);
 perform omni_private.wallet_entry(journal,actor,'earned',-(amount-from_bought));
 perform omni_private.wallet_entry(journal,recipient,'earned',amount);
 return journal;
end;$$;

create function omni_private.wallet_withdraw(request uuid,amount bigint,address text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); prior omni_private.wallet_journals; stamp jsonb; journal uuid; config omni_private.wallet_settings;
begin
 if request is null or amount is null or amount not between 1 and 10000000000000 or not omni_private.wallet_tron_address(address) then raise exception 'Invalid withdrawal' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 stamp=jsonb_build_object('kind','withdraw_hold','address',address,'amount',amount::text);
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.fingerprint<>stamp then raise exception 'Wallet request changed' using errcode='PT409';end if;return prior.id;end if;
 select * into config from omni_private.wallet_settings where id;
 if not config.withdrawals_enabled then raise exception 'Wallet paused' using errcode='PT503';end if;
 perform omni_private.wallet_require_mfa();
 if amount<config.withdrawal_min_units then raise exception 'Below withdrawal minimum' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||actor::text,0));perform omni_private.wallet_ensure(actor);
 if (select frozen from omni_private.wallet_users where user_id=actor) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 if (select balance from omni_private.wallet_accounts where user_id=actor and bucket='earned')<amount then raise exception 'Insufficient earned points' using errcode='PT402';end if;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'withdraw_hold',stamp,amount) returning id into journal;
 perform omni_private.wallet_entry(journal,actor,'earned',-amount);perform omni_private.wallet_entry(journal,actor,'held',amount);
 insert into omni_private.wallet_withdrawals(id,user_id,units,fee_units,destination) values(journal,actor,amount,div(amount::numeric*config.withdrawal_fee_bps+9999,10000)::bigint,address);
 return journal;
end;$$;

create function omni_private.wallet_review(withdrawal uuid,action text,expected text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor(); row_value omni_private.wallet_withdrawals; journal uuid; next_status text; kind text;
begin
 if action is null or action not in ('cancel','reject','process') or expected is distinct from 'pending' then raise exception 'Invalid transition' using errcode='PT400';end if;
 select * into row_value from omni_private.wallet_withdrawals where id=withdrawal for update;
 if not found or (action='cancel' and row_value.user_id<>actor) or (action<>'cancel' and omni_private.omni_role() is distinct from 'super_admin') then raise exception 'Wallet access denied' using errcode='PT403';end if;
 next_status=case action when 'cancel' then 'cancelled' when 'reject' then 'rejected' else 'processing' end;
 if row_value.status=next_status then return to_jsonb(row_value);end if;
 if row_value.status<>expected then raise exception 'Withdrawal changed' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||row_value.user_id::text,0));
 if action='process' then
  perform omni_private.wallet_require_mfa();
  if not (select withdrawals_enabled from omni_private.wallet_settings where id) or (select frozen from omni_private.wallet_users where user_id=row_value.user_id)
  or not exists(select 1 from public.omni_profiles where id=row_value.user_id and not disabled) then raise exception 'Wallet paused' using errcode='PT503';end if;
 else
  kind=case action when 'cancel' then 'withdraw_cancel' else 'withdraw_reject' end;
  insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,gen_random_uuid(),kind,jsonb_build_object('withdrawal',withdrawal),row_value.units) returning id into journal;
  perform omni_private.wallet_entry(journal,row_value.user_id,'held',-row_value.units);perform omni_private.wallet_entry(journal,row_value.user_id,'earned',row_value.units);
 end if;
 update omni_private.wallet_withdrawals set status=next_status,updated_at=clock_timestamp() where id=withdrawal returning * into row_value;
 insert into public.omni_audit(actor_id,action,target) values(actor,'wallet.withdraw.'||action,withdrawal::text);
 return to_jsonb(row_value);
end;$$;

create function omni_private.wallet_history(before_sequence bigint default null) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 return query select jsonb_build_object('id',j.id,'sequence',j.sequence::text,'kind',j.kind,'units',j.units::text,'created_at',j.created_at,
 'delta',(select sum(e.amount)::text from omni_private.wallet_entries e join omni_private.wallet_accounts a on a.id=e.account_id where e.journal_id=j.id and a.user_id=actor))
 from omni_private.wallet_journals j where (before_sequence is null or j.sequence<before_sequence)
 and exists(select 1 from omni_private.wallet_entries e join omni_private.wallet_accounts a on a.id=e.account_id where e.journal_id=j.id and a.user_id=actor)
 order by j.sequence desc limit 21;
end;$$;
create function omni_private.wallet_requests(before_id uuid default null,admin_queue boolean default false) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.wallet_actor();begin
 if admin_queue and omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;
 return query select to_jsonb(w)||jsonb_build_object('units',w.units::text,'fee_units',w.fee_units::text,'display_name',p.display_name,'handle',p.handle)
 from omni_private.wallet_withdrawals w join public.omni_profiles p on p.id=w.user_id
 where (admin_queue or w.user_id=actor) and (not admin_queue or w.status in ('pending','processing'))
 and (before_id is null or (w.created_at,w.id)<(select r.created_at,r.id from omni_private.wallet_withdrawals r where r.id=before_id and (admin_queue or r.user_id=actor)))
 order by w.created_at desc,w.id desc limit 21;
end;$$;

-- Trusted-operator ingestion only. No grant to browser/API roles, including service_role.
-- A rail must verify finalized TRON USDt Transfer AND allocation ownership before calling.
create function omni_private.wallet_credit_verified(beneficiary uuid,allocation uuid,tx text,event_no integer,micro_usdt bigint,proof text,accept_assigned boolean default false) returns uuid language plpgsql set search_path='' as $$
declare journal uuid; prior record; amount bigint;
begin
 if beneficiary is null or allocation is null or tx is null or tx !~ '^[0-9a-f]{64}$' or event_no is null or event_no<0 or micro_usdt is null or micro_usdt<=0 or micro_usdt>10000000000000 or proof is null or length(proof) not between 1 and 300 then raise exception 'Invalid verified receipt';end if;
 perform pg_advisory_xact_lock(hashtextextended('receipt:'||tx||':'||event_no::text,0));
 if exists(select 1 from omni_private.wallet_withdrawals where tx_hash=tx and event_index=event_no) then raise exception 'Receipt already used';end if;
 select d.*,j.actor_id into prior from omni_private.wallet_deposits d join omni_private.wallet_journals j on j.id=d.journal_id where d.tx_hash=tx and d.event_index=event_no;
 if found then
  if prior.actor_id<>beneficiary or prior.allocation_id<>allocation or prior.amount_micro_usdt<>micro_usdt then raise exception 'Deposit already allocated' using errcode='PT409';end if;return prior.journal_id;
 end if;
 if not accept_assigned and not (select deposits_enabled from omni_private.wallet_settings where id) then raise exception 'Wallet paused' using errcode='PT503';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||beneficiary::text,0));perform omni_private.wallet_ensure(beneficiary);amount=micro_usdt;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(beneficiary,allocation,'deposit',jsonb_build_object('tx',tx,'event',event_no),amount) returning id into journal;
 insert into omni_private.wallet_deposits(journal_id,allocation_id,tx_hash,event_index,amount_micro_usdt,proof_reference) values(journal,allocation,tx,event_no,micro_usdt,proof);
 perform omni_private.wallet_entry(journal,beneficiary,'purchased',amount);perform omni_private.wallet_entry(journal,null,'reserve',-amount);
 return journal;
end;$$;

-- Settlement is separate from the admin's processing claim. Unknown broadcasts keep holds.
create function omni_private.wallet_settle_verified(withdrawal uuid,tx text,event_no integer,net_micro_usdt bigint) returns void language plpgsql set search_path='' as $$
declare w omni_private.wallet_withdrawals; journal uuid;begin
 select * into w from omni_private.wallet_withdrawals where id=withdrawal for update;
 if not found or tx is null or tx !~ '^[0-9a-f]{64}$' or event_no is null or event_no<0 or net_micro_usdt is distinct from (w.units-w.fee_units) then raise exception 'Invalid settlement';end if;
 if w.status='paid' and w.tx_hash=tx and w.event_index=event_no then return;end if;
 if w.status<>'processing' then raise exception 'Withdrawal changed' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('receipt:'||tx||':'||event_no::text,0));
 if exists(select 1 from omni_private.wallet_deposits where tx_hash=tx and event_index=event_no) then raise exception 'Receipt already used';end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet:'||w.user_id::text,0));
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(w.user_id,gen_random_uuid(),'withdraw_paid',jsonb_build_object('withdrawal',withdrawal,'tx',tx,'event',event_no),w.units) returning id into journal;
 perform omni_private.wallet_entry(journal,w.user_id,'held',-w.units);
 perform omni_private.wallet_entry(journal,null,'reserve',w.units-w.fee_units);perform omni_private.wallet_entry(journal,null,'fees',w.fee_units);
 update omni_private.wallet_withdrawals set status='paid',tx_hash=tx,event_index=event_no,updated_at=clock_timestamp() where id=withdrawal;
end;$$;

create function omni_private.wallet_admin_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform omni_private.wallet_actor();if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Wallet access denied' using errcode='PT403';end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from omni_private.wallet_settings s where id),
 'accounts',(select count(*) from omni_private.wallet_users),'journals',(select count(*) from omni_private.wallet_journals),
 'purchased',(select coalesce(sum(balance),0)::text from omni_private.wallet_accounts where bucket='purchased'),
 'earned',(select coalesce(sum(balance),0)::text from omni_private.wallet_accounts where bucket='earned'),
 'held',(select coalesce(sum(balance),0)::text from omni_private.wallet_accounts where bucket='held'),
 'balanced',(select coalesce(sum(balance),0)=0 from omni_private.wallet_accounts));
end;$$;

-- Invoker wrappers are the entire client surface. No client can credit or settle funds.
create function public.omni_wallet_snapshot() returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_snapshot();$$;
create function public.omni_wallet_tip(request uuid,article uuid,amount bigint) returns uuid language sql security invoker set search_path='' as $$select omni_private.wallet_tip(request,article,amount);$$;
create function public.omni_wallet_withdraw(request uuid,amount bigint,address text) returns uuid language sql security invoker set search_path='' as $$select omni_private.wallet_withdraw(request,amount,address);$$;
create function public.omni_wallet_review(withdrawal uuid,action text,expected text) returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_review(withdrawal,action,expected);$$;
create function public.omni_wallet_history(before_sequence bigint default null) returns setof jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_history(before_sequence);$$;
create function public.omni_wallet_requests(before_id uuid default null,admin_queue boolean default false) returns setof jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_requests(before_id,admin_queue);$$;
create function public.omni_wallet_admin_summary() returns jsonb language sql security invoker set search_path='' as $$select omni_private.wallet_admin_summary();$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='omni_private' and p.proname like 'wallet_%') or (n.nspname='public' and p.proname like 'omni_wallet_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('wallet_snapshot','wallet_tip','wallet_withdraw','wallet_review','wallet_history','wallet_requests','wallet_admin_summary') or f.nspname='public' then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end;$$;
commit;
