-- FAVORITE PROPERTIES, MANUALLY ORDERED — additive only.
--
-- lead_recommendations has carried sort_order since the Recommended list became draggable;
-- lead_favorites never did, so Favorites has always rendered in created_at order with no way to
-- arrange it. One nullable integer closes that, and nothing else needs to change.
--
-- NULLABLE IS THE WHOLE TRICK. The canonical comparator is
--
--     sort_order ASC NULLS LAST, created_at ASC, id ASC
--
-- so a row that has never been dragged keeps sort_order NULL and therefore its exact present
-- position in created_at order. Every existing favorite renders in the same sequence after this
-- migration as before it, and an agent who never touches a handle sees no change at all. A
-- NOT NULL DEFAULT 0 would instead have flattened all 13 existing rows into one tie and let the
-- database return them in whatever order it liked.
--
-- TOP PICK IS NOT AFFECTED, and could not be: it lives on leads.top_pick_favorite_id — a pointer
-- to one favorite, not a position in a list. Reordering writes only this column, so the Top Pick
-- stays whichever property it was, wherever that property now sits.
--
-- id ASC is the final tiebreaker so the order is TOTAL: two favorites saved in the same
-- millisecond still have one defined sequence rather than an arbitrary one.

alter table public.lead_favorites
  add column if not exists sort_order integer;

comment on column public.lead_favorites.sort_order is
  'Manual display position within a lead''s Favorite Properties. NULL = never arranged; ordered sort_order ASC NULLS LAST, created_at ASC, id ASC. Independent of lead_recommendations.sort_order and of leads.top_pick_favorite_id.';

-- Ordering is per lead and always reads created_at alongside it, so the index covers the real
-- query rather than the column alone.
create index if not exists lead_favorites_lead_order_idx
  on public.lead_favorites (lead_id, sort_order, created_at);
