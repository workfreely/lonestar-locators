-- Autopilot rotation rules — one scheduling policy per CONNECTED ACCOUNT.
--
-- WHY A NEW TABLE RATHER THAN A COLUMN ON social_recurring_rules. That table binds a rule to ONE
-- source_content_id: it answers "repost THIS clip on a cadence". A rotation rule answers a
-- different question — "fill this account's slots from the ready pool, in this market order" — and
-- has no single content item at all. Bolting rotation onto it would make source_content_id
-- sometimes authoritative and sometimes ignored, which is exactly the ambiguity to avoid.
--
-- The two coexist deliberately. social_recurring_rules and its interval/jitter cadence are
-- untouched and keep working for anything that uses them.
--
-- TIMING IS NOT REDEFINED HERE. These rules feed the EXISTING planDailyTimes with cadence
-- 'daily_times'; the per-account stagger is expressed as shifted minutes, not a new mode.

create table if not exists public.social_autopilot_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,

  -- The connected account this policy governs. Rotation and stagger are both keyed on the
  -- CONNECTION, not the owner: one owner may run several accounts and they must differ from each
  -- other. UNIQUE because two competing policies for one account has no sensible meaning.
  connection_id uuid not null unique references public.social_connections(id) on delete cascade,

  -- OFF by default. A rule that exists is not a rule that is running.
  enabled boolean not null default false,

  timezone text not null default 'America/Chicago',

  -- The BASELINE times, before this account's stagger: 07:30 and 19:30 as minutes from local
  -- midnight. The effective times are these plus social_connections.stagger_offset_minutes (null
  -- there ⇒ a stable 1..30 derived from the connection id).
  daily_times int[] not null default '{450,1170}',
  posts_per_day int not null default 2 check (posts_per_day between 1 and 3),

  -- Market preference, highest first. PREFERENCES, NOT QUOTAS: a market with no eligible rendered
  -- content simply does not participate, and the others absorb the slot.
  market_weights jsonb not null default '{"Dallas":3,"San Antonio":3,"Houston":1,"Austin":1}'::jsonb,

  -- Rotation of that weighted order for THIS account, so two accounts invert (Dallas AM/SA PM vs
  -- SA AM/Dallas PM). Null ⇒ derived from connection_id. Set it to pin an account deliberately.
  market_rotation_seed int,

  -- How far ahead a planning run fills. Bulk scheduling from an already-rendered pool, so this is
  -- a planning horizon, not a commitment to have inventory.
  horizon_days int not null default 14 check (horizon_days between 1 and 90),

  last_planned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_autopilot_rules_enabled_idx
  on public.social_autopilot_rules (enabled) where enabled;

alter table public.social_autopilot_rules enable row level security;
-- Service-role only, like the render queue: planning is a server concern and the browser has no
-- reason to read or write scheduling policy directly.

-- Which connection a scheduled post belongs to. social_posts.connection_id already exists and the
-- publish worker already resolves the destination from it — but generateRecurrence never set it,
-- so recurrence-generated posts had no destination and could not publish. The rotation planner
-- sets it explicitly; this comment records why that mattered.
