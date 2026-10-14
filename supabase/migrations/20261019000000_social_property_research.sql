-- REUSABLE PROPERTY RESEARCH — researched once per community, read by every video of it.
--
-- ── WHY A TABLE AND NOT social_content.details ──────────────────────────────────────────────
-- details is jsonb, already live, and already carries details.preparedPost — so a sibling key
-- would have needed no migration at all. It is still the wrong home: social_content is ONE ROW
-- PER VIDEO. Measured on the live library, 154 content rows resolve to 126 distinct place_ids,
-- and 20 properties span 47 videos. Research kept there would be duplicated two to four times for
-- those twenty and, worse, the copies would drift — one video's record edited, the others left
-- stale, with nothing to say which was right. One row per property is the whole point.
--
-- ── IDENTITY: (owner_user_id, place_id), NEVER place_id ALONE ───────────────────────────────
-- place_id identifies a BUILDING. It says nothing about who may read the research about it, and
-- two operators researching the same community must not read or overwrite each other's notes.
-- The unique constraint is therefore on the PAIR, and every policy below is account-scoped.
--
-- ── STABLE AND TIME-SENSITIVE ARE SEPARATE COLUMNS ─────────────────────────────────────────
-- A building's ceiling heights do not expire; a concession does, often within weeks. Keeping them
-- in one blob forces one verification date onto facts with completely different half-lives, which
-- is how a nine-month-old "8 weeks free" ends up presented as current. `stable` and `pricing` are
-- split so each carries its own verified_at and can be re-checked independently.
--
-- Shapes are deliberately jsonb rather than columns: the floor-plan catalogue is a list whose
-- length differs per property (one had five plans, another sixty-four), and every field has to be
-- able to carry its own qualification — "select floor plans only", "available for a fee" — beside
-- the value. A column per attribute could not hold that.

create table if not exists public.social_property_research (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  -- Google Places id. Present on 153 of 154 live content rows, so it is a real key, not a new one.
  place_id text not null,
  property_name text,

  -- STABLE: address, neighborhood, building history, stories, unit counts, architecture, exact
  -- ceiling heights, layouts, interior features, community amenities, laundry, parking, official
  -- website, and the full floor-plan catalogue (model, beds, baths, sqft, plan-specific features).
  stable jsonb not null default '{}'::jsonb,

  -- TIME-SENSITIVE: starting prices by bedroom category, per-plan and per-unit pricing, specials,
  -- lease terms, availability dates. Every entry carries its own verified_at, and a status drawn
  -- from: verified_current | previously_recorded | expired | conflicting | unknown.
  pricing jsonb not null default '{}'::jsonb,

  -- SOURCES: [{ url, kind: 'official' | 'third_party', verified_at, covers: [...] }]. Kind is
  -- recorded because "the leasing page says so" and "an aggregator says so" are not the same
  -- claim, and the UI has to be able to show which one a fact rests on.
  sources jsonb not null default '[]'::jsonb,

  -- Open questions, contradictions between sources, and anything awaiting confirmation. Kept as
  -- first-class data rather than prose inside a note, so a conflict can never be silently lost
  -- when a record is updated.
  unresolved jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ONE ROW PER PROPERTY PER ACCOUNT. This is what makes the research reusable rather than copied.
  constraint social_property_research_owner_place_key unique (owner_user_id, place_id)
);

comment on table public.social_property_research is
  'Reusable, account-scoped research for one apartment community, keyed on (owner_user_id, place_id). Read by every social_content row sharing that place_id. Stable building facts and time-sensitive pricing are separate columns so they can carry independent verification dates.';

-- A place_id is looked up constantly (every video of that property resolves through it) and the
-- unique constraint already indexes (owner_user_id, place_id); this serves the reverse lookup.
create index if not exists social_property_research_place_idx
  on public.social_property_research (place_id);

alter table public.social_property_research enable row level security;
alter table public.social_property_research force row level security;

-- OWNER. Mirrors the existing "platform admin owns social_content" policy exactly, so research
-- inherits the same authorization boundary the content it describes already has.
drop policy if exists "owner manages property research" on public.social_property_research;
create policy "owner manages property research"
  on public.social_property_research
  for all
  using (is_platform_admin() and owner_user_id = auth.uid())
  with check (is_platform_admin() and owner_user_id = auth.uid());

-- AGENT READ. Mirrors "agent reads shared content": an agent connected to this owner may READ the
-- research for a property only when that owner has actually shared a video of it with agents.
-- Research is not shared by being researched; it is shared by the content being shared.
drop policy if exists "agent reads shared property research" on public.social_property_research;
create policy "agent reads shared property research"
  on public.social_property_research
  for select
  using (
    exists (
      select 1
      from public.social_connections c
      where c.agent_user_id = auth.uid()
        and c.agent_user_id is distinct from c.owner_user_id
        and c.owner_user_id = social_property_research.owner_user_id
    )
    and exists (
      select 1
      from public.social_content sc
      where sc.owner_user_id = social_property_research.owner_user_id
        and sc.place_id = social_property_research.place_id
        and sc.available_to_agents
    )
  );
