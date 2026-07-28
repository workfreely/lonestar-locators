-- ============================================================================
-- Phase 0 — Workspace Foundation (4/5): keep new rows owned
-- ============================================================================
-- After backfill, every NEW CRM row must also get workspace_id + owner_user_id,
-- otherwise enforcement (5/5) would hide it. A BEFORE INSERT trigger populates
-- them so NO application/query code has to change (the CRM keeps inserting
-- exactly as it does today).
--
-- Resolution order for workspace_id:
--   1. explicit value on the row — the INTENDED path for SaaS: a per-agent
--      Smart Form (locatorbeast.com/{agent}) knows whose lead it is and should
--      pass owner_user_id/workspace_id on insert. Wiring that into
--      /api/leads/submit + the edge functions is a Phase 1 task.
--   2. the inserting user's active membership (browser/authenticated inserts).
--   3. bootstrap fallback: the sole workspace — but ONLY while exactly one
--      workspace exists. This lets the FIRST customer's public-form/service-role
--      inserts (no auth context) land correctly before path (1) is wired. The
--      `= 1` guard auto-disables it the moment a second customer signs up, so it
--      can never mis-assign a lead across tenants. Until path (1) ships, do not
--      onboard a second real customer whose public form creates leads.

create or replace function public.set_workspace_ownership()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_ws    uuid;
begin
  v_owner := coalesce(new.owner_user_id, auth.uid());
  if v_owner is not null then
    new.owner_user_id := v_owner;
  end if;

  if new.workspace_id is null then
    if v_owner is not null then
      select m.workspace_id into v_ws
      from public.workspace_members m
      where m.user_id = v_owner and m.status = 'active'
      order by m.joined_at asc
      limit 1;
    end if;

    if v_ws is null and (select count(*) from public.workspaces) = 1 then
      select id into v_ws from public.workspaces limit 1;
    end if;

    new.workspace_id := v_ws; -- may remain null once multi-tenant; enforcement handles that
  end if;

  return new;
end $$;

-- beast_milestones owns via its existing user_id column, so it only needs the
-- workspace resolved (no owner_user_id column).
create or replace function public.set_workspace_only()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ws uuid;
begin
  if new.workspace_id is null then
    select m.workspace_id into v_ws
    from public.workspace_members m
    where m.user_id = coalesce(new.user_id, auth.uid()) and m.status = 'active'
    order by m.joined_at asc limit 1;
    if v_ws is null and (select count(*) from public.workspaces) = 1 then
      select id into v_ws from public.workspaces limit 1;
    end if;
    new.workspace_id := v_ws;
  end if;
  return new;
end $$;

drop trigger if exists trg_ownership on public.leads;
create trigger trg_ownership before insert on public.leads
  for each row execute function public.set_workspace_ownership();

drop trigger if exists trg_ownership on public.lead_next_actions;
create trigger trg_ownership before insert on public.lead_next_actions
  for each row execute function public.set_workspace_ownership();

drop trigger if exists trg_ownership on public.lead_favorites;
create trigger trg_ownership before insert on public.lead_favorites
  for each row execute function public.set_workspace_ownership();

drop trigger if exists trg_ownership on public.lead_timeline;
create trigger trg_ownership before insert on public.lead_timeline
  for each row execute function public.set_workspace_ownership();

drop trigger if exists trg_ownership on public.lead_properties;
create trigger trg_ownership before insert on public.lead_properties
  for each row execute function public.set_workspace_ownership();

drop trigger if exists trg_ownership on public.ai_client_briefs;
create trigger trg_ownership before insert on public.ai_client_briefs
  for each row execute function public.set_workspace_ownership();

drop trigger if exists trg_ownership on public.beast_milestones;
create trigger trg_ownership before insert on public.beast_milestones
  for each row execute function public.set_workspace_only();
