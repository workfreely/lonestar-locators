-- ROLLBACK 20261112000000_property_criminal_background.
--
-- DESTRUCTIVE: dropping a column takes its data with it. Safe immediately after applying, while
-- every column is still empty — which is what the migration's own verify step 3 proves. Once an
-- agent has entered a policy, EXPORT FIRST:
--
--   \copy (select place_id, felony_policy, felony_min_age_years, felony_restrictions,
--                 misdemeanor_policy, misdemeanor_min_age_years, misdemeanor_restrictions,
--                 criminal_restricted_offense_types, criminal_lookback_basis,
--                 background_screening_notes
--            from public.property_catalog
--           where felony_policy is not null or misdemeanor_policy is not null
--              or felony_restrictions is not null or misdemeanor_restrictions is not null
--              or criminal_restricted_offense_types is not null
--              or criminal_lookback_basis is not null or background_screening_notes is not null
--              or felony_min_age_years is not null or misdemeanor_min_age_years is not null)
--     to 'criminal_background_backup.csv' csv header;
--
-- property_enrichment_events keeps its own append-only record either way: dropping the columns
-- does not erase the audit trail of what was written to them.
--
-- The constraints go with the columns, so they are not dropped separately.

alter table public.property_catalog
  drop column if exists felony_policy,
  drop column if exists felony_min_age_years,
  drop column if exists felony_restrictions,
  drop column if exists misdemeanor_policy,
  drop column if exists misdemeanor_min_age_years,
  drop column if exists misdemeanor_restrictions,
  drop column if exists criminal_restricted_offense_types,
  drop column if exists criminal_lookback_basis,
  drop column if exists background_screening_notes;
