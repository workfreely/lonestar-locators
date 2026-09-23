-- Canonical property record — minimal stable schema every property_catalog row shares.
-- ADDITIVE ONLY: all new columns are nullable, so the existing 4,202 rows and every
-- current reader/seed keep working unchanged. Reuses the columns already present
-- (place_id, website_url, google_rating, property_image_url, zip, updated_at,
-- neighborhood/location/location_keywords) — no duplicate concepts.
--
-- Flexible intelligence (amenities, floor plans, approval policy, per-field
-- provenance, normalized specials) is intentionally NOT modeled here — those get
-- their own normalized tables in a later checkpoint. This is the shared core only.
--
-- Writes remain service-role / migration only (no RLS write policy is added).

alter table public.property_catalog
  -- Locator Beast-owned identity (canonical PK going forward); place_id stays the
  -- EXTERNAL reference only. Backfilled for every existing row.
  add column if not exists property_id uuid not null default gen_random_uuid(),
  add column if not exists property_name text,
  add column if not exists market text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists property_type text,
  add column if not exists management_company text,
  add column if not exists leasing_email text,
  add column if not exists phone text,
  add column if not exists google_review_count integer,
  -- Commission is stored verbatim as our master expresses it (e.g. "50%", "$1,500").
  -- POPULATED ONLY FROM APPROVED LB/MASTER INTELLIGENCE — never from web research.
  add column if not exists send_commission text,
  add column if not exists escort_commission text,
  add column if not exists bonus_flat text,
  add column if not exists current_special text,
  -- Record-level provenance for this minimal schema (per-field provenance is the
  -- deferred normalized structure). `source` names where the record was last
  -- verified from; `verified_at` when.
  add column if not exists source text,
  add column if not exists verified_at timestamptz;

-- LB identity is unique and the intended canonical key.
create unique index if not exists property_catalog_property_id_key
  on public.property_catalog (property_id);

comment on column public.property_catalog.property_id is 'Locator Beast-owned canonical identity (UUID). place_id is external reference only.';
comment on column public.property_catalog.send_commission is 'Verbatim from approved LB/master intelligence ONLY. Never web-researched/inferred.';
comment on column public.property_catalog.escort_commission is 'Verbatim from approved LB/master intelligence ONLY. Never web-researched/inferred.';
comment on column public.property_catalog.bonus_flat is 'Verbatim from approved LB/master intelligence ONLY. Never web-researched/inferred.';
comment on column public.property_catalog.source is 'Record-level provenance (e.g. lb_master_verified, google_places, web_research).';
comment on column public.property_catalog.verified_at is 'When the record was last verified from its source.';
