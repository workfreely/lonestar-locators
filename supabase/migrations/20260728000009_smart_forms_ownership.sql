-- ============================================================================
-- Phase 0 — Workspace Foundation (6/6): Smart Form ownership + secure resolution
-- ============================================================================
-- ARCHITECTURE ONLY — no Smart Form UI, layout, field, styling, or behavior
-- change (the editor still has no publish flow yet). This adds the OWNERSHIP
-- backbone the multi-tenant design needs:
--
--   Workspace → Agent (owner) → Smart Form (slug)
--
-- so a public submission can be attributed to the correct tenant WITHOUT ever
-- trusting a client-supplied workspace_id / owner_user_id. Each published form
-- has a stable slug that resolves SERVER-SIDE to its workspace + owner.

create table if not exists public.smart_forms (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id)        on delete cascade,
  slug          text not null unique,                 -- future: locatorbeast.com/{slug}
  status        text not null default 'draft' check (status in ('draft','live','disabled')),
  config        jsonb not null default '{}'::jsonb,   -- the existing SLF config shape, when publishing lands
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists smart_forms_workspace_idx on public.smart_forms(workspace_id);
create index if not exists smart_forms_owner_idx     on public.smart_forms(owner_user_id);

-- Lead provenance: which published form produced this lead (nullable — admin /
-- direct / imported leads have none). Also the natural place the submit route
-- records the resolved form.
alter table public.leads
  add column if not exists source_smart_form_id uuid references public.smart_forms(id) on delete set null;

alter table public.smart_forms enable row level security;

-- Workspace members manage their own forms.
create policy "workspace members manage smart_forms"
  on public.smart_forms for all
  using (public.is_active_workspace_member(workspace_id))
  with check (public.is_active_workspace_member(workspace_id));

-- Anonymous visitors may READ only LIVE forms (to render the public page). This
-- exposes slug/status/config only — never leads or workspace internals.
create policy "public reads live smart_forms"
  on public.smart_forms for select
  to anon
  using (status = 'live');

-- Server-side resolver the public /api/leads/submit route must call: slug -> the
-- owning workspace + agent, for a LIVE form only. The route inserts the lead
-- with THESE values (never client-supplied ones), so a submission can never be
-- routed to the wrong customer or create an unowned lead.
create or replace function public.resolve_smart_form(p_slug text)
returns table (smart_form_id uuid, out_workspace_id uuid, out_owner_user_id uuid)
language sql stable security definer set search_path = public as $$
  select id, workspace_id, owner_user_id
  from public.smart_forms
  where slug = p_slug and status = 'live'
  limit 1;
$$;

-- NOTE (Phase 1 code change, not in this architecture-only phase): update
-- /api/leads/submit to (1) read the form slug from the request, (2) call
-- resolve_smart_form(slug) server-side, (3) insert the lead with the resolved
-- workspace_id + owner_user_id + source_smart_form_id, and (4) reject the
-- submission if the slug does not resolve to a live form. The client is NEVER
-- allowed to pass a trusted workspace_id/owner_user_id. Until that ships, the
-- single-workspace bootstrap fallback in 20260728000007 covers customer #1 only.
