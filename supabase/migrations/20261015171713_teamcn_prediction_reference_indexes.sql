begin;
create index exchange_disputes_user on omni_private.exchange_disputes(user_id);
create index exchange_markets_creator on omni_private.exchange_markets(creator_id);
create index exchange_shares_order on omni_private.exchange_shares(order_id);
create index exchange_trades_maker on omni_private.exchange_trades(maker_id);
create index exchange_trades_taker on omni_private.exchange_trades(taker_id);
commit;
