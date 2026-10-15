begin;
-- Keep the retired merchant issuance liability intact; inventory is a distinct asset bucket.
alter table omni_private.wallet_accounts drop constraint wallet_accounts_bucket_check;
alter table omni_private.wallet_accounts drop constraint wallet_accounts_check;
alter table omni_private.wallet_accounts add constraint wallet_accounts_bucket_check check(bucket in('purchased','earned','held','reserve','fees','merchant','codes','issuance','collateral','escrow','inventory'));
alter table omni_private.wallet_accounts add constraint wallet_accounts_check check(
 (user_id is null and bucket in('reserve','fees','issuance')) or
 (user_id is null and bucket='inventory' and balance between 0 and 10000000000000000) or
 (user_id is not null and bucket in('purchased','earned','held','merchant','codes','collateral','escrow') and balance between 0 and 10000000000000000));
insert into omni_private.wallet_accounts(bucket) values('inventory');
alter table omni_private.wallet_journals drop constraint wallet_journals_kind_check;
alter table omni_private.wallet_journals add constraint wallet_journals_kind_check check(kind in('deposit','tip','withdraw_hold','withdraw_cancel','withdraw_reject','withdraw_paid','merchant_issue','merchant_revoke','code_create','code_cancel','code_redeem','c2c_hold','c2c_release','c2c_cancel','collateral_refund','collateral_lock','admin_adjust','points_issue','points_grant'));
create index teamcn_points_journals on omni_private.wallet_journals(sequence desc) where kind in('points_issue','points_grant');

create function omni_private.points_admin_action(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner();amount bigint;target uuid;note text:=trim(payload->>'note');prior omni_private.wallet_journals;stamp jsonb;j uuid;stock bigint;
begin
 perform omni_private.require_email_verification();
 if request is null or action is null or action not in('issue','grant') or payload is null or jsonb_typeof(payload)<>'object' or note is null or length(note) not between 3 and 500 or coalesce(payload->>'amount','')!~'^[0-9]{1,14}$' then raise exception 'Invalid issuance request' using errcode='PT400';end if;
 amount=(payload->>'amount')::bigint;
 if amount not between 1 and 10000000000000 then raise exception 'Invalid amount' using errcode='PT400';end if;
 if action='grant' then target=(payload->>'user_id')::uuid;if target is null then raise exception 'Recipient required' using errcode='PT400';end if;
 elsif payload->>'user_id' is not null then raise exception 'Unexpected recipient' using errcode='PT400';end if;
 stamp=jsonb_build_object('action',action,'amount',amount::text,'user_id',target,'note',note);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 select * into prior from omni_private.wallet_journals where actor_id=actor and request_id=request;
 if found then if prior.kind<>('points_'||action) or prior.fingerprint<>stamp then raise exception 'Request changed' using errcode='PT409';end if;return jsonb_build_object('ok',true,'id',prior.id);end if;
 if action='grant' then
  perform 1 from public.omni_profiles where id=target and not disabled and profile_completed_at is not null for share;
  if not found then raise exception 'Recipient unavailable' using errcode='PT403';end if;
  perform omni_private.c2c_lock(target);
  if exists(select 1 from omni_private.wallet_users where user_id=target and frozen) then raise exception 'Wallet frozen' using errcode='PT403';end if;
 end if;
 select balance into strict stock from omni_private.wallet_accounts where user_id is null and bucket='inventory' for update;
 if action='grant' and stock<amount then raise exception 'Insufficient inventory' using errcode='PT402';end if;
 if action='issue' and stock>10000000000000000-amount then raise exception 'Inventory capacity exceeded' using errcode='PT400';end if;
 insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'points_'||action,stamp,amount) returning id into j;
 if action='issue' then
  perform omni_private.wallet_entry(j,null,'inventory',amount);
  perform omni_private.wallet_entry(j,null,'reserve',-amount);
 else
  perform omni_private.wallet_entry(j,null,'inventory',-amount);
  perform omni_private.wallet_entry(j,target,'purchased',amount);
 end if;
 insert into public.omni_audit(actor_id,action,target) values(actor,'points:'||action,jsonb_build_object('journal',j,'request',request,'user',target,'units',amount::text,'reason',note)::text);
 return jsonb_build_object('ok',true,'id',j);
