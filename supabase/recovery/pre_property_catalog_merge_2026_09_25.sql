-- ONE-TIME pre-merge recovery snapshot (production).
--
-- Creates the durable checkpoint `pre_property_catalog_merge_2026_09_25`: a full
-- frozen copy of every property_catalog row + integrity hashes, so the catalog can
-- be restored to its exact pre-import state via property_merge_rollback (targeted,
-- per-run) WITHOUT a full-DB rollback. Idempotent (safe to re-run). Reads
-- property_catalog only; does NOT mutate it.
--
-- Requires migration 20260925000001_property_merge_recovery.sql applied first.
-- Pass the deployed commit:  psql ... -v gitcommit=<sha> -f this_file.sql

\set ON_ERROR_STOP on
begin;

insert into public.property_catalog_snapshots
  (checkpoint_id, environment, git_commit, catalog_row_count, related_counts, image_state_counts, image_url_md5, commission_md5, notes)
select
  'pre_property_catalog_merge_2026_09_25',
  'production',
  :'gitcommit',
  (select count(*) from public.property_catalog),
  jsonb_build_object(
    'property_enrichment_events', (select count(*) from public.property_enrichment_events),
    'property_field_provenance',  (select count(*) from public.property_field_provenance)
  ),
  jsonb_build_object(
    'keep',             (select count(*) from public.property_catalog where image_selection_state = 'keep'),
    'missing',          (select count(*) from public.property_catalog where image_selection_state = 'missing'),
    'change_requested', (select count(*) from public.property_catalog where image_selection_state = 'change_requested')
  ),
  (select md5(coalesce(string_agg(coalesce(property_image_url,'∅'), '|' order by place_id), ''))
     from public.property_catalog),
  (select md5(coalesce(string_agg(
      coalesce(send_commission,'∅') || '/' || coalesce(escort_commission,'∅') || '/' || coalesce(bonus_flat,'∅'),
      '|' order by place_id), ''))
     from public.property_catalog),
  'Pre-merge recovery checkpoint captured before the first new-property import.'
on conflict (checkpoint_id) do nothing;

-- Full frozen copy of every property_catalog row (all columns).
insert into public.property_catalog_snapshot_rows (checkpoint_id, place_id, row_data)
select 'pre_property_catalog_merge_2026_09_25', pc.place_id, to_jsonb(pc)
from public.property_catalog pc
on conflict (checkpoint_id, place_id) do nothing;

commit;
