-- Property Search Agent — CHECKPOINT 1: provenance/history + image persistence.
--
-- Infrastructure ONLY. No property is enriched here; the 4,202 catalog rows are
-- not touched except to backfill the new image_selection_state (derived from the
-- image they already have — no image bytes/URLs change).
--
-- Design: ONE append-only audit table (property_enrichment_events) is the full
-- per-field history/provenance trail; a VIEW (property_field_provenance) derives
-- the CURRENT provenance per (place_id, field) as the latest 'written' event. We do
-- NOT duplicate the property_catalog row per change. Existing image-specific
-- provenance columns (property_image_source / _source_detail / _checked_at /
-- _verified_at / _status) remain as they are.

-- ── Append-only field-level enrichment audit trail ──────────────────────────
create table if not exists public.property_enrichment_events (
  id                  uuid primary key default gen_random_uuid(),
  seq                 bigint generated always as identity, -- monotonic: strict "latest" tiebreaker
  job_id              text not null,                 -- the enrichment event/job that produced this
  place_id            text not null references public.property_catalog(place_id) on delete cascade,
  field_name          text not null,
  action              text not null check (action in ('written','skipped','rejected')),
  old_value           text,                          -- prior value (history preserved, never destroyed)
  new_value           text,                          -- value written (for 'written') or candidate (skip/reject)
  source_type         text not null check (source_type in (
                        'official_property_site','official_management_site','google_places',
                        'trusted_locator_source','trusted_brokerage_source','manual_verified',
                        'public_web','unknown')),
  source_reference    text,                          -- URL, Google Place ID, or internal source id — NOT required
  verification_status text not null check (verification_status in ('verified','inferred','unverified','unknown')),
  reason              text,                           -- why skipped/rejected (or note on write)
  checked_at          timestamptz,                    -- when the source was checked/verified
  created_at          timestamptz not null default now()
);

comment on table public.property_enrichment_events is
  'Append-only per-field enrichment audit trail. Current provenance = latest action=written per (place_id, field_name) via property_field_provenance view. source_reference is a URL, a Google Place ID, or an internal trusted-source id depending on source_type — never a fabricated URL.';

create index if not exists property_enrichment_events_field_idx
  on public.property_enrichment_events (place_id, field_name, created_at desc);
create index if not exists property_enrichment_events_job_idx
  on public.property_enrichment_events (job_id);

-- Service-role / migration only (mirrors property_catalog): RLS on, no policies.
alter table public.property_enrichment_events enable row level security;

-- ── Current per-field provenance (latest written event) ─────────────────────
create or replace view public.property_field_provenance as
  select distinct on (place_id, field_name)
    place_id, field_name,
    new_value           as value,
    source_type,
    source_reference,
    verification_status,
    checked_at,
    created_at          as written_at,
    job_id
  from public.property_enrichment_events
  where action = 'written'
  -- seq is a strict monotonic tiebreaker so the true LATEST wins even when two
  -- written events for the same field share a created_at timestamp.
  order by place_id, field_name, created_at desc, seq desc;

comment on view public.property_field_provenance is
  'Current provenance per (place_id, field_name): the most recent action=written enrichment event. History remains in property_enrichment_events.';

-- ── Image persistence / replacement authorization ───────────────────────────
-- Separate from technical image health (property_image_status stays valid/no_image/
-- unreachable). This governs whether enrichment is AUTHORIZED to replace the image.
alter table public.property_catalog
  add column if not exists image_selection_state text not null default 'missing'
    check (image_selection_state in ('keep','change_requested','missing'));

comment on column public.property_catalog.image_selection_state is
  'Image replacement authorization (NOT health). keep = accepted image, never replace during routine enrichment; change_requested = admin authorized a replacement; missing = no accepted image, enrichment may select one. After a successful MISSING/CHANGE_REQUESTED write the writer returns it to keep.';

-- Backfill: any property that ALREADY has an accepted image URL is KEEP (protected
-- by default — including currently-unreachable URLs, which are flagged by
-- property_image_status but must NOT be silently rotated). Rows with no image URL
-- are MISSING (eligible for first-time image enrichment). No image URL changes.
update public.property_catalog
  set image_selection_state = case
    when property_image_url is not null and btrim(property_image_url) <> '' then 'keep'
    else 'missing'
  end;
