begin;
-- Market definition and review are independent of the yet-to-be-selected trading mechanism.
-- These RPCs cannot debit, credit, reserve or settle wallet points.
create table omni_private.prediction_proposals(
 id uuid primary key default gen_random_uuid(),author_id uuid not null references public.omni_profiles(id) on delete restrict,request_id uuid not null,
 title text not null check(length(trim(title)) between 5 and 160),rules text not null check(length(trim(rules)) between 30 and 4000),
 source_url text not null check(length(source_url)<=500 and source_url ~ '^https://[^[:space:]]+$'),closes_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','approved','rejected')),review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(author_id,request_id));
create index prediction_proposals_author_page on omni_private.prediction_proposals(author_id,created_at desc,id desc);
create index prediction_proposals_status_page on omni_private.prediction_proposals(status,created_at desc,id desc);
alter table omni_private.prediction_proposals enable row level security;
revoke all on omni_private.prediction_proposals from public,anon,authenticated;
create function omni_private.prediction_read(view_kind text default 'public',before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare actor uuid:=auth.uid();cursor_at timestamptz;rows jsonb;begin
 if view_kind not in('public','mine','review') or view_kind is null then raise exception 'Invalid view' using errcode='PT400';end if;
 if view_kind='review' then perform omni_private.market_owner();elsif view_kind='mine' then perform omni_private.wallet_actor();end if;
 if before_id is not null then select created_at into cursor_at from omni_private.prediction_proposals where id=before_id and (view_kind='review' or status='approved' or author_id=actor);if not found then raise exception 'Invalid cursor' using errcode='PT400';end if;end if;
 select coalesce(jsonb_agg(row_value),'[]') into rows from (select to_jsonb(p)-'request_id'||jsonb_build_object('author_name',u.display_name,'author_handle',u.handle,'review_note',case when view_kind='review' or p.author_id=actor then p.review_note else '' end) row_value from omni_private.prediction_proposals p join public.omni_profiles u on u.id=p.author_id
 where (view_kind='review' or (view_kind='mine' and p.author_id=actor) or (view_kind='public' and p.status='approved' and not u.disabled)) and (before_id is null or (p.created_at,p.id)<(cursor_at,before_id)) order by p.created_at desc,p.id desc limit 21) q;
 return jsonb_build_object('rows',rows,'trading_enabled',false,'default_market',jsonb_build_object('code','btc-5m','interval_seconds',300,'status','setup'),'server_time',clock_timestamp());
end;$$;
create function public.omni_prediction_read(view_kind text default 'public',before_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select omni_private.prediction_read(view_kind,before_id);$$;
create function omni_private.prediction_propose(request uuid,title text,rules text,source_url text,closes_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=omni_private.wallet_actor();p omni_private.prediction_proposals;begin
 if request is null or closes_at is null or closes_at<now()+interval '15 minutes' or closes_at>now()+interval '2 years' or source_url !~ '^https://[^[:space:]]+$' or source_url is null or length(source_url)>500 then raise exception 'Invalid market rules' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended('prediction:'||actor::text,0));
 select * into p from omni_private.prediction_proposals where author_id=actor and request_id=request;
 if found then if p.title is distinct from title or p.rules is distinct from rules or p.source_url is distinct from source_url or p.closes_at is distinct from closes_at then raise exception 'Request changed' using errcode='PT409';end if;return jsonb_build_object('ok',true,'id',p.id);end if;
 if (select count(*) from omni_private.prediction_proposals where author_id=actor and created_at>now()-interval '1 day')>=5 then raise exception 'Proposal limit' using errcode='PT429';end if;
 insert into omni_private.prediction_proposals(author_id,request_id,title,rules,source_url,closes_at) values(actor,request,trim(title),trim(rules),source_url,closes_at) returning * into p;
 return jsonb_build_object('ok',true,'id',p.id);
end;$$;
create function public.omni_prediction_propose(request uuid,title text,rules text,source_url text,closes_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.prediction_propose(request,title,rules,source_url,closes_at);$$;
create function omni_private.prediction_review(target uuid,decision text,note text,expected timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=omni_private.market_owner();p omni_private.prediction_proposals;begin
 perform omni_private.require_email_verification();if decision not in('approved','rejected') or decision is null or length(trim(note)) not between 3 and 1000 or note is null then raise exception 'Review reason required' using errcode='PT400';end if;
 select * into p from omni_private.prediction_proposals where id=target for update;if not found or p.updated_at is distinct from expected then raise exception 'Market changed' using errcode='PT409';end if;
 if decision='approved' and p.closes_at<=now() then raise exception 'Market expired' using errcode='PT400';end if;
 update omni_private.prediction_proposals set status=decision,review_note=note,updated_at=clock_timestamp() where id=target;
 insert into public.omni_audit(actor_id,action,target) values(actor,'prediction:'||decision,jsonb_build_object('id',target,'reason',note)::text);
 return jsonb_build_object('ok',true);
end;$$;
create function public.omni_prediction_review(target uuid,decision text,note text,expected timestamptz) returns jsonb language sql security invoker set search_path='' as $$select omni_private.prediction_review(target,decision,note,expected);$$;
revoke all on function omni_private.prediction_read(text,uuid),public.omni_prediction_read(text,uuid),omni_private.prediction_propose(uuid,text,text,text,timestamptz),public.omni_prediction_propose(uuid,text,text,text,timestamptz),omni_private.prediction_review(uuid,text,text,timestamptz),public.omni_prediction_review(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function omni_private.prediction_read(text,uuid),public.omni_prediction_read(text,uuid) to anon,authenticated;
grant execute on function omni_private.prediction_propose(uuid,text,text,text,timestamptz),public.omni_prediction_propose(uuid,text,text,text,timestamptz),omni_private.prediction_review(uuid,text,text,timestamptz),public.omni_prediction_review(uuid,text,text,timestamptz) to authenticated;
commit;
