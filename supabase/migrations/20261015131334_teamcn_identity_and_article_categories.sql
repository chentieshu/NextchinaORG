begin;
-- A post has no category, including submissions from older clients.
alter table public.omni_articles alter column category drop not null;
create or replace function omni_private.omni_category_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.content_type='post' then new.category=null;return new;end if;
 if new.category is null then raise exception 'Article category required' using errcode='PT400';end if;
 if tg_op='INSERT' or new.category is distinct from old.category or new.content_type is distinct from old.content_type then
  perform 1 from public.omni_categories where key=new.category and enabled for share;
  if not found then raise exception 'Category unavailable' using errcode='PT400';end if;
 end if;return new;
end;$$;
drop trigger omni_category_guard on public.omni_articles;
create trigger omni_category_guard before insert or update on public.omni_articles for each row execute function omni_private.omni_category_guard();
update public.omni_articles set category=null where content_type='post';
alter table public.omni_articles add constraint teamcn_content_category check((content_type='post' and category is null) or (content_type='news' and category is not null));

create table omni_private.identity_rules(id boolean primary key default true check(id), tip_basis text not null default 'received' check(tip_basis in('received','sent','both')), updated_at timestamptz not null default clock_timestamp());
insert into omni_private.identity_rules default values;
create table omni_private.identity_levels(level smallint primary key check(level between 1 and 60),minimum bigint not null unique check(minimum>=0));
-- Points are represented in the wallet's existing 1/10000-point units.
insert into omni_private.identity_levels select n,1000000::bigint*(n-1)*(n-1) from generate_series(1,60) n;
create table omni_private.identity_titles(id smallint primary key,minimum bigint not null unique deferrable initially deferred check(minimum>=0),labels jsonb not null check(jsonb_typeof(labels)='object'));
insert into omni_private.identity_titles values
 (1,10000000,'{"zh-CN":"初有积蓄","zh-TW":"初有積蓄","en":"First savings","ja":"貯蓄の始まり","es":"Primeros ahorros"}'),
 (2,50000000,'{"zh-CN":"小有盈余","zh-TW":"小有盈餘","en":"Growing savings","ja":"着実な蓄え","es":"Ahorro creciente"}'),
 (3,100000000,'{"zh-CN":"积蓄有成","zh-TW":"積蓄有成","en":"Established saver","ja":"堅実な資産","es":"Ahorro consolidado"}'),
 (4,500000000,'{"zh-CN":"家底丰厚","zh-TW":"家底豐厚","en":"Well provisioned","ja":"豊かな蓄え","es":"Buen patrimonio"}'),
 (5,1000000000,'{"zh-CN":"富足之家","zh-TW":"富足之家","en":"Prosperous","ja":"ゆとりの暮らし","es":"Prosperidad"}'),
 (6,5000000000,'{"zh-CN":"财力雄厚","zh-TW":"財力雄厚","en":"Affluent","ja":"豊富な財力","es":"Gran fortuna"}'),
 (7,10000000000,'{"zh-CN":"百万富翁","zh-TW":"百萬富翁","en":"Point millionaire","ja":"百万長者","es":"Millonario en puntos"}'),
 (8,50000000000,'{"zh-CN":"富甲一方","zh-TW":"富甲一方","en":"Local magnate","ja":"地域の富豪","es":"Magnate local"}'),
 (9,100000000000,'{"zh-CN":"千万巨富","zh-TW":"千萬巨富","en":"Grand fortune","ja":"大富豪","es":"Fortuna extraordinaria"}'),
 (10,200000000000,'{"zh-CN":"富甲天下","zh-TW":"富甲天下","en":"Global magnate","ja":"天下の富豪","es":"Magnate mundial"}'),
 (11,1000000000001,'{"zh-CN":"富可敌国","zh-TW":"富可敵國","en":"Wealth of nations","ja":"国に匹敵する富","es":"Riqueza de naciones"}');
