-- Reverses 20261110000000. Drops only columns that migration added; no existing column is touched.
alter table public.property_catalog
  drop constraint if exists property_catalog_broken_lease_status_vocab,
  drop constraint if exists property_catalog_eviction_status_vocab,
  drop constraint if exists property_catalog_rental_debt_status_vocab,
  drop constraint if exists property_catalog_bl_balance_requirement_vocab,
  drop constraint if exists property_catalog_screening_age_sane,
  drop constraint if exists property_catalog_bl_max_balance_sane;
alter table public.property_catalog
  drop column if exists broken_lease_status,
  drop column if exists broken_lease_min_age_years,
  drop column if exists broken_lease_balance_requirement,
  drop column if exists broken_lease_max_balance,
  drop column if exists eviction_status,
  drop column if exists eviction_min_age_years,
  drop column if exists rental_debt_status,
  drop column if exists screening_additional_deposit,
  drop column if exists screening_risk_fee,
  drop column if exists screening_guarantor_program,
  drop column if exists screening_requirements_checked_at;
