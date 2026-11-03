-- ROLLBACK for 20261110000004_approval_criteria_fields.sql.
--
-- DROPS the five columns and the three constraints, which DISCARDS any approval criteria entered
-- into them. The append-only audit trail in property_enrichment_events survives the drop, so a
-- value entered through the editor is still recoverable from provenance afterwards — but nothing
-- re-reads it automatically. Run this only on a database where the editor has not been used in
-- earnest, or after exporting those events.

alter table public.property_catalog
  drop constraint if exists property_catalog_ev_balance_requirement_vocab,
  drop constraint if exists property_catalog_rd_balance_requirement_vocab,
  drop constraint if exists property_catalog_rd_max_balance_sane;

alter table public.property_catalog
  drop column if exists broken_lease_positive_history_required,
  drop column if exists eviction_balance_requirement,
  drop column if exists eviction_positive_history_required,
  drop column if exists rental_debt_balance_requirement,
  drop column if exists rental_debt_max_balance;