create table omni_private.identity_members(user_id uuid primary key references public.omni_profiles(id) on delete cascade,hide_level boolean not null default false,hide_title boolean not null default false,level_override smallint check(level_override between 1 and 60),title_override smallint references omni_private.identity_titles(id),updated_at timestamptz not null default clock_timestamp());
create index identity_members_title on omni_private.identity_members(title_override);
create table omni_private.identity_tip_totals(user_id uuid primary key references public.omni_profiles(id) on delete cascade,received bigint not null default 0 check(received>=0),sent bigint not null default 0 check(sent>=0));
insert into omni_private.identity_tip_totals select a.user_id,coalesce(sum(e.amount) filter(where e.amount>0),0),coalesce(-sum(e.amount) filter(where e.amount<0),0) from omni_private.wallet_entries e join omni_private.wallet_accounts a on a.id=e.account_id join omni_private.wallet_journals j on j.id=e.journal_id where j.kind='tip' and a.user_id is not null group by a.user_id;
create function omni_private.identity_tip_record() returns trigger language plpgsql security definer set search_path='' as $$declare uid uuid;begin
 if (select kind from omni_private.wallet_journals where id=new.journal_id)<>'tip' then return new;end if;
 select user_id into uid from omni_private.wallet_accounts where id=new.account_id;if uid is null then return new;end if;
 insert into omni_private.identity_tip_totals(user_id,received,sent) values(uid,greatest(new.amount,0),greatest(-new.amount,0)) on conflict(user_id) do update set received=omni_private.identity_tip_totals.received+excluded.received,sent=omni_private.identity_tip_totals.sent+excluded.sent;
 return new;end;$$;
create trigger teamcn_tip_identity after insert on omni_private.wallet_entries for each row execute function omni_private.identity_tip_record();
do $$declare t text;begin foreach t in array array['identity_rules','identity_levels','identity_titles','identity_members','identity_tip_totals'] loop execute format('alter table omni_private.%I enable row level security',t);execute format('revoke all on omni_private.%I from public,anon,authenticated',t);end loop;end;$$;

create function omni_private.identity_value(target uuid,private_view boolean default false) returns jsonb language sql stable set search_path='' as $$
 with stats as(select p.id,coalesce(m.hide_level,false) hide_level,coalesce(m.hide_title,false) hide_title,m.level_override,m.title_override,m.updated_at,
  case r.tip_basis when 'sent' then coalesce(s.sent,0) when 'both' then coalesce(s.received,0)+coalesce(s.sent,0) else coalesce(s.received,0) end xp,
  coalesce((select sum(balance) from omni_private.wallet_accounts where user_id=p.id and bucket in('purchased','earned','held','codes','escrow')),0) wealth
  from public.omni_profiles p cross join omni_private.identity_rules r left join omni_private.identity_members m on m.user_id=p.id left join omni_private.identity_tip_totals s on s.user_id=p.id where p.id=target and (private_view or not p.disabled)),
 v as(select s.*,coalesce(level_override,(select max(level) from omni_private.identity_levels where minimum<=xp),1) level,coalesce(title_override,(select id from omni_private.identity_titles where minimum<=wealth order by minimum desc limit 1)) title from stats s)
 select jsonb_build_object('id',id,'level',case when private_view or not hide_level then level end,'title',case when private_view or not hide_title then (select labels from omni_private.identity_titles where id=v.title) end)
 ||case when private_view then jsonb_build_object('hide_level',hide_level,'hide_title',hide_title,'level_override',level_override,'title_override',title_override,'updated_at',updated_at,'xp',xp::text,'wealth',wealth::text,'next', (select minimum::text from omni_private.identity_levels where level=v.level+1)) else '{}'::jsonb end from v;
$$;
create function omni_private.identity_read(profile_ids uuid[]) returns setof jsonb language sql stable security definer set search_path='' as $$select omni_private.identity_value(id) from (select distinct unnest(profile_ids[1:100]) id) s where exists(select 1 from public.omni_profiles p where p.id=s.id and not disabled);$$;
create function public.omni_identity_public(profile_ids uuid[]) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.identity_read(profile_ids);$$;
create function omni_private.identity_own() returns jsonb language plpgsql stable security definer set search_path='' as $$declare actor uuid:=omni_private.wallet_actor();begin return omni_private.identity_value(actor,true)||(select jsonb_build_object('basis',tip_basis) from omni_private.identity_rules);end;$$;
create function public.omni_identity_own() returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.identity_own();$$;
create function omni_private.identity_privacy(level_hidden boolean,title_hidden boolean) returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=omni_private.wallet_actor();begin
 if level_hidden is null or title_hidden is null then raise exception 'Invalid privacy' using errcode='PT400';end if;
 insert into omni_private.identity_members(user_id,hide_level,hide_title) values(actor,level_hidden,title_hidden) on conflict(user_id) do update set hide_level=excluded.hide_level,hide_title=excluded.hide_title,updated_at=clock_timestamp();return omni_private.identity_value(actor,true);end;$$;
