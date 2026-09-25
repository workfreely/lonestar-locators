-- New Property REVIEW bucket.
--
-- Newly-discovered properties (resolved via Places identity) are NOT admitted to
-- active property_catalog automatically. They land here for manual locator-inventory
-- approval, because the active catalog prioritizes properties known to work with /
-- pay locators. Skipped/excluded decisions are REMEMBERED forever (never deleted)
-- so future discovery can "previously reviewed → skip" before spending API/enrichment
-- work. Locator participation is tracked SEPARATELY and never inferred from public
-- sources. Service-role only.

create table if not exists public.property_review_candidates (
  place_id            text primary key,                    -- one row per distinct Google Place ID
  property_name       text,
  formatted_address   text,
  market              text,
  latitude            double precision,
  longitude           double precision,
  source_files        text[] not null default '{}',        -- originating workbook(s)
  source_row_ids      text[] not null default '{}',        -- lineage (multiple = duplicate source rows)
  source_category     text,                                 -- inventory type/category if known
  discovered_at       timestamptz not null default now(),   -- identity-resolution date
  resolution_evidence jsonb not null default '{}'::jsonb,   -- google name/addr/coords/reason/name-score
  review_status       text not null default 'pending'
                        check (review_status in ('pending','approved','skipped','excluded')),
  review_reason       text,
  -- Locator participation — SEPARATE from review status, NEVER set from Google/public.
  -- Unknown must never be interpreted as No-Pay.
  locator_status      text not null default 'unknown'
                        check (locator_status in ('verified_paying','verified_no_pay','unknown')),
  reviewed_at         timestamptz,
  reviewed_by         text,                                 -- populated later by the admin UI
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.property_review_candidates is
  'Manual-approval queue for newly-discovered properties (not auto-admitted to property_catalog). Skipped/excluded rows persist so discovery can dedupe against them. locator_status is separate and never derived from public sources.';
comment on column public.property_review_candidates.locator_status is
  'Locator participation, tracked independently of discovery/review. verified_paying/verified_no_pay/unknown; unknown != no_pay; never populated from Google or public web.';

create index if not exists property_review_candidates_market_status_idx
  on public.property_review_candidates (market, review_status);
create index if not exists property_review_candidates_status_idx
  on public.property_review_candidates (review_status);

drop trigger if exists property_review_candidates_touch on public.property_review_candidates;
create trigger property_review_candidates_touch
  before update on public.property_review_candidates
  for each row execute function public.set_updated_at();

alter table public.property_review_candidates enable row level security;

-- Discovery dedupe surface: every Place ID we already KNOW about, with why.
-- Future discovery/enrichment must consult this first (previously reviewed → skip)
-- so no API/research is wasted re-discovering catalog rows or skipped/excluded ones.
create or replace view public.property_known_place_ids as
  select place_id, 'active_catalog'::text as known_as, null::text as review_status
    from public.property_catalog
  union
  select place_id, 'review_candidate'::text as known_as, review_status
    from public.property_review_candidates;

comment on view public.property_known_place_ids is
  'Union of active-catalog Place IDs and review-bucket Place IDs (with review_status). Discovery jobs check this before researching a Place ID: previously reviewed/known → skip.';
