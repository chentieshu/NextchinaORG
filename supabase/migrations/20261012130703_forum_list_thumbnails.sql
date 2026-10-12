begin;
-- Return the first real image URL with summaries, keeping full documents out of list payloads.
create or replace function public.omni_content_feed(content_kind text default 'post',filter_category text default 'all',filter_query text default '',sort_by text default 'latest',page_size integer default 20,offset_rows integer default 0,own_only boolean default false,bookmarks_only boolean default false,featured_only boolean default false)
returns setof jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
  select a.* from public.omni_articles a
  where (content_kind='all' or a.content_type=content_kind)
   and (filter_category='all' or a.category=filter_category)
   and (not featured_only or a.featured)
   and (case when own_only then a.author_id=(select auth.uid()) else a.status='published' end)
   and (not bookmarks_only or omni_private.omni_has_bookmark(a.id))
   and (coalesce(filter_query,'')='' or exists(select 1 from jsonb_each(a.translations) v where position(lower(left(filter_query,120)) in lower(coalesce(v.value->>'title','')||' '||coalesce(v.value->>'summary','')))>0))
 ), selected as materialized (
  select a.*,coalesce(c.like_count,0) as likes,coalesce(c.comment_count,0) as comments from candidates a
  left join lateral omni_private.omni_content_counts(a.id) c on true
  order by (case when not own_only then a.featured else false end) desc,
   (case when sort_by='popular' then coalesce(c.like_count,0) else 0 end) desc,
   coalesce(a.published_at,a.created_at) desc,a.id desc
  limit greatest(1,least(coalesce(page_size,20),50))+1 offset greatest(0,least(coalesce(offset_rows,0),100000))
 ) select jsonb_build_object('id',s.id,'slug',s.slug,'category',s.category,'status',s.status,'original_locale',s.original_locale,'author_id',s.author_id,'author_name',s.author_name,'content_type',s.content_type,'featured',s.featured,'locked',s.locked,'moderated',s.moderated,'cover_style',s.cover_style,'source_url',s.source_url,'created_at',s.created_at,'updated_at',s.updated_at,'published_at',s.published_at,'like_count',s.likes,'comment_count',s.comments,'thumbnail_url',coalesce(jsonb_path_query_first(s.translations->s.original_locale,'$.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}',jsonb_path_query_first(s.translations,'$.*.document.** ? (@.type == "image" && @.attrs.src like_regex "^https://").attrs.src')#>>'{}'),
 'translations',(select jsonb_object_agg(v.key,jsonb_build_object('title',v.value->>'title','summary',v.value->>'summary','body','')) from jsonb_each(s.translations) v)) from selected s
 order by (case when not own_only then s.featured else false end) desc,(case when sort_by='popular' then s.likes else 0 end) desc,coalesce(s.published_at,s.created_at) desc,s.id desc;
$$;
commit;
