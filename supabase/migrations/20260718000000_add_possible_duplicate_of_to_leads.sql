-- Links a newly-created lead to an existing one it may be a duplicate of
-- (a weaker "possible" match: name + move_date agree, but neither phone
-- nor email did — see lib/leads/duplicateDetection.ts). A locator reviews
-- and decides; nothing here auto-merges. `on delete set null` so this
-- never blocks removing the referenced lead in the future.
--
-- Purely additive: nullable, no default, no backfill, no change to any
-- existing row.

alter table public.leads
  add column if not exists possible_duplicate_of bigint references public.leads(id) on delete set null;
