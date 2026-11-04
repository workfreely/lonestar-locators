-- ROLLBACK 20261114000001_lead_quick_match_state.
--
-- DROPPING `origin` DELETES THE DISTINCTION between a generated draft and a hand-picked row.
-- The rows themselves survive — they are ordinary recommendations — but after this nothing can
-- tell them apart, so a later refresh could not safely replace its own output. Check what exists
-- before running it:
--
--   select origin, count(*), count(reviewed_at) as reviewed
--     from public.lead_recommendations group by 1;
--
-- If generated rows are present and wanted, DELETE them first (they are drafts, not the agent's
-- work) and only then drop the columns:
--
--   delete from public.lead_recommendations where origin = 'quick_match' and reviewed_at is null;
drop index if exists public.lead_recommendations_quick_match_idx;
alter table public.lead_recommendations drop constraint if exists lead_recommendations_origin_vocab;
alter table public.lead_recommendations
  drop column if exists origin,
  drop column if exists reviewed_at,
  drop column if exists screening;
alter table public.leads drop column if exists quick_match_at;
