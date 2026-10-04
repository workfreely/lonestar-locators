-- ─────────────────────────────────────────────────────────────────────────────
-- OUT OF OFFICE — the manual release stamp
--
-- Set ONLY when the locator clicks Start Follow-Up on an OOO-held lead and the
-- new_lead run is created. NULL means "still waiting for me to pick this up".
--
-- SEPARATE FROM ooo_held_at ON PURPOSE. ooo_held_at records that the lead ARRIVED
-- while the locator was away and is never cleared — it is history. This records
-- that the locator has SINCE acted. Two distinct facts, so a released lead still
-- explains why it never got the normal opening texts.
--
-- It is written AFTER the run insert, never before: if the stamp failed while the
-- run existed the button would simply still show, and the active-run unique index
-- blocks a second run. The reverse order could leave a lead that looks released
-- with no run and no visible action — permanently stuck.
--
-- Also drives the Text 1 copy: a lead released days later must not be told "I got
-- your form!", so resolveStepBody renders the OOO restart wording for new_lead/t1
-- when this is set. The normal template is untouched for every other lead.
--
-- No backfill, no default, no trigger, no index, no RLS change. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.leads
  add column if not exists ooo_released_at timestamptz;

comment on column public.leads.ooo_released_at is
  'Set when the locator manually clicks Start Follow-Up on an OOO-held lead and the new_lead run is created. NULL = still pending pickup. Written AFTER the run insert. Also selects the OOO restart wording for new_lead/t1. Distinct from ooo_held_at, which is permanent arrival history.';

commit;
