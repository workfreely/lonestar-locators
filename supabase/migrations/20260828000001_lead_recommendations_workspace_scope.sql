-- ============================================================================
-- lead_recommendations joins the workspace foundation
-- ============================================================================
-- lead_recommendations was created on 20260821, a month AFTER the Phase 0
-- workspace foundation (20260728000005 columns / 000007 triggers / 000008 RLS),
-- and was never added to any of those three lists. It is the only CRM child
-- table still carrying the permissive baseline policy:
--
--   for all using (auth.role() = 'authenticated')
--
-- which lets ANY authenticated Locator Beast user read and write EVERY
-- workspace's recommendations. This migration enrolls the table into the
-- existing pattern rather than inventing a new one — same columns, same
-- set_workspace_ownership() trigger, same is_active_workspace_member() policy
-- every sibling (leads, lead_next_actions, lead_favorites, lead_timeline,
-- lead_properties, ai_client_briefs) already uses.
--
-- lead_favorites is ALREADY correct (hardened by 20260728000008) and is
-- deliberately untouched here.
--
-- Ordering note: the backfill below derives workspace ownership from the parent
-- lead, so it is only sound once every lead is owned. Two unowned scratch leads
-- (ids 9, 10 - no owner_user_id, so unresolvable) were removed before this ran;
-- the assertion in step 3 fails the migration if any unowned row reappears.

-- 1. Ownership columns (mirrors 20260728000005)
alter table public.lead_recommendations
  add column if not exists workspace_id  uuid references public.workspaces(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id)        on delete set null;

create index if not exists lead_recommendations_workspace_idx
  on public.lead_recommendations(workspace_id);

-- 2. Stamp ownership on insert (mirrors 20260728000007).
-- The service-role paths (workflow engine, update-stage route, Companion verb
-- handler) bypass RLS and do not set these columns themselves; the trigger is
-- what keeps them populated, exactly as it does for lead_favorites.
drop trigger if exists trg_ownership on public.lead_recommendations;
create trigger trg_ownership before insert on public.lead_recommendations
  for each row execute function public.set_workspace_ownership();

-- 3. Backfill existing rows from their parent lead.
update public.lead_recommendations r
   set workspace_id  = l.workspace_id,
       owner_user_id = coalesce(r.owner_user_id, l.owner_user_id)
  from public.leads l
 where l.id = r.lead_id
   and r.workspace_id is null;

-- Refuse to install a scoped policy while any row would become invisible under
-- it. A recommendation with no workspace_id could never be read back by its own
-- locator, which is worse than the permissive policy this replaces.
do $$
declare n int;
begin
  select count(*) into n from public.lead_recommendations where workspace_id is null;
  if n > 0 then
    raise exception 'lead_recommendations: % row(s) still have a null workspace_id - aborting before RLS swap', n;
  end if;
end $$;

-- 4. Replace the permissive policy (mirrors 20260728000008)
alter table public.lead_recommendations enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'lead_recommendations' loop
    execute format('drop policy %I on public.lead_recommendations', p.policyname);
  end loop;
end $$;

create policy "workspace members access lead_recommendations"
  on public.lead_recommendations for all
  using (public.is_active_workspace_member(workspace_id))
  with check (public.is_active_workspace_member(workspace_id));
