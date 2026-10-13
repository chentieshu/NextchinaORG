begin;
create table public.omni_categories (
 key text primary key check(key ~ '^[a-z][a-z0-9-]{0,39}$' and key <> 'all'),
 labels jsonb not null check(jsonb_typeof(labels)='object'),
 position integer not null default 0 check(position between 0 and 9999),
 enabled boolean not null default true,
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.omni_categories(key,labels,position) values
 ('ai','{"zh-CN":"人工智能","en":"AI","ja":"AI","es":"IA","zh-TW":"人工智慧"}',10),
 ('opensource','{"zh-CN":"开源","en":"Open source","ja":"オープンソース","es":"Código abierto","zh-TW":"開源"}',20),
 ('hardware','{"zh-CN":"硬件","en":"Hardware","ja":"ハードウェア","es":"Hardware","zh-TW":"硬體"}',30),
 ('design','{"zh-CN":"设计","en":"Design","ja":"デザイン","es":"Diseño","zh-TW":"設計"}',40),
 ('frontier','{"zh-CN":"前沿","en":"Frontier","ja":"フロンティア","es":"Frontera","zh-TW":"前沿"}',50);
alter table public.omni_categories enable row level security;
revoke all on public.omni_categories from public,anon,authenticated;
grant select on public.omni_categories to anon,authenticated;
create policy categories_read on public.omni_categories for select to anon,authenticated using(true);
alter table public.omni_articles drop constraint omni_articles_category_check;
alter table public.omni_articles add constraint omni_articles_category_fkey foreign key(category) references public.omni_categories(key) on delete restrict;
create index if not exists omni_articles_category on public.omni_articles(category);
create function omni_private.omni_category_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='INSERT' or new.category is distinct from old.category then
  -- Row lock makes disabling a category and publishing into it serialize correctly.
  perform 1 from public.omni_categories where key=new.category and enabled for share;
  if not found then raise exception 'Category unavailable' using errcode='PT400';end if;
 end if;return new;
end;$$;
-- Locking rows requires UPDATE privilege; keep the guard privileged and non-callable.
alter function omni_private.omni_category_guard() security definer;
create trigger omni_category_guard before insert or update of category on public.omni_articles for each row execute function omni_private.omni_category_guard();
revoke all on function omni_private.omni_category_guard() from public,anon,authenticated;
create or replace function omni_private.omni_record_audit() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.omni_audit(actor_id,action,target) values(auth.uid(),tg_op||':'||tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'key',to_jsonb(old)->>'key','settings'));return coalesce(new,old);
end;$$;
create trigger omni_category_audit after insert or update or delete on public.omni_categories for each row execute function omni_private.omni_record_audit();