create function public.omni_identity_privacy(level_hidden boolean,title_hidden boolean) returns jsonb language sql security invoker set search_path='' as $$select omni_private.identity_privacy(level_hidden,title_hidden);$$;

-- Administrators can adjust spendable points only. Escrow, collateral and existing entries remain immutable.
alter table omni_private.wallet_journals drop constraint wallet_journals_kind_check;
alter table omni_private.wallet_journals add constraint wallet_journals_kind_check check(kind in('deposit','tip','withdraw_hold','withdraw_cancel','withdraw_reject','withdraw_paid','merchant_issue','merchant_revoke','code_create','code_cancel','code_redeem','c2c_hold','c2c_release','c2c_cancel','collateral_refund','collateral_lock','admin_adjust'));
create function omni_private.identity_admin_read(target_handle text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$declare actor uuid:=omni_private.market_owner();uid uuid;begin
 select id into uid from public.omni_profiles where lower(handle)=lower(trim(leading '@' from trim(target_handle)));
 return jsonb_build_object('rules',(select to_jsonb(r) from omni_private.identity_rules r),'levels',(select jsonb_agg(jsonb_build_object('level',level,'minimum',minimum::text) order by level) from omni_private.identity_levels),'titles',(select jsonb_agg(jsonb_build_object('id',id,'minimum',minimum::text,'labels',labels) order by minimum) from omni_private.identity_titles),'member',case when uid is not null then omni_private.identity_value(uid,true)||jsonb_build_object('handle',target_handle,'frozen',coalesce((select frozen from omni_private.wallet_users where user_id=uid),false)) end);end;$$;
create function public.omni_identity_admin_read(target_handle text default '') returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.identity_admin_read(target_handle);$$;
create function omni_private.identity_admin_action(request uuid,action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=omni_private.market_owner();uid uuid;old omni_private.wallet_journals;j uuid;delta bigint;bucket text;note text:=trim(payload->>'note');r omni_private.identity_rules;v jsonb;previous bigint:=-1;position integer:=0;
begin
 perform omni_private.require_email_verification();if request is null or note is null or length(note) not between 3 and 500 then raise exception 'Reason required' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,0));
 if action='adjust' then
  uid=(payload->>'user_id')::uuid;delta=(payload->>'delta')::bigint;bucket=payload->>'bucket';
  if delta is null or abs(delta) not between 1 and 10000000000000 or bucket not in('purchased','earned') or bucket is null or not exists(select 1 from public.omni_profiles where id=uid) then raise exception 'Invalid adjustment' using errcode='PT400';end if;
  select * into old from omni_private.wallet_journals where actor_id=actor and request_id=request;
  if found then if old.kind<>'admin_adjust' or old.fingerprint<>payload then raise exception 'Request changed' using errcode='PT409';end if;return jsonb_build_object('ok',true,'id',old.id);end if;
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
create function public.omni_identity_admin_action(request uuid,action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select omni_private.identity_admin_action(request,action,payload);$$;
revoke all on function omni_private.identity_tip_record(),omni_private.identity_value(uuid,boolean),omni_private.identity_read(uuid[]),public.omni_identity_public(uuid[]),omni_private.identity_own(),public.omni_identity_own(),omni_private.identity_privacy(boolean,boolean),public.omni_identity_privacy(boolean,boolean),omni_private.identity_admin_read(text),public.omni_identity_admin_read(text),omni_private.identity_admin_action(uuid,text,jsonb),public.omni_identity_admin_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function omni_private.identity_read(uuid[]),public.omni_identity_public(uuid[]) to anon,authenticated;
grant execute on function omni_private.identity_own(),public.omni_identity_own(),omni_private.identity_privacy(boolean,boolean),public.omni_identity_privacy(boolean,boolean),omni_private.identity_admin_read(text),public.omni_identity_admin_read(text),omni_private.identity_admin_action(uuid,text,jsonb),public.omni_identity_admin_action(uuid,text,jsonb) to authenticated;
commit;
