-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL BEAST — property research observations (Phase 1)
--
-- Social Beast records what the locator OBSERVED while editing a video. These are
-- OBSERVATIONS, never authority. No code path leads from these tables to
-- property_catalog, property_floor_plans, property_attributes or property_specials.
-- Mini Beast (lib/propertyEnrichment) remains the only writer of authoritative
-- Property Intelligence; it may later read these, map them to FieldCandidate, and
-- let its existing preserve-by-default policy decide. Nothing consumes them yet.
--
-- Keyed on place_id — already stored on social_content, already the PK of
-- property_catalog, and already the key of every satellite table.
--
-- TWO TABLES, because there are two shapes. A property observation is field=value
-- ("onebr_starting_rent" = "1850"). A floor-plan observation is one COMPOSITE fact
-- ("2BC · 2 bed · 2 bath · 1,240 sq ft · $3,500") whose parts are meaningless
-- apart — "beds = 2" without "2BC" says nothing. Property Intelligence already
-- made this exact split: property_attributes is EAV, property_floor_plans is a
-- composite row. Mirroring it keeps a later comparison a shape-for-shape match.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1) FIELD-LEVEL property observations ────────────────────────────────────
-- "What does this property generally start at?"
create table if not exists public.social_property_observations (
  id                uuid primary key default gen_random_uuid(),

  -- NO foreign key to property_catalog(place_id), deliberately. A video may be
  -- matched to a real Google place that the 4,202-row catalog has not ingested
  -- yet (today: 1 of 35). A FK would make research impossible for exactly the
  -- properties where it is most valuable — a new property found before the
  -- catalog has it. The index below gives the join performance without the
  -- constraint.
  place_id          text not null,
  social_content_id uuid not null references public.social_content(id) on delete cascade,
  observed_by       uuid not null,

  -- The AUTHORITATIVE catalog column name, verbatim: studio_starting_rent,
  -- onebr_starting_rent, twobr_starting_rent, threebr_starting_rent,
  -- fourbr_starting_rent, townhome_starting_rent, loft_starting_rent,
  -- penthouse_starting_rent, current_special, observed_features. Using the real
  -- names makes a later comparison a field lookup, not a mapping table.
  field             text not null,

  -- VERBATIM text, never parsed to numeric. "around $3,500" and "2 weeks free
  -- w/ 13mo" carry meaning a numeric cast destroys, and casting silently
  -- promotes a hedge to a measurement. Same principle as
  -- property_source_raw.raw_value and property_qualification_review.original_value
  -- ("never flattened").
  value             text not null,

  source_url        text,
  observed_at       date not null,
  status            text not null default 'observed'
                      check (status in ('observed','applied','dismissed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Re-saving research UPDATES in place instead of appending duplicates. Scoped
  -- per VIDEO, not per property: two videos of one property observed on
  -- different days are independent evidence worth keeping both of.
  unique (social_content_id, field)
);

create index if not exists social_property_observations_place_idx
  on public.social_property_observations (place_id);

-- ── 2) VIDEO-SPECIFIC floor plan ────────────────────────────────────────────
-- "What exactly is shown in THIS video?" The primary key is social_content_id,
-- so exactly one floor-plan observation per video is enforced structurally.
create table if not exists public.social_floorplan_observations (
  social_content_id uuid primary key references public.social_content(id) on delete cascade,
  place_id          text not null,
  observed_by       uuid not null,

  -- Mirrors property_floor_plans' vocabulary (name/beds/baths/sqft/starting_rent)
  -- so a later comparison lines up field-for-field. EVERY one is nullable:
  -- "2 Bed" alone is a legitimate observation.
  plan_name         text,     -- "2BC", "A1", "B2"
  beds              numeric,
  baths             numeric,
  sqft              integer,  -- one observed number, not the catalog's min/max pair
  observed_price    text,     -- verbatim, same reasoning as value above

  -- What the price MEANS. Shares its vocabulary with social_content.
  -- price_label_mode but is a SEPARATE concept: that one is marketing copy for
  -- the video overlay, this one is research about the unit shown.
  price_context     text check (price_context in ('starting_at','exact_unit')),

  source_url        text,
  observed_at       date,
  status            text not null default 'observed'
                      check (status in ('observed','applied','dismissed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists social_floorplan_observations_place_idx
  on public.social_floorplan_observations (place_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- MIRRORS social_content exactly: platform admin AND owner. This is not
-- optional bookkeeping — the API writes through the caller's RLS-enforced
-- client, and a table with RLS enabled but NO policy accepts an UPDATE/INSERT
-- that matches zero rows and reports success. (That exact gap on
-- public.workspaces produced a silent no-op write earlier.) Both policies are
-- defined here so the writes actually land.
alter table public.social_property_observations enable row level security;
drop policy if exists "platform admin owns social property observations" on public.social_property_observations;
create policy "platform admin owns social property observations"
  on public.social_property_observations for all
  using (public.is_platform_admin() and observed_by = auth.uid())
  with check (public.is_platform_admin() and observed_by = auth.uid());

alter table public.social_floorplan_observations enable row level security;
drop policy if exists "platform admin owns social floorplan observations" on public.social_floorplan_observations;
create policy "platform admin owns social floorplan observations"
  on public.social_floorplan_observations for all
  using (public.is_platform_admin() and observed_by = auth.uid())
  with check (public.is_platform_admin() and observed_by = auth.uid());

comment on table public.social_property_observations is
  'Social Beast research OBSERVATIONS of property-level fields (field = authoritative property_catalog column name, value verbatim). Never authoritative; nothing writes property_catalog from here. Keyed on place_id with no FK so a not-yet-catalogued property can still be researched.';
comment on table public.social_floorplan_observations is
  'Social Beast research observation of the floor plan SHOWN IN ONE VIDEO (PK = social_content_id). Mirrors property_floor_plans vocabulary for later comparison; Social Beast never writes property_floor_plans.';

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select table_name from information_schema.tables
--  where table_schema='public' and table_name like 'social_%observations';
--
-- -- expect both tables empty (no backfill)
-- select 'property' t, count(*) from public.social_property_observations
-- union all select 'floorplan', count(*) from public.social_floorplan_observations;
--
-- -- expect one policy per table
-- select tablename, policyname, cmd from pg_policies
--  where schemaname='public' and tablename like 'social_%observations';
