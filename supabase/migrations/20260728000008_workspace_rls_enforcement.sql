-- ============================================================================
-- Phase 0 — Workspace Foundation (5/5): enforce tenant isolation
-- ============================================================================
-- Part of the NEW Locator Beast project's secure baseline. (The earlier
-- `.sql.HOLD` guard existed only to keep this from ever touching the live Lone
-- Star production DB; on the clean, empty Locator Beast project it is applied
-- with the rest of the foundation — there is no live CRM to regress.)
--
-- Replaces the permissive "any authenticated user" policies inherited from the
-- schema baseline with workspace-scoped ones, so a workspace member can only
-- ever read/write rows in a workspace they actively belong to. Service-role
-- paths (public lead form, edge functions, update-stage route, workflow engine)
-- BYPASS RLS, so inserts keep working; the trigger stamps their workspace_id.
--
-- KNOWN GAP (must close before customer #2): the dashboard/performance reads
-- still use the service-role admin client (getLeads/getFavorites/…), which
-- bypasses these policies. With one customer that returns the correct data, but
-- it is NOT tenant-isolated at the read layer. Converting those reads to the
-- workspace-scoped client — together with wiring explicit owner context into
-- public-form intake — is the first task of Phase 1.

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
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format($f$
      create policy "workspace members access %1$s"
        on public.%1$I for all
        using (public.is_active_workspace_member(workspace_id))
        with check (public.is_active_workspace_member(workspace_id))
    $f$, t);
  end loop;
end $$;

-- beast_milestones stays user-scoped (already isolated by user_id, stricter than
-- workspace) — its policies from 20260728000000 remain valid and untouched.
