-- Specials freshness + enrichment marker (CP4).
--
-- Current specials are time-sensitive and must be refreshable INDEPENDENTLY of stable
-- property characteristics (so a Specials Refresh job never re-researches windows,
-- views, garages, etc.). We track special freshness on dedicated columns; stable
-- attributes keep their own per-attribute checked_at in property_attributes.
-- intel_enriched_at marks the last full enrichment pass (data-health + resume aid).
-- Additive only; changes no existing value. Commission + images untouched.

alter table public.property_catalog
  add column if not exists current_special_checked_at timestamptz,
  add column if not exists current_special_source      text,
  add column if not exists intel_enriched_at           timestamptz;

comment on column public.property_catalog.current_special_checked_at is
  'When current_special was last verified from an approved source. Freshness is tracked separately from stable attributes so specials can refresh without re-researching everything.';
comment on column public.property_catalog.current_special_source is
  'Approved/authoritative source the current_special was captured from.';
comment on column public.property_catalog.intel_enriched_at is
  'Timestamp of the last Property Intelligence enrichment pass for this property (data-health + resume aid, never the sole resume authority).';
