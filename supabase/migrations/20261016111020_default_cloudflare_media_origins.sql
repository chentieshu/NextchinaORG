-- Accept the current media service while preserving historical image-only posts.
create or replace function omni_private.omni_validate_article() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;lang text;attachments integer;
begin
 if jsonb_typeof(new.translations)<>'object' or not(new.translations ? new.original_locale) then raise exception 'Original translation required';end if;
 for lang,item in select key,value from jsonb_each(new.translations) loop
  if lang not in ('zh-CN','en','ja','es','zh-TW') or jsonb_typeof(item)<>'object' or coalesce(jsonb_typeof(item->'title'),'')<>'string' or length(item->>'title')>200 or coalesce(jsonb_typeof(item->'summary'),'')<>'string' or length(item->>'summary')>500 or coalesce(jsonb_typeof(item->'body'),'')<>'string' or length(item->>'body')>100000 then raise exception 'Invalid translation';end if;
  if new.content_type='news' and (length(trim(item->>'title'))<1 or length(trim(item->>'body'))<1) then raise exception 'News title and body required';end if;
  if new.content_type='post' and not new.has_quote and length(trim(item->>'body'))=0 and not jsonb_path_exists(item,'$.document.** ? (@.type == "image" && (@.attrs.src starts with "https://media.nextchina.org/" || @.attrs.src starts with "https://media.chinateam.org/" || @.attrs.src starts with "https://media.teamcn.org/" || @.attrs.src starts with "https://nextchina-media.chentieshu520.workers.dev/"))') and not jsonb_path_exists(item,'$.document.** ? (@.type == "embed" && @.attrs.url starts with "https://")') then raise exception 'Post content required';end if;
  select count(*) into attachments from jsonb_path_query(item,'strict $.document.** ? (@.type == "image")','{}',true) n;
  if new.content_type='post' and attachments>4 then raise exception 'Maximum four images';end if;
 end loop;
 new.updated_at=clock_timestamp();if new.status='published' and new.published_at is null then new.published_at=now();end if;return new;
end;$$;
