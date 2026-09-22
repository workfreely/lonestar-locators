-- Follow-Up Agent — Phase 1 foundation (server-side brain; dry-run capable).
--
-- Two tables + one column. NOTHING here sends a message. The dispatcher/gate/
-- reconciler are deterministic app code (lib/followup/*); this is only the state
-- + audit substrate.
--
-- SEMANTICS (corrected):
--   mode        = GLOBAL automation control for the client: auto|manual|paused|stopped
--   status      = the ONE active sequence run's lifecycle: waiting|due|completed|
--                 canceled|superseded
-- A normal client reply stops/supersedes the ACTIVE RUN (status), never the global
-- mode. Only opt-out / explicit Stop / terminal-closed set mode=stopped.
--
-- WRITE MODEL (like security_events / trusted_devices): service-role writes only
-- (the dispatcher + companion ingest); owner-scoped SELECT for the UI. RLS enabled.

-- Actual application date — the LOCKED Application-Status timing keys off THIS
-- (3 business days after the real application date), never the CRM stage-change
-- time. Nullable; set when a lead genuinely enters Applied.
alter table public.leads add column if not exists applied_at timestamptz;

-- One active automation run per client (the state-machine instance).
create table if not exists public.lead_followup_runs (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             bigint not null references public.leads(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id       uuid references auth.users(id) on delete set null,
  -- GLOBAL automation control (persists across sequences for this client).
  mode                text not null default 'auto',
  -- Which sequence family this run is pursuing (new_lead|list_sent|done_selecting|
  -- tour|post_tour|application_status|future_move). Free text — new families need
  -- no migration.
  sequence_key        text not null,
  -- Current step within the sequence, and this run's lifecycle status.
  step_key            text not null,
  step_index          int not null default 0,
  status              text not null default 'waiting',
  -- When the current step becomes ELIGIBLE to send (not a guaranteed send time —
  -- pacing + the final gate decide the actual instant, or cancel it).
  next_eligible_at    timestamptz,
  -- The conversation watermark: the last inbound timestamp seen when this step was
  -- scheduled. A newer inbound than this is what "conversation overrides automation"
  -- compares against.
  baseline_inbound_at timestamptz,
  sequence_version    int not null default 1,
  stop_reason         text,
  last_evaluated_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- At most ONE active run per lead (waiting|due). Completed/canceled/superseded runs
-- stay as history.
create unique index if not exists lead_followup_runs_one_active
  on public.lead_followup_runs (lead_id)
  where status in ('waiting', 'due');
create index if not exists lead_followup_runs_due_idx
  on public.lead_followup_runs (next_eligible_at)
  where status in ('waiting', 'due');

-- Immutable per-decision audit record AND the Phase-2 gateway work-queue.
create table if not exists public.followup_outbound_intents (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid references public.lead_followup_runs(id) on delete set null,
  lead_id          bigint not null references public.leads(id) on delete cascade,
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id    uuid references auth.users(id) on delete set null,
  sequence_key     text not null,
  step_key         text not null,
  template_key     text,
  rendered_body    text,
  -- What the deterministic gate decided.
  decision         text not null,            -- send|reschedule|cancel|hold
  decision_reason  text,                     -- structured CancelReason / send
  evaluated_state  jsonb not null default '{}'::jsonb, -- snapshot at decision time
  -- Transport lifecycle. Phase 1 uses only 'dry_run'. Phase 2/3:
  -- pending→sent→confirmed (or failed/superseded).
  dispatch_status  text not null default 'dry_run',
  idempotency_key  text unique,              -- prevents any double-send
  gateway_device_id uuid,
  sent_at          timestamptz,
  confirmed_at     timestamptz,
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists followup_intents_run_idx
  on public.followup_outbound_intents (run_id, created_at desc);
create index if not exists followup_intents_pending_idx
  on public.followup_outbound_intents (workspace_id)
  where dispatch_status = 'pending';

alter table public.lead_followup_runs enable row level security;
alter table public.followup_outbound_intents enable row level security;

-- Owner-scoped read for the CRM UI; writes are service-role only (no write policy).
create policy "members read lead_followup_runs"
  on public.lead_followup_runs for select
  using (public.is_active_workspace_member(workspace_id));
create policy "members read followup_outbound_intents"
  on public.followup_outbound_intents for select
  using (public.is_active_workspace_member(workspace_id));
