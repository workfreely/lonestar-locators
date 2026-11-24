-- INVESTIGATION — supabase/migrations/20261007000002_social_autopilot_rules.sql, unapplied.
--
-- The migration file has existed since 7 Oct 2026 and has never been applied to production:
--   select * from public.social_autopilot_rules;
--   -- ERROR: Could not find the table 'public.social_autopilot_rules' in the schema cache
--
-- ── FINDING 1: IT IS NOT A BLOCKER FOR THE 07:30 / 19:30 CADENCE ───────────────────────────
-- This corrects an earlier assessment in this project that the cadence could not run until the
-- table landed. It can, and it already is the default.
--
-- NOTHING IN PRODUCTION CODE READS THE TABLE. A full search of lib/, app/ and scripts/ for
-- `social_autopilot_rules` returns exactly ONE hit, and it is a comment:
--
--   lib/social/recurrence.ts:222
--     "BASELINE_DAILY_TIMES (7:30/19:30, read by nothing in production), the social_autopilot_rules
--      column default (7:30/19:30, read by nothing at all), and this one (9:00/19:00)"
--
-- The planner takes its schedule from constants and from social_connections instead:
--
--   lib/social/autopilotDestination.ts:18   BASELINE_DAILY_TIMES = [450, 1170]   -- 07:30, 19:30
--   lib/social/recurrence.ts:30             DEFAULT_TIMEZONE = "America/Chicago" -- Central
--   lib/social/autopilotPlanRun.ts:108      dailyTimes: dailyTimesForPostsPerDay(c.posts_per_day)
--   lib/social/autopilotPlanRun.ts:109      postsPerDay: c.posts_per_day ?? BASELINE_DAILY_TIMES.length
--
-- And every live connection carries posts_per_day = NULL, which falls through to
-- BASELINE_DAILY_TIMES.length = 2. So the planner's effective policy for every destination today
-- is already EXACTLY what was asked for: two posts a day at 07:30 and 19:30 America/Chicago.
--
-- ── FINDING 2: APPLYING IT IS SAFE, AND CHANGES NOTHING ───────────────────────────────────
-- The migration is 63 lines: one `create table if not exists`, one `create index if not exists`,
-- one `enable row level security`, and comments. It declares no policy, so the table is
-- service-role-only, matching the render queue. It reads no row and writes no row.
--
-- It cannot start anything either. /api/cron/social-autopilot-plan runs hourly but is gated by
-- SOCIAL_AUTOPILOT_WRITE_ENABLED, without which it is a dry run that writes nothing
-- (app/api/cron/social-autopilot-plan/route.ts:84), and it would not read the new table in any
-- case. The hourly invocation has NOT been erroring against a missing table — it never asks for it.
--
-- ── FINDING 3: THE REAL GAP IS WIRING, NOT SCHEMA ──────────────────────────────────────────
-- The table's purpose was per-ACCOUNT scheduling policy: its own daily_times, its own
-- posts_per_day, its own market_weights and rotation seed, so two accounts can invert their market
-- order (Dallas AM / San Antonio PM against the reverse). None of that is reachable while the
-- planner reads constants, so applying the table buys a place to put a policy and nothing that
-- reads it.
--
-- RECOMMENDATION: apply it with this release ONLY as forward schema, on the understanding that it
-- changes no behaviour, or leave it unapplied. Do NOT apply it expecting Lisette's cadence to
-- depend on it — hers comes from the constants above, and the way to confirm that is the dry run
-- in the verify block below. Wiring the planner to the table is a separate, behaviour-changing
-- piece of work and should not ride along with the Buffer route.

-- ── VERIFY, BEFORE DECIDING (read-only; run these first) ───────────────────────────────────

-- 1. Confirm the table really is absent, rather than present and empty.
select case when exists (
         select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'social_autopilot_rules')
       then 'PRESENT' else 'ABSENT (as expected)' end as rules_table;

-- 2. Confirm the cadence the planner will actually use for every destination, from the columns it
--    really reads. posts_per_day NULL ⇒ BASELINE_DAILY_TIMES.length = 2 at 07:30 and 19:30.
select sc.provider,
       sc.username,
       sc.posts_per_day,
       coalesce(sc.posts_per_day, 2)      as effective_posts_per_day,
       sc.stagger_offset_minutes,
       sc.market_restriction
  from public.social_connections sc
 order by sc.provider, sc.username;
-- expect: posts_per_day NULL on every row ⇒ effective 2/day at the baseline times

-- 3. Confirm the hourly planner is still a dry run, so nothing can be scheduled by surprise.
--    (Environment, not SQL — check in Vercel:)
--      SOCIAL_AUTOPILOT_WRITE_ENABLED   must be unset or anything other than exactly 'true'
--      SOCIAL_AUTOPILOT_TRIGGER_ENABLED must be unset or anything other than exactly 'true'

-- ── IF APPLYING ────────────────────────────────────────────────────────────────────────────
-- Run the existing file unchanged — it needs no edit:
--   supabase/migrations/20261007000002_social_autopilot_rules.sql
--
-- Then confirm it landed inert:
--   select count(*) as rule_rows from public.social_autopilot_rules;   -- expect 0
--   select relrowsecurity from pg_class where relname = 'social_autopilot_rules'; -- expect true
--   select count(*) as policies from pg_policies
--    where schemaname = 'public' and tablename = 'social_autopilot_rules';        -- expect 0
