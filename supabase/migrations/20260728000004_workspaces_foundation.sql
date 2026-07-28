-- ============================================================================
-- Phase 0 — Workspace Foundation (1/5): core tables
-- ============================================================================
-- Introduces the multi-tenant Workspace model WITHOUT changing any existing
-- behavior. These tables are brand new — nothing in the app reads them yet — so
-- their RLS can't break the current experience. Ownership columns, backfill,
-- triggers, and CRM RLS enforcement live in the following migrations.
--
-- Model: every account belongs to exactly one workspace. A solo agent gets a
-- 1-seat 'solo' workspace; a brokerage (later) gets a 'brokerage' workspace with
-- a broker, up to 2 managers, and N agent seats. Roles/invitations are DATA ONLY
-- here — no UI, no workflows, no permissions screens (built in later phases).

-- ── workspaces ──────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text unique,                 -- future: locatorbeast.com/{slug} + /{slug}/join
  type                   text not null default 'solo' check (type in ('solo','brokerage')),
  -- brand / contact (used by brokerage surfaces later; harmless for solo)
  logo_url               text,
  phone                  text,
  email                  text,
  website                text,
  license_number         text,
  primary_market         text,
  -- seat capacity is CONFIG, never hard-coded to a plan name (solo = 1)
  max_agent_seats        int  not null default 1,
  status                 text not null default 'active' check (status in ('active','suspended','cancelled')),
  -- billing ownership lives on the workspace (mirrors profiles for now; see backfill)
  plan                   text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,
  trial_started_at       timestamptz,
  trial_ends_at          timestamptz,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── workspace_members ───────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           text not null default 'agent'  check (role   in ('broker','manager','agent')),
  status         text not null default 'active' check (status in ('active','inactive','invited','removed')),
  -- a broker who also actively locates keeps a personal agent CRM in the SAME
  -- workspace (no duplicate account) — this flag drives the future role switcher.
  has_agent_seat boolean not null default true,
  invited_by     uuid references auth.users(id) on delete set null,
  joined_at      timestamptz not null default now(),
  removed_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx      on public.workspace_members(user_id);
create index if not exists workspace_members_workspace_idx on public.workspace_members(workspace_id);

-- ── workspace_invitations (architecture only — no UI, no send logic yet) ──────
create table if not exists public.workspace_invitations (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  email                 text not null,
  phone                 text,
  legal_first_name      text,
  legal_last_name       text,
  preferred_first_name  text,
  preferred_last_name   text,
  license_number        text,
  intended_role         text not null default 'agent' check (intended_role in ('broker','manager','agent')),
  token_hash            text not null,                 -- store only a hash of the single-use token
  status                text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  invited_by            uuid references auth.users(id) on delete set null,
  expires_at            timestamptz not null,
  accepted_at           timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists workspace_invitations_workspace_idx on public.workspace_invitations(workspace_id);
create index if not exists workspace_invitations_email_idx     on public.workspace_invitations(lower(email));

-- ── membership helper (SECURITY DEFINER so RLS on CRM tables can call it
--     without recursing into workspace_members' own RLS) ────────────────────
create or replace function public.is_active_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- ── RLS on the new tables (safe: no existing app code reads them) ────────────
alter table public.workspaces           enable row level security;
alter table public.workspace_members    enable row level security;
alter table public.workspace_invitations enable row level security;

-- Members may read their own workspace + co-members. All writes go through the
-- service role / SECURITY DEFINER flows for now (broker/manager management UI
-- and invitation acceptance arrive in later phases).
create policy "members read their workspace"
  on public.workspaces for select
  using (public.is_active_workspace_member(id));

create policy "members read co-members"
  on public.workspace_members for select
  using (public.is_active_workspace_member(workspace_id));

-- workspace_invitations: no authenticated policy yet (token_hash is sensitive);
-- readable/writable only via service role until the invitation phase adds
-- broker/manager-scoped policies. RLS is enabled so it is closed by default.
