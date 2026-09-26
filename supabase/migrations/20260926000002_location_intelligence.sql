-- Google Location Intelligence — Phase 1 foundation (ADDITIVE, non-destructive, service-role).
--
-- Normalized, reusable location architecture (no per-landmark columns on property_catalog):
--   • location_landmarks       — curated fixed destinations (named) + optional category anchors
--   • location_nearby_categories — reusable brand/category proximity DEFINITIONS (H-E-B, grocery,
--                                  hospital, park, gym, transit) resolved on-demand later, NOT per-property
--   • property_landmark_metrics — cache of property↔(landmark|category) drive relationships
--   • property_hours           — structured leasing/office hours for tour-time validation
--   • property_catalog.business_status — Google operational status
-- No data is fetched from Google here; landmark Place IDs/coords are left NULL until an
-- explicitly-approved resolver runs (never guessed).

-- ── Fixed named landmarks (curated) ──
create table if not exists public.location_landmarks (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  market        text,                                   -- Austin | Dallas | Houston | San Antonio (null = cross-market)
  category      text not null check (category in (
                  'neighborhood','medical','education','military_government','employment',
                  'transportation','shopping','sports_venue','attraction','iconic','outdoor_recreation')),
  landmark_kind text not null default 'named' check (landmark_kind in ('named','category_anchor')),
  google_place_id text,                                 -- NULL until resolved; never guessed
  latitude      double precision,
  longitude     double precision,
  formatted_address text,
  is_active     boolean not null default true,
  source        text,
  verified_at   timestamptz,                            -- when Place ID/coords were resolved/verified
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, market)
);
comment on table public.location_landmarks is
  'Curated fixed landmarks per market. google_place_id/lat/lng NULL until an approved resolver fills them — never guessed. Reusable across all properties via property_landmark_metrics.';
create index if not exists location_landmarks_market_cat_idx on public.location_landmarks (market, category);
create index if not exists location_landmarks_unresolved_idx on public.location_landmarks (market) where google_place_id is null;
drop trigger if exists location_landmarks_touch on public.location_landmarks;
create trigger location_landmarks_touch before update on public.location_landmarks for each row execute function public.set_updated_at();
alter table public.location_landmarks enable row level security;

-- ── Reusable brand / category proximity definitions (NOT per-property landmarks) ──
create table if not exists public.location_nearby_categories (
  id            uuid primary key default gen_random_uuid(),
  category_key  text not null unique,                   -- 'heb','trader_joes','grocery','hospital_er','park_trail','gym','transit', ...
  label         text not null,
  kind          text not null check (kind in ('brand','category')),  -- brand = specific chain; category = generic "nearest X"
  google_included_type text,                            -- Places (New) type for category searches (supermarket, hospital, park, gym, transit_station)
  text_query    text,                                   -- brand text query when no clean type (e.g. 'H-E-B')
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
comment on table public.location_nearby_categories is
  'Definitions for on-demand/cached nearest-brand and nearest-category proximity searches. Not fixed landmarks; resolved per-property on demand and cached in property_landmark_metrics.';
alter table public.location_nearby_categories enable row level security;

-- ── property ↔ landmark|category drive-metric cache ──
create table if not exists public.property_landmark_metrics (
  id                 bigint generated always as identity primary key,
  place_id           text not null references public.property_catalog(place_id) on delete cascade,
  landmark_id        uuid references public.location_landmarks(id) on delete cascade,
  nearby_category_id uuid references public.location_nearby_categories(id) on delete cascade,
  nearest_place_id   text,                              -- for category matches: the specific nearby place found
  drive_meters       integer,
  drive_seconds      integer,
  traffic_mode       text not null default 'none' check (traffic_mode in ('none','best_guess')),
  computed_at        timestamptz not null default now(),
  -- exactly one target: a fixed landmark OR a category
  constraint plm_one_target check ((landmark_id is not null)::int + (nearby_category_id is not null)::int = 1)
);
comment on table public.property_landmark_metrics is
  'Durable drive-time cache. traffic_mode=none is the durable baseline; best_guess is computed on-demand + cached short-term. Prepared, NOT populated in Phase 1.';
create unique index if not exists plm_landmark_uniq on public.property_landmark_metrics (place_id, landmark_id, traffic_mode) where landmark_id is not null;
create unique index if not exists plm_category_uniq on public.property_landmark_metrics (place_id, nearby_category_id, traffic_mode) where nearby_category_id is not null;
create index if not exists plm_landmark_idx on public.property_landmark_metrics (landmark_id);
alter table public.property_landmark_metrics enable row level security;

-- ── Structured property hours (tour-time validation) ──
create table if not exists public.property_hours (
  id           bigint generated always as identity primary key,
  place_id     text not null references public.property_catalog(place_id) on delete cascade,
  hours_type   text not null default 'leasing_office' check (hours_type in ('leasing_office','property_access')),
  day_of_week  smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  segment      smallint not null default 1,             -- >1 = split hours (e.g. 9–12, 1–5)
  is_closed    boolean not null default false,
  opens        time,
  closes       time,
  timezone     text,                                    -- IANA, e.g. America/Chicago
  source       text,
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (place_id, hours_type, day_of_week, segment)
);
comment on table public.property_hours is
  'Structured hours per day/segment. Missing data stays ABSENT (never written as is_closed). Populated by an approved Places-hours job.';
create index if not exists property_hours_place_idx on public.property_hours (place_id);
drop trigger if exists property_hours_touch on public.property_hours;
create trigger property_hours_touch before update on public.property_hours for each row execute function public.set_updated_at();
alter table public.property_hours enable row level security;

-- ── business_status on the catalog ──
alter table public.property_catalog
  add column if not exists business_status text;         -- OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | null (unknown)
comment on column public.property_catalog.business_status is
  'Google Places businessStatus. NULL = unknown (never inferred). Filled by the approved Places-hours/details job.';
