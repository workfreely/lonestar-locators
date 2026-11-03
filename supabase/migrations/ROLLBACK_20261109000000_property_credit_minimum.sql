-- ROLLBACK of 20261109000000_property_credit_minimum.
--
-- SAFE ONLY WHILE THE COLUMNS HOLD NOTHING. The migration is additive and backfills nothing, so
-- immediately after applying it this is a clean reversal. Once an owner has entered a credit
-- minimum through the editor, dropping these columns DESTROYS that data — there is nowhere else
-- it lives. Run the guard below first and believe it.

-- GUARD: must return 0. Anything higher means real data would be lost; stop.
select count(*) as rows_with_data
  from public.property_catalog
 where credit_minimum_status is not null
    or credit_minimum_score is not null
    or credit_observed_approval_score is not null
    or credit_screening_notes is not null
    or credit_screening_checked_at is not null;

-- Constraints first (dropping the columns would take them anyway; explicit is clearer).
alter table public.property_catalog drop constraint if exists property_catalog_credit_minimum_status_check;
alter table public.property_catalog drop constraint if exists property_catalog_credit_minimum_score_check;
alter table public.property_catalog drop constraint if exists property_catalog_credit_observed_approval_check;

alter table public.property_catalog
  drop column if exists credit_minimum_status,
  drop column if exists credit_minimum_score,
  drop column if exists credit_observed_approval_score,
  drop column if exists credit_screening_notes,
  drop column if exists credit_screening_checked_at;

-- Neither read function was changed by the migration, so there is nothing to restore here.
-- property_field_provenance rows naming these fields are left in place: they are an append-only
-- audit of what a human recorded, and deleting history is not part of reversing a schema change.
