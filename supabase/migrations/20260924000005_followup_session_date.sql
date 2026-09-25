-- Follow-Up Agent — per-DAY event sessions (Post Tour groups by tour date).
--
-- A lead can have several tour DAYS, each an independent Post Tour session. We tag
-- such runs with the client-local tour date (session_date) + that day's tour count
-- (session_tour_count, for singular/plural copy), and relax the one-active-run
-- invariant so lifecycle sequences stay one-active while event sessions may
-- coexist — but at most ONE active run per (lead, sequence_key, session_date).

alter table public.lead_followup_runs
  add column if not exists session_date       date,
  add column if not exists session_tour_count integer;

comment on column public.lead_followup_runs.session_date is
  'Client-local calendar date this event run belongs to (Post Tour tour-day). NULL for lifecycle sequences (new_lead/list_sent/…).';
comment on column public.lead_followup_runs.session_tour_count is
  'Confirmed tours on session_date (drives Post Tour singular vs plural copy). NULL when not applicable.';

-- Replace the single one-active-run index with two partial indexes:
drop index if exists public.lead_followup_runs_one_active;

-- Lifecycle sequences (session_date IS NULL): still at most ONE active run/lead.
create unique index if not exists lead_followup_runs_one_active_lifecycle
  on public.lead_followup_runs (lead_id)
  where status in ('waiting', 'due') and session_date is null;

-- Event sessions (session_date set): one active run per (lead, sequence_key, date),
-- so distinct tour days each get their own independent Post Tour run.
create unique index if not exists lead_followup_runs_one_active_session
  on public.lead_followup_runs (lead_id, sequence_key, session_date)
  where status in ('waiting', 'due') and session_date is not null;