create function omni_private.omni_save_category(category_key text,new_labels jsonb,new_position integer,new_enabled boolean,expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.omni_categories;lang text;
begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Forbidden' using errcode='PT403';end if;
 if category_key is null or category_key!~'^[a-z][a-z0-9-]{0,39}$' or category_key='all' or new_position is null or new_position not between 0 and 9999 or new_enabled is null or new_labels is null or jsonb_typeof(new_labels)<>'object' then raise exception 'Invalid category' using errcode='PT400';end if;
 foreach lang in array array['zh-CN','en','ja','es','zh-TW'] loop
  if coalesce(jsonb_typeof(new_labels->lang),'')<>'string' or length(trim(new_labels->>lang)) not between 1 and 40 or new_labels->>lang ~ '[[:cntrl:]]' then raise exception 'Five translated names required' using errcode='PT400';end if;
 end loop;
 select jsonb_object_agg(k,trim(new_labels->>k)) into new_labels from unnest(array['zh-CN','en','ja','es','zh-TW']) as k;
 perform pg_advisory_xact_lock(78234051);
 if expected_updated_at is null then
  if (select count(*) from public.omni_categories)>=100 then raise exception 'Category limit reached' using errcode='PT400';end if;
  insert into public.omni_categories(key,labels,position,enabled) values(category_key,new_labels,new_position,new_enabled) returning * into result;
 else
  update public.omni_categories set labels=new_labels,position=new_position,enabled=new_enabled,updated_at=clock_timestamp() where key=category_key and updated_at=expected_updated_at returning * into result;
  if not found then raise exception 'Category changed' using errcode='PT409';end if;
 end if;return to_jsonb(result);
end;$$;
create function public.omni_save_category(category_key text,new_labels jsonb,new_position integer,new_enabled boolean,expected_updated_at timestamptz default null) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_save_category(category_key,new_labels,new_position,new_enabled,expected_updated_at);$$;
create function omni_private.omni_delete_category(category_key text,expected_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Forbidden' using errcode='PT403';end if;
 delete from public.omni_categories where key=category_key and updated_at=expected_updated_at;
 if not found then raise exception 'Category changed' using errcode='PT409';end if;
exception when foreign_key_violation then raise exception 'Category is in use; disable it instead' using errcode='PT422';
end;$$;
create function public.omni_delete_category(category_key text,expected_updated_at timestamptz) returns void language sql security invoker set search_path='' as $$select omni_private.omni_delete_category(category_key,expected_updated_at);$$;

alter table public.omni_settings add column updated_at timestamptz not null default clock_timestamp();
create function omni_private.omni_settings_stamp() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=clock_timestamp();return new;end;$$;
create trigger omni_settings_stamp before update on public.omni_settings for each row execute function omni_private.omni_settings_stamp();
revoke all on function omni_private.omni_settings_stamp() from public,anon,authenticated;
create function omni_private.omni_save_settings(new_notice text,new_comments boolean,new_posts boolean,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare result public.omni_settings;begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Forbidden' using errcode='PT403';end if;
 if new_notice is null or length(new_notice)>500 or new_comments is null or new_posts is null then raise exception 'Invalid settings' using errcode='PT400';end if;
 update public.omni_settings set notice=new_notice,comments_enabled=new_comments,ugc_enabled=new_posts where id and updated_at=expected_updated_at returning * into result;
 if not found then raise exception 'Settings changed' using errcode='PT409';end if;return to_jsonb(result);
end;$$;
create function public.omni_save_settings(new_notice text,new_comments boolean,new_posts boolean,expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.omni_save_settings(new_notice,new_comments,new_posts,expected_updated_at);$$;

create function omni_private.omni_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not omni_private.omni_is_admin() then raise exception 'Forbidden' using errcode='PT403';end if;
 return jsonb_build_object('sampled_at',now(),
 'content',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (select content_type,status,count(*) as count from public.omni_articles group by content_type,status)s),
 'comments',(select count(*) from public.omni_comments where not deleted),
 'members',case when omni_private.omni_role()='super_admin' then (select count(*) from public.omni_profiles) else null end,
 'categories',(select coalesce(jsonb_object_agg(key,n),'{}') from (select c.key,count(a.id) n from public.omni_categories c left join public.omni_articles a on a.category=c.key group by c.key)s));
end;$$;
create function public.omni_admin_overview() returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.omni_admin_overview();$$;

create function omni_private.omni_admin_content(content_kind text,filter_status text default 'all',filter_category text default 'all',filter_query text default '',offset_rows integer default 0) returns setof jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not omni_private.omni_is_admin() then raise exception 'Forbidden' using errcode='PT403';end if;
 return query select (to_jsonb(a)-'translations')||jsonb_build_object('author_name',p.display_name,'author_avatar_key',p.avatar_key,'translations',(select jsonb_object_agg(k,jsonb_build_object('title',v->>'title','summary',v->>'summary','body',left(v->>'body',200))) from jsonb_each(a.translations) as e(k,v))) from public.omni_articles a left join public.omni_profiles p on p.id=a.author_id
 where a.content_type=content_kind and (filter_status='all' or a.status=filter_status) and (filter_category='all' or a.category=filter_category)
 and (coalesce(filter_query,'')='' or exists(select 1 from jsonb_each(a.translations) as e(k,v) where position(lower(left(filter_query,120)) in lower((v->>'title')||' '||(v->>'body')))>0) or position(lower(left(filter_query,120)) in lower(p.display_name))>0)
 order by a.created_at desc,a.id desc limit 51 offset greatest(0,least(offset_rows,1000000));
end;$$;
create function public.omni_admin_content(content_kind text,filter_status text default 'all',filter_category text default 'all',filter_query text default '',offset_rows integer default 0) returns setof jsonb language sql stable security invoker set search_path='' as $$select * from omni_private.omni_admin_content(content_kind,filter_status,filter_category,filter_query,offset_rows);$$;

create function omni_private.omni_admin_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if omni_private.omni_role() is distinct from 'super_admin' then raise exception 'Forbidden' using errcode='PT403';end if;
 return jsonb_build_object('sampled_at',now(),'database_bytes',pg_database_size(current_database()),
 'application_bytes',(select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='public' and c.relname like 'omni_%' or n.nspname='omni_private')),
 'connections',(select numbackends from pg_stat_database where datname=current_database()),
 'upload_reservations_24h',(select count(*) from omni_private.media_uploads where created_at>now()-interval '24 hours'),
 'reserved_bytes_24h',(select coalesce(sum(bytes),0) from omni_private.media_uploads where created_at>now()-interval '24 hours'));
end;$$;
create function public.omni_admin_metrics() returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.omni_admin_metrics();$$;

revoke all on function omni_private.omni_save_category(text,jsonb,integer,boolean,timestamptz),public.omni_save_category(text,jsonb,integer,boolean,timestamptz),omni_private.omni_delete_category(text,timestamptz),public.omni_delete_category(text,timestamptz),omni_private.omni_save_settings(text,boolean,boolean,timestamptz),public.omni_save_settings(text,boolean,boolean,timestamptz),omni_private.omni_admin_overview(),public.omni_admin_overview(),omni_private.omni_admin_content(text,text,text,text,integer),public.omni_admin_content(text,text,text,text,integer),omni_private.omni_admin_metrics(),public.omni_admin_metrics() from public,anon,authenticated;
grant execute on function omni_private.omni_save_category(text,jsonb,integer,boolean,timestamptz),public.omni_save_category(text,jsonb,integer,boolean,timestamptz),omni_private.omni_delete_category(text,timestamptz),public.omni_delete_category(text,timestamptz),omni_private.omni_save_settings(text,boolean,boolean,timestamptz),public.omni_save_settings(text,boolean,boolean,timestamptz),omni_private.omni_admin_overview(),public.omni_admin_overview(),omni_private.omni_admin_content(text,text,text,text,integer),public.omni_admin_content(text,text,text,text,integer),omni_private.omni_admin_metrics(),public.omni_admin_metrics() to authenticated;
commit;
