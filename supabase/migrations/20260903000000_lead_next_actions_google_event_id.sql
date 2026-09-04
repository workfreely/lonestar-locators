-- ── Follow-Up Calendar sync: persist the Google Calendar event id ────────────
--
-- B3 Phase 1 (Locator Beast): when a canonical follow-up action is scheduled,
-- the corresponding event is created in the OWNING agent's own Google Calendar,
-- and its Google event id is stored here so a later reschedule updates that same
-- event (instead of creating a duplicate) and so we never double-create on
-- advance.
--
-- Nullable + additive: existing rows and every non-follow-up action simply leave
-- it null. No backfill. Nothing reads it except the follow-up calendar sync.

alter table public.lead_next_actions
  add column if not exists google_event_id text;

comment on column public.lead_next_actions.google_event_id is
  'Google Calendar event id for this follow-up action (per-agent primary calendar). Null when no event exists yet or the action is not calendar-synced.';
