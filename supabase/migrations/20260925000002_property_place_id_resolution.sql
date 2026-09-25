-- Property Place ID identity-resolution LEDGER.
--
-- Durable, reusable record of Google Places (New) identity-resolution attempts,
-- kept SEPARATE from property_catalog and the source workbooks. Only
-- classification = 'ACCEPTED_HIGH_CONFIDENCE' is eligible for automatic matching
-- in the eventual merge. Google fields here are identity evidence ONLY — they are
-- NOT authorization to enrich property_catalog. Service-role only.

create table if not exists public.property_place_id_resolution (
  id               uuid primary key default gen_random_uuid(),
  batch_label      text not null default 'calibration_2026_09_25',
  source_file      text not null,
  source_sheet     text,
  source_row_id    text,
  market           text,
  source_name      text,
  source_address   text,
  place_id         text,               -- resolved Google Place ID (null when unresolved)
  google_name      text,
  google_address   text,
  latitude         double precision,
  longitude        double precision,
  website_domain   text,               -- only when an Enterprise (websiteUri) escalation was used
  candidate_count  integer,
  classification   text not null check (classification in
                     ('ACCEPTED_HIGH_CONFIDENCE','AMBIGUOUS_MULTIPLE_MATCHES','NO_RELIABLE_MATCH','API_ERROR','INVALID_SOURCE_RECORD')),
  reason           text,
  sku_tier         text,               -- Pro | Enterprise | Essentials
  checked_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (source_file, source_row_id)  -- idempotent: a resolved row is not re-resolved
);

comment on table public.property_place_id_resolution is
  'Identity-resolution evidence ledger (Google Places New). Separate from property_catalog; ACCEPTED_HIGH_CONFIDENCE only is merge-eligible. Not enrichment authorization.';
create index if not exists property_place_id_resolution_place_idx on public.property_place_id_resolution (place_id);
create index if not exists property_place_id_resolution_class_idx on public.property_place_id_resolution (classification);

alter table public.property_place_id_resolution enable row level security;
