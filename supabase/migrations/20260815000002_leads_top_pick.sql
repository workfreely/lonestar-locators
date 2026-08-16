-- ============================================================================
-- Durable Top Pick — the lead's single current leading property
-- ============================================================================
-- Top Pick is a REAL, queryable concept: "which property is this client's current
-- leading choice?" A scalar FK on `leads` structurally guarantees AT MOST ONE Top
-- Pick per lead (a column holds one value — no partial-unique-index or trigger
-- needed), is O(1) to read, and auto-clears if the favorite is deleted.
--
-- Semantics (enforced in application code, see lib/leads/tourFollowUpWorkflow):
--   • Ready to Apply sets it to that property.
--   • Setting it overwrites the previous property (the old one loses Top Pick).
--   • Didn't Like It clears it IFF it equals the rejected property.
--   • Reschedule / Cancel Tour / Guest Card state never touch it.
--   • Top Pick does NOT imply Applied.

alter table public.leads
  add column if not exists top_pick_favorite_id bigint
  references public.lead_favorites(id) on delete set null;

create index if not exists leads_top_pick_favorite_id_idx
  on public.leads (top_pick_favorite_id);
