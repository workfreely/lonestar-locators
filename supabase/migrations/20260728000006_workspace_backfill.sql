-- ============================================================================
-- Phase 0 — Workspace Foundation (3/5): auto-provision a Solo workspace
-- ============================================================================
-- (Filename kept for ordering; REPURPOSED after the dedicated-project strategy:
--  Locator Beast runs on its own CLEAN Supabase project and does NOT import Lone
--  Star production data. Nothing to backfill — every NEW account is provisioned
--  a Solo workspace + membership at signup, identically for the first customer
--  and every future one, with zero application code changes.)
--
-- Provisioning flow (all inside the profile-insert transaction, so it is atomic):
--   new auth user → handle_new_user inserts profiles → THIS trigger →
--   workspace created → membership created → role assigned → onboarding begins.
--
-- Safety properties:
--   • Transactional  — runs in the same tx as the profile insert; a failure
--                      rolls the whole thing back (no workspace-without-profile).
--   • Idempotent     — ensure_solo_workspace() no-ops if an active membership
--                      already exists (so retries / re-runs never duplicate).
--   • Retry-safe     — membership insert uses ON CONFLICT DO NOTHING.
--   • Self-healing   — reconcile_missing_workspaces() repairs any profile that
--                      ends up without a workspace (transient failure, or a
--                      profile created before this trigger existed).

-- One shared, idempotent unit of work — used by both the trigger and the repair.
create or replace function public.ensure_solo_workspace(p_user uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
  p    public.profiles;
begin
  select m.workspace_id into v_ws
  from public.workspace_members m
  where m.user_id = p_user and m.status = 'active'
  limit 1;
  if v_ws is not null then
    return v_ws;                     -- already provisioned → no-op
  end if;

  select * into p from public.profiles where id = p_user;
  if not found then
    return null;
  end if;

  insert into public.workspaces (
    name, type, max_agent_seats, created_by, plan,
    stripe_customer_id, stripe_subscription_id, subscription_status, trial_started_at, trial_ends_at
  )
  values (
    coalesce(
      nullif(p.brokerage, ''), nullif(p.business_name, ''),
      nullif(trim(coalesce(p.preferred_name, p.first_name, '')), '') || '''s Workspace',
      'My Workspace'
    ),
    'solo', 1, p.id, 'solo',
    p.stripe_customer_id, p.stripe_subscription_id, p.subscription_status, p.trial_started_at, p.trial_ends_at
  )
  returning id into v_ws;

  insert into public.workspace_members (workspace_id, user_id, role, status, has_agent_seat, invited_by)
  values (v_ws, p.id, 'broker', 'active', true, p.id)
  on conflict (workspace_id, user_id) do nothing;

  return v_ws;
end $$;

create or replace function public.provision_solo_workspace()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_solo_workspace(new.id);
  return new;
end $$;

drop trigger if exists trg_provision_solo_workspace on public.profiles;
create trigger trg_provision_solo_workspace
  after insert on public.profiles
  for each row execute function public.provision_solo_workspace();

-- Repair path: provision any profile missing an active membership. Returns the
-- number repaired. Run manually, on a schedule, or defensively from the app at
-- login/onboarding to detect + fix a half-provisioned account.
create or replace function public.reconcile_missing_workspaces()
returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select p.id from public.profiles p
    where not exists (
      select 1 from public.workspace_members m where m.user_id = p.id and m.status = 'active'
    )
  loop
    perform public.ensure_solo_workspace(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Detection query (for monitoring / the report):
--   select count(*) from public.profiles p
--   where not exists (select 1 from public.workspace_members m
--                     where m.user_id = p.id and m.status='active');
-- A non-zero result means half-provisioned accounts exist → run
--   select public.reconcile_missing_workspaces();
