-- RESEARCH IDENTITY CHANGES BECOME HISTORY TOO.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────────────────────
-- 49 research records were written with fabricated place_id tails and later corrected. Those 49
-- corrections left NO TRACE, because the watch list covered content — property_name, stable,
-- pricing, sources, unresolved — and not the identifier itself. A record silently pointing at a
-- different building is exactly the kind of change history exists to make visible.
--
-- ── WHAT IS CAPTURED, AND WHY IT IS SAFE ────────────────────────────────────────────────────
-- The capture function derives identity from OLD, so a place_id change records:
--
--   previous.place_id    the OLD identifier
--   entity_key.place_id  the OLD identifier, as the canonical key at the time of the change
--   row_id               the surrogate id, which does NOT change — so the chain stays findable
--                        across the rename, by row_id, from either side
--
-- The NEW identifier is the live row's value. Old and new are therefore both recoverable, and the
-- surrogate key keeps the history of a record continuous even when its business key moves. No
-- change to the function or to any existing row is needed — only the watch list.
--
-- Nothing here modifies an existing place_id. This migration adds a column to a trigger's
-- argument list and nothing else.
drop trigger if exists social_property_research_capture_revision on public.social_property_research;
create trigger social_property_research_capture_revision
  before update on public.social_property_research
  for each row execute function public.social_capture_revision(
    'place_id', 'property_name', 'stable', 'pricing', 'sources', 'unresolved');
