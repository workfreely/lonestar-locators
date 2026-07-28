-- ============================================================================
-- Phase 0 — Workspace Foundation (2/5): CRM ownership columns
-- ============================================================================
-- Adds workspace_id + owner_user_id to every per-agent CRM table. Purely
-- ADDITIVE and NULLABLE here — no data is moved and no RLS changes, so the app
-- keeps working exactly as before. The backfill (3/5) populates them; triggers
-- (4/5) keep new rows populated; enforcement (5/5) turns on isolation.
--
-- Ownership decision per table (see the audit doc): every CRM record belongs to
-- BOTH a workspace (tenant boundary) and an owner_user (the agent). workspace_id
-- is denormalized onto each row so aggregate/isolation RLS is a single indexed
-- comparison and never has to join back through leads.

-- leads: the shared pool today → gains an owner + tenant.
alter table public.leads
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

-- lead_next_actions (tasks / follow-ups / workflow actions)
alter table public.lead_next_actions
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

-- lead_favorites (saved properties)
alter table public.lead_favorites
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

-- lead_timeline (append-only activity history)
alter table public.lead_timeline
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

-- lead_properties (LeadInsights favorite toggles)
alter table public.lead_properties
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

-- ai_client_briefs (AI summaries/insights)
alter table public.ai_client_briefs
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

-- beast_milestones already has user_id (the owner) — it only needs a tenant.
alter table public.beast_milestones
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Indexes for tenant-scoped reads/aggregates.
create index if not exists leads_workspace_idx             on public.leads(workspace_id);
create index if not exists leads_owner_idx                 on public.leads(owner_user_id);
create index if not exists lead_next_actions_workspace_idx on public.lead_next_actions(workspace_id);
create index if not exists lead_favorites_workspace_idx    on public.lead_favorites(workspace_id);
create index if not exists lead_timeline_workspace_idx     on public.lead_timeline(workspace_id);
create index if not exists lead_properties_workspace_idx   on public.lead_properties(workspace_id);
create index if not exists ai_client_briefs_workspace_idx  on public.ai_client_briefs(workspace_id);
create index if not exists beast_milestones_workspace_idx  on public.beast_milestones(workspace_id);
