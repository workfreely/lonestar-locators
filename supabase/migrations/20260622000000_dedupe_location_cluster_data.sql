-- Deduplicate jsonb array columns on location_clusters.
--
-- Earlier landmark-append migrations (20260619000000, 20260621000000) used
-- guard clauses that only checked for the absence of ONE representative
-- term before appending a whole list — if the rest of that list had
-- already been added by a prior migration, those terms got duplicated.
-- Known affected rows: downtown_pearl.landmarks, southside_brooks.landmarks.
--
-- This migration is column-agnostic and cluster-agnostic: it rebuilds
-- landmarks, aliases, corridor_keywords, and property_keywords for every
-- row by collapsing case-insensitive duplicate entries down to a single
-- occurrence, preserving original casing and first-seen order. No values
-- are removed except literal/case-insensitive repeats — every unique
-- keyword survives. Cluster relationships (nearby_clusters), core/nearby
-- ZIPs, and all other columns are untouched.
--
-- Safe to re-run: a fully-deduplicated array is a no-op when run again.

create or replace function _dedupe_jsonb_text_array(arr jsonb)
returns jsonb as $$
  select coalesce(
    jsonb_agg(value order by ord),
    '[]'::jsonb
  )
  from (
    select value, min(ord) as ord
    from jsonb_array_elements_text(arr) with ordinality as t(value, ord)
    group by lower(trim(value))
  ) deduped
$$ language sql immutable;

update location_clusters set
  landmarks          = _dedupe_jsonb_text_array(landmarks),
  aliases             = _dedupe_jsonb_text_array(aliases),
  corridor_keywords   = _dedupe_jsonb_text_array(corridor_keywords),
  property_keywords   = _dedupe_jsonb_text_array(property_keywords),
  updated_at          = now()
where
  landmarks          <> _dedupe_jsonb_text_array(landmarks)
  or aliases          <> _dedupe_jsonb_text_array(aliases)
  or corridor_keywords <> _dedupe_jsonb_text_array(corridor_keywords)
  or property_keywords <> _dedupe_jsonb_text_array(property_keywords);

drop function _dedupe_jsonb_text_array(jsonb);