end;$$;
create function public.omni_points_admin_action(request uuid,action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select omni_private.points_admin_action(request,action,payload);$$;

create function omni_private.points_admin_read(target_handle text default '',before_sequence bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner();rows jsonb;
begin
 if length(coalesce(target_handle,''))>40 or before_sequence<=0 then raise exception 'Invalid query' using errcode='PT400';end if;
 select coalesce(jsonb_agg(row_to_json(x) order by sequence::bigint desc),'[]') into rows from
  (select j.id,j.sequence::text,j.kind,j.units::text,j.created_at,j.fingerprint->>'note' note,p.handle actor_handle,r.handle recipient_handle
   from omni_private.wallet_journals j join public.omni_profiles p on p.id=j.actor_id left join public.omni_profiles r on r.id=(j.fingerprint->>'user_id')::uuid
   where j.kind in('points_issue','points_grant') and (before_sequence is null or j.sequence<before_sequence) order by j.sequence desc limit 31) x;
 return jsonb_build_object(
  'available',(select balance::text from omni_private.wallet_accounts where user_id is null and bucket='inventory'),
  'issued',(select coalesce(sum(units),0)::text from omni_private.wallet_journals where kind='points_issue'),
  'distributed',(select coalesce(sum(units),0)::text from omni_private.wallet_journals where kind='points_grant'),
  'recipient',(select jsonb_build_object('id',p.id,'handle',p.handle,'display_name',p.display_name,'eligible',not p.disabled and p.profile_completed_at is not null and not coalesce(w.frozen,false)) from public.omni_profiles p left join omni_private.wallet_users w on w.user_id=p.id where lower(p.handle)=lower(trim(leading '@' from trim(target_handle)))),
  'rows',rows);
end;$$;
create function public.omni_points_admin_read(target_handle text default '',before_sequence bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.points_admin_read(target_handle,before_sequence);$$;
revoke all on function omni_private.points_admin_action(uuid,text,jsonb),public.omni_points_admin_action(uuid,text,jsonb),omni_private.points_admin_read(text,bigint),public.omni_points_admin_read(text,bigint) from public,anon,authenticated;
grant execute on function omni_private.points_admin_action(uuid,text,jsonb),public.omni_points_admin_action(uuid,text,jsonb),omni_private.points_admin_read(text,bigint),public.omni_points_admin_read(text,bigint) to authenticated;
create or replace function omni_private.identity_admin_action(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner();uid uuid;old omni_private.wallet_journals;j uuid;delta bigint;bucket text;note text:=trim(payload->>'note');r omni_private.identity_rules;v jsonb;previous bigint:=-1;position integer:=0;
begin
 perform omni_private.require_email_verification();if request is null or note is null or length(note) not between 3 and 500 then raise exception 'Reason required' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 if action='adjust' then
  uid=(payload->>'user_id')::uuid;delta=(payload->>'delta')::bigint;bucket=payload->>'bucket';
  if delta is null or abs(delta) not between 1 and 10000000000000 or bucket not in('purchased','earned') or bucket is null or not exists(select 1 from public.omni_profiles where id=uid) then raise exception 'Invalid adjustment' using errcode='PT400';end if;
  select * into old from omni_private.wallet_journals where actor_id=actor and request_id=request;
  if found and old.kind='admin_adjust' then if old.fingerprint<>payload then raise exception 'Request changed' using errcode='PT409';end if;return jsonb_build_object('ok',true,'id',old.id);end if;
  if delta>0 then
   if bucket<>'purchased' then raise exception 'Grants enter purchased points only' using errcode='PT400';end if;
   return omni_private.points_admin_action(request,'grant',jsonb_build_object('user_id',uid,'amount',delta::text,'note',note));
  end if;
  if old.id is not null then raise exception 'Request changed' using errcode='PT409';end if;
  perform omni_private.c2c_lock(uid);if delta<0 and omni_private.c2c_balance(uid,bucket)<-delta then raise exception 'Insufficient points' using errcode='PT402';end if;
  insert into omni_private.wallet_journals(actor_id,request_id,kind,fingerprint,units) values(actor,request,'admin_adjust',payload,abs(delta)) returning id into j;
  perform omni_private.wallet_entry(j,uid,bucket,delta);perform omni_private.wallet_entry(j,null,'reserve',-delta);
 elsif action='member' then
  uid=(payload->>'user_id')::uuid;perform omni_private.c2c_lock(uid);
  if (payload->>'expected')::timestamptz is distinct from (select updated_at from omni_private.identity_members where user_id=uid) then raise exception 'Member changed' using errcode='PT409';end if;
  insert into omni_private.identity_members(user_id,level_override,title_override) values(uid,(payload->>'level_override')::smallint,(payload->>'title_override')::smallint) on conflict(user_id) do update set level_override=excluded.level_override,title_override=excluded.title_override,updated_at=clock_timestamp();
  if payload ? 'frozen' then update omni_private.wallet_users set frozen=(payload->>'frozen')::boolean where user_id=uid;end if;
 elsif action='rules' then
  select * into r from omni_private.identity_rules where id for update;
  if (payload->>'expected')::timestamptz is distinct from r.updated_at then raise exception 'Rules changed' using errcode='PT409';end if;
  if payload->>'basis' not in('received','sent','both') or payload->>'basis' is null or jsonb_array_length(payload->'levels')<>60 or jsonb_typeof(payload->'levels') is distinct from 'array' or jsonb_array_length(payload->'titles')<>11 or jsonb_typeof(payload->'titles') is distinct from 'array' then raise exception 'Invalid rules' using errcode='PT400';end if;
  -- Deferrable uniqueness is unnecessary: replace all level rows inside this transaction.
  delete from omni_private.identity_levels;
  for v in select value from jsonb_array_elements(payload->'levels') loop position=position+1;if (v->>'level')::integer<>position or (v->>'minimum')::bigint<=previous or (position=1 and (v->>'minimum')::bigint<>0) then raise exception 'Invalid thresholds' using errcode='PT400';end if;previous=(v->>'minimum')::bigint;insert into omni_private.identity_levels values(position,previous);end loop;
  previous=-1;position=0;
  for v in select value from jsonb_array_elements(payload->'titles') loop position=position+1;if (v->>'id')::integer<>position or (v->>'minimum')::bigint<=previous or exists(select 1 from unnest(array['zh-CN','en','ja','es','zh-TW']) l where length(trim(v->'labels'->>l)) not between 1 and 40 or v->'labels'->>l is null) then raise exception 'Invalid titles' using errcode='PT400';end if;previous=(v->>'minimum')::bigint;
   update omni_private.identity_titles set minimum=previous,labels=v->'labels' where id=position;
  end loop;
  update omni_private.identity_rules set tip_basis=payload->>'basis',updated_at=clock_timestamp() where id;
 else raise exception 'Unknown action' using errcode='PT400';end if;
 insert into public.omni_audit(actor_id,action,target) values(actor,'identity:'||action,jsonb_build_object('user',uid,'request',request,'reason',note,'change',payload)::text);
 return jsonb_build_object('ok',true,'id',j);
end;$$;
commit;
