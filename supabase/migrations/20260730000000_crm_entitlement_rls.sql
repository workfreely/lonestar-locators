-- ============================================================================
-- Billing pre-launch (1/2): CRM data-layer entitlement enforcement
-- ============================================================================
-- Adds a SUBSCRIPTION/TRIAL entitlement gate on top of the existing workspace
-- membership RLS for CRM data. A workspace's CRM rows are readable/writable via
-- an authenticated session ONLY when the workspace OWNER has active billing
-- access (active subscription OR a live trial). Tenant/ownership isolation
-- (is_active_workspace_member) is PRESERVED — this ANDs an extra condition, it
-- does not replace ownership.
--
-- What is deliberately NOT affected:
--   • Service-role paths (public lead form /api/leads/submit, workflow engine,
--     crons, edge functions) BYPASS RLS, so a lapsed agent's public form keeps
--     capturing leads — access to VIEW them is what's gated, never capture.
--   • Grandfathered users have profiles.subscription_status='active' → allowed.
--   • profiles / auth / onboarding / billing pages are untouched.
--   • smart_forms (public form config the marketing/lead page reads) is NOT in
--     the gated set, so public form rendering + submission are unaffected.
--
-- DEPLOYMENT ORDER: apply this migration to the Locator Beast Supabase project
-- (supabase db push) BEFORE deploying the app code that calls
-- lb_workspace_has_access() via RPC. It is additive/safe — it only TIGHTENS
-- access for non-entitled owners; every active/trialing/grandfathered owner
-- keeps full access.

-- Single source of truth for CRM entitlement — mirrors the app's getAccessState
-- (active OR live trial). SECURITY DEFINER so RLS policies (and an authenticated
-- RPC from the API guard) can call it without recursing into profiles' own RLS.
-- Entitlement is based on the WORKSPACE OWNER's profile (created_by), so the
-- whole workspace follows the owner's billing state (correct for brokerage too).
create or replace function public.lb_workspace_has_access(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.profiles p on p.id = w.created_by
    where w.id = ws
      and (
        p.subscription_status = 'active'
        or (
          p.subscription_status = 'trialing'
          and p.trial_ends_at is not null
          and p.trial_ends_at > now()
        )
      )
  );
$$;

grant execute on function public.lb_workspace_has_access(uuid) to authenticated;

-- Re-create the workspace CRM policies to require BOTH active membership AND
-- owner entitlement. Mirrors 20260728000008 (same table set + policy naming),
-- but skips any table that doesn't exist so the migration is resilient.
do $$
declare
  t text;
  p record;
  tables text[] := array[
    'leads','lead_next_actions','lead_favorites','lead_timeline',
    'lead_properties','ai_client_briefs'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format($f$
      create policy "workspace members access %1$s"
        on public.%1$I for all
        using (
          public.is_active_workspace_member(workspace_id)
          and public.lb_workspace_has_access(workspace_id)
        )
        with check (
          public.is_active_workspace_member(workspace_id)
          and public.lb_workspace_has_access(workspace_id)
        )
    $f$, t);
  end loop;
end $$;
