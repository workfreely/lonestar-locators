-- Milestone A — Companion / Workflow Stabilization: stable action identity +
-- server-authoritative timezone resolution, for a RELIABLE READ MODEL.
--
-- ADDITIVE and MUTATION-FREE. This adds columns, constraints, indexes, timezone
-- columns, and ONE read-only timezone resolver. It does NOT add or enable any
-- workflow-mutation primitive — the atomic completion RPC is deliberately
-- deferred to the later mutation milestone ("do not enable live workflow
-- mutations yet") — and it does not touch the frozen extension shell.
--
-- Applied against a CONFIRMED-EMPTY LB production workflow table set
-- (lead_next_actions = 0 rows at apply time; re-verified immediately before
-- push), so every new NOT NULL column is safe with a default and NO backfill is
-- required. Existing CRM inserts (lead_id, title, due_at, priority, notes) keep
-- working: the new columns take manual/open defaults that satisfy every check.
--
-- Titles remain PRESENTATION labels only. action_key is the stable identity;
-- lower(title) is never used for identity, dedup, or constraints.

-- ── 1) Stable action identity on lead_next_actions ──────────────────────────
alter table public.lead_next_actions
  add column if not exists action_key       text,
  add column if not exists action_type      text    not null default 'manual',
  add column if not exists origin           text    not null default 'user',
  add column if not exists sequence         integer,
  add column if not exists workflow_version integer not null default 1,
  add column if not exists status           text    not null default 'open';

comment on column public.lead_next_actions.action_key is
  'Stable canonical workflow identity (never derived from the title). NULL for manual tasks.';
comment on column public.lead_next_actions.action_type is
  '''workflow'' = engine-emitted canonical action; ''manual'' = user-created task (free-text title, no identity).';
comment on column public.lead_next_actions.origin is
  'Who created the row: ''engine'' (workflow), ''user'' (manual add), ''system''.';
comment on column public.lead_next_actions.sequence is
  'Ordering hint within a lead''s workflow (e.g. follow_up_1 < follow_up_2). NULL when N/A.';
comment on column public.lead_next_actions.workflow_version is
  'Workflow-engine version that emitted this row, so historical rows stay interpretable.';
comment on column public.lead_next_actions.status is
  'Lifecycle: open | completed | skipped | canceled. Kept in sync with the completed boolean.';

-- action_type domain.
alter table public.lead_next_actions
  add constraint lead_next_actions_action_type_chk
  check (action_type in ('workflow', 'manual'));

-- origin domain.
alter table public.lead_next_actions
  add constraint lead_next_actions_origin_chk
  check (origin in ('engine', 'user', 'system'));

-- status domain. skipped/canceled are non-completing terminal states.
alter table public.lead_next_actions
  add constraint lead_next_actions_status_chk
  check (status in ('open', 'completed', 'skipped', 'canceled'));

-- Canonical action_key set (Decision 2). NULL for manual tasks; a workflow row
-- MUST carry one of these. get_invoice_details stays SEPARATE from confirm_lease;
-- follow-ups are follow_up_1..3 + final_follow_up; reconnect_client and
-- email_guest_card are preserved. Later-stage actions may exist as canonical
-- RESERVED keys before their transition rules ship.
alter table public.lead_next_actions
  add constraint lead_next_actions_action_key_chk
  check (
    action_key is null or action_key in (
      'contact_lead',
      'build_list',
      'send_list',
      'setup_tour',
      'tour_follow_up',
      'check_application',
      'confirm_lease',
      'get_invoice_details',
      'setup_movers',
      'send_rebate',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'final_follow_up',
      'reconnect_client',
      'email_guest_card'
    )
  );

-- A workflow row must carry a canonical key; a manual row must not.
alter table public.lead_next_actions
  add constraint lead_next_actions_workflow_key_chk
  check (
    (action_type = 'workflow' and action_key is not null) or
    (action_type = 'manual'   and action_key is null)
  );

-- completed boolean and completed_at must agree (the integrity pair the
-- read-only DQ report checks for).
alter table public.lead_next_actions
  add constraint lead_next_actions_completed_at_chk
  check (
    (completed = false and completed_at is null) or
    (completed = true  and completed_at is not null)
  );

-- status and the completed boolean must agree on completion.
alter table public.lead_next_actions
  add constraint lead_next_actions_status_completed_chk
  check ((status = 'completed') = (completed = true));

-- At most ONE open row per canonical workflow action per lead — dedup keyed on
-- action_key (NOT lower(title)). The core stabilization guarantee that keeps the
-- read model's "single open Next Action" unambiguous.
create unique index if not exists lead_next_actions_one_open_per_action_uidx
  on public.lead_next_actions (lead_id, action_key)
  where status = 'open' and action_key is not null;

-- ── 2) Server-authoritative timezone resolution (Decision 3) ────────────────
-- Store IANA identifiers; timestamps stay UTC (timestamptz). Optional
-- profiles.timezone override → workspaces.timezone → 'America/Chicago'.
alter table public.profiles
  add column if not exists timezone text;
alter table public.workspaces
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'Optional IANA tz (e.g. America/Chicago) overriding the workspace default. NULL = inherit workspace.';
comment on column public.workspaces.timezone is
  'Workspace default IANA tz. NULL = fall back to America/Chicago.';

-- THE single server-authoritative resolver. ALL due-date and
-- Today/Tomorrow/Overdue classification must resolve the zone through this, so
-- the client can never disagree with the server. Defensive: an unknown or blank
-- identifier falls back to America/Chicago rather than erroring downstream.
create or replace function public.resolve_timezone(p_profile_id uuid, p_workspace_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_tz text;
begin
  select coalesce(
    (select nullif(btrim(timezone), '') from public.profiles   where id = p_profile_id),
    (select nullif(btrim(timezone), '') from public.workspaces where id = p_workspace_id)
  ) into v_tz;

  if v_tz is null then
    return 'America/Chicago';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    return 'America/Chicago';
  end if;
  return v_tz;
end;
$$;

revoke all on function public.resolve_timezone(uuid, uuid) from public;
grant execute on function public.resolve_timezone(uuid, uuid) to authenticated, service_role;
