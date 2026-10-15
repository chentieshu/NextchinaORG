create index if not exists c2c_messages_actor_idx on omni_private.c2c_messages(actor_id);
create index if not exists market_codes_redeemed_by_idx on omni_private.market_codes(redeemed_by);
create index if not exists omni_comments_parent_id_idx on public.omni_comments(parent_id);
