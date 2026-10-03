-- ─────────────────────────────────────────────────────────────────────────────
-- OUT OF OFFICE — the per-lead historical stamp
--
-- Set at CREATION when the owning workspace was Out of Office at that moment.
-- NULL means the lead arrived normally, which is every lead that exists today.
--
-- WHY A STAMP AND NOT A LIVE LOOKUP. Asking "is the workspace OOO right now?" at
-- tick time would silently change how EVERY lead is treated the moment the toggle
-- flips, including leads created long before. The stamp makes the distinction a
-- permanent fact about the lead, auditable later, and makes "leads that arrived
-- while I was away" a trivial query for the future Needs Contact queue.
--
-- PERMANENT, NOT A LATCH. This records history and is never cleared. When manual
-- resume is built it will use a SEPARATE state (ooo_released_at /
-- ooo_followup_started_at or equivalent) so "arrived during OOO" and "I have
-- since picked this up" stay two distinct facts.
--
-- WHAT READS IT (V1): exactly one place — the new_lead branch of lifecycleSeed in
-- lib/followup/engine.ts, which returns null so the two-text opening pair is
-- never enrolled. No other sequence family consults it. Leads with NULL behave
-- exactly as before, which is the whole point.
--
-- No backfill, no default, no trigger, no index, no RLS change.
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.leads
  add column if not exists ooo_held_at timestamptz;

comment on column public.leads.ooo_held_at is
  'Set at creation when the owning workspace was Out of Office at that moment; NULL for every normally-created lead. Suppresses ONLY the new_lead two-text opening pair (lifecycleSeed returns null). Never cleared — it is history. Manual resume will use a separate state, not this column.';

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='leads' and column_name='ooo_held_at';
--
-- select count(*) as leads, count(ooo_held_at) as held   -- expect held = 0
--   from public.leads;
