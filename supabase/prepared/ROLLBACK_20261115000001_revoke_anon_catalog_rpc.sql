-- Reverses 20261115000001_revoke_anon_catalog_rpc.sql and nothing else.
-- Restores anonymous execute on the shared catalog lookup — i.e. puts back the state
-- 20261106000000_property_gift_card.sql left it in. Only run this if revoking anon turns out
-- to break a caller that was not found in the trace; it re-opens the 27-column read,
-- commissions included, to anonymous callers.
grant execute on function public.lb_property_catalog_by_ids(text[]) to anon;
