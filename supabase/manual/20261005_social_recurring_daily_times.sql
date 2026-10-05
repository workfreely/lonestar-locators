-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL BEAST — a real twice-daily cadence.
--
-- THE PROBLEM. The existing planner maps occurrence index N to DAY N·interval_days — one
-- occurrence per index, therefore one post per day no matter what. posts_per_day only ever
-- BLOCKS a second post placed by something else; it can never create one. And the minute within
-- the day comes from an FNV-1a hash inside a rotating window, so times are deterministic but
-- arbitrary — not chosen.
--
-- "Post at 9:00 AM and 7:00 PM" is therefore not expressible, and no amount of tuning
-- posts_per_day makes it so.
--
-- THE FIX IS ADDITIVE, NOT A REINTERPRETATION. A second cadence mode lives alongside the first:
--
--   cadence = 'interval'     — unchanged. index → day N·interval_days, hash-placed minute inside
--                              an approved window. Every existing rule is this, by default, and
--                              behaves exactly as before.
--   cadence = 'daily_times'  — index → (day, EXPLICIT minute). Two configured times produce
--                              exactly two occurrences per local calendar day, in order, at the
--                              wall-clock times chosen. No hashing, no window rotation.
--
-- daily_times holds MINUTES FROM LOCAL MIDNIGHT (540 = 9:00 AM, 1140 = 7:00 PM) rather than a
-- timestamp or a 'HH:MM' string. Minutes are what the planner already speaks (SLOT_WINDOWS,
-- slotMinute, wallClockToUtcISO all use minute-of-day), and storing a wall-clock minute rather
-- than an instant is what keeps 9:00 AM at 9:00 AM across a DST boundary.
--
-- posts_per_day is NOT repurposed. It stays exactly what it was — a per-day ceiling — and for a
-- daily_times rule it is simply redundant with the number of configured times.
--
-- NO BACKFILL. cadence defaults to 'interval' and daily_times defaults to NULL, so every one of
-- today's rules keeps its current behaviour without being touched. Nothing is migrated.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.social_recurring_rules
  add column if not exists cadence text not null default 'interval',
  add column if not exists daily_times smallint[];

-- Added separately so a re-run against a table that already has the column does not fail.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.social_recurring_rules'::regclass
       and conname = 'social_recurring_rules_cadence_chk'
  ) then
    alter table public.social_recurring_rules
      add constraint social_recurring_rules_cadence_chk check (cadence in ('interval','daily_times'));
  end if;

  -- A daily_times rule MUST carry 1-3 valid minute-of-day values; an interval rule must not carry
  -- any. Enforced in the database because a daily_times rule with no times would silently generate
  -- nothing, which looks identical to a paused rule.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.social_recurring_rules'::regclass
       and conname = 'social_recurring_rules_daily_times_chk'
  ) then
    alter table public.social_recurring_rules
      add constraint social_recurring_rules_daily_times_chk check (
        (cadence = 'interval' and daily_times is null)
        or (
          cadence = 'daily_times'
          and daily_times is not null
          and array_length(daily_times, 1) between 1 and 3
          and (select bool_and(t >= 0 and t < 1440) from unnest(daily_times) t)
        )
      );
  end if;
end $$;

comment on column public.social_recurring_rules.cadence is
  'How occurrences are placed. ''interval'' = the original one-per-N-days planner with hash-placed times inside approved windows. ''daily_times'' = one occurrence per configured time per day, at explicit local wall-clock minutes. Defaults to ''interval'' so existing rules are unchanged.';
comment on column public.social_recurring_rules.daily_times is
  'For cadence=''daily_times'': the posting times as MINUTES FROM LOCAL MIDNIGHT (540 = 9:00 AM, 1140 = 7:00 PM). Wall-clock, not instants — this is what keeps 9:00 AM at 9:00 AM across a DST change. NULL for interval rules.';

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='social_recurring_rules'
--    and column_name in ('cadence','daily_times');
--
-- -- expect EVERY existing rule to be 'interval' with no daily_times (no backfill)
-- select cadence, count(*), count(daily_times) as with_times
--   from public.social_recurring_rules group by cadence;
--
-- -- expect both constraints present
-- select conname from pg_constraint
--  where conrelid='public.social_recurring_rules'::regclass and conname like '%cadence%' or conname like '%daily_times%';
