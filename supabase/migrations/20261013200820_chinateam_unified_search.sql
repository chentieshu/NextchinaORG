begin;

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Index visible text, not JSON syntax, private drafts, or translated copies of posts.
create function omni_private.omni_search_text(translations jsonb,original_locale text,content_type text)
returns text language sql immutable parallel safe set search_path='' as $$
 select lower(coalesce(string_agg(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')||' '||coalesce(v.value->>'body',''),' ' order by v.key),''))
 from jsonb_each(translations) v where content_type='news' or v.key=original_locale;
$$;
revoke all on function omni_private.omni_search_text(jsonb,text,text) from public;
grant execute on function omni_private.omni_search_text(jsonb,text,text) to anon,authenticated;
create index omni_articles_search on public.omni_articles using gin
 (omni_private.omni_search_text(translations,original_locale,content_type) extensions.gin_trgm_ops) where status='published';
create index omni_profiles_search on public.omni_profiles using gin
 (lower(display_name||' '||handle||' '||bio) extensions.gin_trgm_ops) where not disabled and profile_completed_at is not null;
create index omni_comments_search on public.omni_comments using gin (lower(body) extensions.gin_trgm_ops) where not deleted;

-- Additive RPC keeps already loaded clients working while the frontend rolls out.
-- All branches enforce public visibility even for administrators. Only a public
-- projection leaves this definer; email, preferences and OAuth data never do.
create function omni_private.omni_search_v2(search_query text,result_kind text default 'all',sort_by text default 'relevant',offset_rows integer default 0,following_only boolean default false,page_size integer default 20)
returns setof jsonb language sql stable security definer set search_path='' set statement_timeout='8s' as $$
 with input as (
  select lower(left(trim(coalesce(search_query,'')),120)) q,(select auth.uid()) actor,
   greatest(1,least(coalesce(page_size,20),20)) take
 ), terms as (
  select i.*,regexp_split_to_array(i.q,'\s+') words,ltrim(i.q,'@') handle_query from input i
 ), needle as (
  select t.*, '%'||replace(replace(replace((select word from unnest(t.words) word order by length(word) desc limit 1),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%' pattern,
   '%'||replace(replace(replace(ltrim((select word from unnest(t.words) word order by length(word) desc limit 1),'@'),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%' person_pattern
  from terms t where q<>'' and result_kind in ('all','post','news','user','reply','media') and cardinality(words)<=12
 ), matches as (
  select a.id,coalesce(a.published_at,a.created_at) created_at,a.content_type kind,
   case when position(n.q in omni_private.omni_search_text(a.translations,a.original_locale,a.content_type))>0 then 30 else 10 end score
  from public.omni_articles a left join public.omni_profiles author on author.id=a.author_id cross join needle n
  where a.status='published' and (author.id is null or (not author.disabled and author.profile_completed_at is not null))
   and (result_kind in ('all','media') or result_kind=a.content_type)
   and omni_private.omni_search_text(a.translations,a.original_locale,a.content_type) like n.pattern
   and exists(select 1 from jsonb_each(a.translations) v where (a.content_type='news' or v.key=a.original_locale)
    and not exists(select 1 from unnest(n.words) word where position(word in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')||' '||coalesce(v.value->>'body','')))=0))
   and (not coalesce(following_only,false) or exists(select 1 from public.omni_follows f where f.follower_id=n.actor and f.following_id=a.author_id))
   and (result_kind<>'media' or jsonb_path_exists(a.translations->a.original_locale,'$.document.** ? (@.type == "image" || @.type == "embed")')
    or (a.translations->a.original_locale->>'body') ~* 'https://(www\.)?(youtu(be\.com|\.be)|bilibili\.com|x\.com|twitter\.com|open\.spotify\.com|github\.com)/')
  union all
  select p.id,p.created_at,'user',case when lower(p.handle)=n.handle_query then 100 when lower(p.display_name)=n.q then 90 when starts_with(lower(p.handle),n.handle_query) then 70 when starts_with(lower(p.display_name),n.q) then 60 else 20 end
  from public.omni_profiles p cross join needle n
  where result_kind in ('all','user') and not p.disabled and p.profile_completed_at is not null and n.handle_query<>''
   and lower(p.display_name||' '||p.handle||' '||p.bio) like n.person_pattern
   and not exists(select 1 from unnest(n.words) word where position(ltrim(word,'@') in lower(p.display_name||' '||p.handle||' '||p.bio))=0)
   and (not coalesce(following_only,false) or exists(select 1 from public.omni_follows f where f.follower_id=n.actor and f.following_id=p.id))
  union all
  select c.id,c.created_at,'reply',case when position(n.q in lower(c.body))>0 then 25 else 10 end
  from public.omni_comments c join public.omni_articles a on a.id=c.article_id
  join public.omni_profiles author on author.id=c.user_id
  left join public.omni_profiles post_author on post_author.id=a.author_id cross join needle n
  where result_kind in ('all','reply') and a.status='published' and not c.deleted
   and not author.disabled and author.profile_completed_at is not null
   and (post_author.id is null or (not post_author.disabled and post_author.profile_completed_at is not null))
   and lower(c.body) like n.pattern and not exists(select 1 from unnest(n.words) word where position(word in lower(c.body))=0)
   and (not coalesce(following_only,false) or exists(select 1 from public.omni_follows f where f.follower_id=n.actor and f.following_id=c.user_id))
 ), selected as materialized (
  select * from matches order by (case when sort_by='latest' then 0 else score end) desc,created_at desc,id desc,kind
  limit (select take+1 from input) offset greatest(0,least(coalesce(offset_rows,0),10000))
 )
 select case when s.kind='user' then jsonb_build_object('kind','user','profile',
  (select jsonb_build_object('id',p.id,'display_name',p.display_name,'handle',p.handle,'avatar_key',p.avatar_key,'bio',p.bio,
   'following',exists(select 1 from public.omni_follows f where f.follower_id=(select actor from input) and f.following_id=p.id)) from public.omni_profiles p where p.id=s.id))
 when s.kind='reply' then jsonb_build_object('kind','reply','reply',
  (select jsonb_build_object('id',c.id,'article_id',c.article_id,'content_type',a.content_type,'body',left(c.body,500),'created_at',c.created_at,'user_id',c.user_id,'display_name',p.display_name,'handle',p.handle,'avatar_key',p.avatar_key)
   from public.omni_comments c join public.omni_articles a on a.id=c.article_id join public.omni_profiles p on p.id=c.user_id where c.id=s.id))
 else jsonb_build_object('kind',s.kind,'article',
  (select coalesce((select context from omni_private.omni_social_context(array[a.id]) context),'{}'::jsonb)||jsonb_build_object(
   'id',a.id,'slug',a.slug,'category',a.category,'status',a.status,'original_locale',a.original_locale,'author_id',a.author_id,'author_name',coalesce(p.display_name,a.author_name),'author_handle',p.handle,'author_avatar_key',p.avatar_key,
   'content_type',a.content_type,'created_at',a.created_at,'updated_at',a.updated_at,'published_at',a.published_at,'featured',a.featured,'locked',a.locked,'moderated',a.moderated,'cover_style',a.cover_style,'source_url',a.source_url,
   'like_count',(select count(*) from public.omni_likes where article_id=a.id),'comment_count',(select count(*) from public.omni_comments where article_id=a.id and not deleted),
   'media',coalesce((select jsonb_agg(jsonb_build_object('type',m.n->>'type','url',coalesce(m.n->'attrs'->>'src',m.n->'attrs'->>'url'),'alt',m.n->'attrs'->>'alt') order by m.position)
    from (select n,min(position) position from jsonb_path_query(a.translations->a.original_locale,'$.document.** ? (@.type == "image" || @.type == "embed")') with ordinality nodes(n,position) group by n order by min(position) limit 8) m),'[]'::jsonb),
   'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',case when a.content_type='post' then left(coalesce(nullif(v.value->>'body',''),v.value->>'summary',''),600) else v.value->>'summary' end,'body','')) from jsonb_each(a.translations) v where a.content_type='news' or v.key=a.original_locale),
   'matched_locale',(select v.key from jsonb_each(a.translations) v where (a.content_type='news' or v.key=a.original_locale)
    and not exists(select 1 from unnest((select words from terms)) word where position(word in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')||' '||coalesce(v.value->>'body','')))=0)
    order by (v.key=a.original_locale) desc,v.key limit 1))
  from public.omni_articles a left join public.omni_profiles p on p.id=a.author_id where a.id=s.id)) end
 from selected s order by (case when sort_by='latest' then 0 else s.score end) desc,s.created_at desc,s.id desc,s.kind;
$$;
create function public.omni_search_v2(search_query text,result_kind text default 'all',sort_by text default 'relevant',offset_rows integer default 0,following_only boolean default false,page_size integer default 20)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 select * from omni_private.omni_search_v2(search_query,result_kind,sort_by,offset_rows,following_only,page_size);
$$;
revoke all on function omni_private.omni_search_v2(text,text,text,integer,boolean,integer),public.omni_search_v2(text,text,text,integer,boolean,integer) from public,anon,authenticated;
grant execute on function omni_private.omni_search_v2(text,text,text,integer,boolean,integer),public.omni_search_v2(text,text,text,integer,boolean,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
