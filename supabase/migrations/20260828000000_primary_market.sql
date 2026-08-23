-- ── Primary Market: the agent's default market ──────────────────────────────
--
-- NO NEW COLUMN. `workspaces.primary_market text` has existed since
-- 20260728000004_workspaces_foundation.sql. An audit found it completely unused:
-- nothing in the app reads or writes it and every row is NULL. This migration
-- gives that existing column its meaning and its server-side guard rather than
-- adding a second field for the same idea.
--
-- WHY IT MATTERS: Beast Property Explorer needs a deterministic market to open in
-- when no client is selected. It previously used service_areas[1] — the market
-- the agent happened to tick FIRST, which is not the market they work in most.
-- Primary Market is an explicit choice; selection order is never consulted again.
--
-- The value uses the SAME catalog slug vocabulary as service_areas (lib/markets/
-- catalog.ts). There is no second market dataset.
--
-- COMPATIBILITY: the existing 1-argument set_workspace_service_areas(text[]) is
-- KEPT, unchanged in signature, because the currently DEPLOYED production build
-- calls it. A new 2-argument overload carries the primary. The overloads cannot
-- be ambiguous to PostgREST: p_primary has NO default, so a body of {p_areas}
-- matches only the 1-arg form and {p_areas, p_primary} only the 2-arg form.

-- Shared validation, so the two entry points can never disagree.
create or replace function public.lb_validate_primary_market(
  p_areas   text[],
  p_primary text
)
returns text
language plpgsql immutable as $$
declare
  v_primary text := nullif(trim(coalesce(p_primary, '')), '');
  v_count   int  := coalesce(array_length(p_areas, 1), 0);
begin
  -- Exactly one market: it IS the primary. The agent is never asked to choose
  -- from a list of one, and an explicit value that disagrees is corrected.
  if v_count = 1 then
    return p_areas[1];
  end if;

  if v_primary is null then
    -- Two or more markets and no choice made. Refuse rather than guess: picking
    -- the first or the alphabetically-first is exactly the behaviour this
    -- feature exists to remove.
    raise exception 'primary_market_required';
  end if;

  if not (v_primary = any(p_areas)) then
    raise exception 'primary_market_not_in_service_areas';
  end if;

  return v_primary;
end;
$$;

comment on function public.lb_validate_primary_market(text[], text) is
  'Returns the primary market to store for a service-area selection. Auto-selects '
  'the only market when there is one; raises primary_market_required / '
  'primary_market_not_in_service_areas otherwise. Never guesses.';

-- ── New: set service areas AND the primary together, atomically ─────────────
create or replace function public.set_workspace_service_areas(
  p_areas   text[],
  p_primary text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws      uuid;
  v_count   int;
  v_primary text;
begin
  v_ws := public.current_workspace_id();
  if v_ws is null then
    raise exception 'no active workspace for current user';
  end if;

  v_count := coalesce(array_length(p_areas, 1), 0);
  if v_count < 1 then
    raise exception 'no_service_areas';
  end if;
  if v_count > 5 then
    raise exception 'too_many_service_areas';
  end if;

  -- Validate BEFORE writing, so a rejected primary cannot leave the markets
  -- saved and the primary stale — the two always move together.
  v_primary := public.lb_validate_primary_market(p_areas, p_primary);

  update public.workspaces
  set service_areas  = p_areas,
      primary_market = v_primary,
      updated_at     = now()
  where id = v_ws;
end;
$$;

comment on function public.set_workspace_service_areas(text[], text) is
  'Sets the caller workspace''s markets AND primary market atomically. 1-5 catalog '
  'slugs; the primary must be one of them (auto-selected when only one is given).';

-- ── Legacy 1-arg form: keep the stored primary CONSISTENT ───────────────────
-- The deployed build still calls this. It cannot ask for a primary, so it keeps
-- the existing one when it is still selected, auto-selects when only one market
-- remains, and otherwise clears it — never silently picks a different city.
create or replace function public.set_workspace_service_areas(p_areas text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws      uuid;
  v_count   int;
  v_current text;
  v_primary text;
begin
  v_ws := public.current_workspace_id();
  if v_ws is null then
    raise exception 'no active workspace for current user';
  end if;

  v_count := coalesce(array_length(p_areas, 1), 0);
  if v_count < 1 then
    raise exception 'no_service_areas';
  end if;
  if v_count > 5 then
    raise exception 'too_many_service_areas';
  end if;

  select primary_market into v_current from public.workspaces where id = v_ws;

  if v_count = 1 then
    v_primary := p_areas[1];
  elsif nullif(trim(coalesce(v_current, '')), '') is not null
        and v_current = any(p_areas) then
    v_primary := v_current;          -- still valid, leave it alone
  else
    v_primary := null;               -- incompatible; the UI must ask again
  end if;

  update public.workspaces
  set service_areas  = p_areas,
      primary_market = v_primary,
      updated_at     = now()
  where id = v_ws;
end;
$$;

comment on column public.workspaces.primary_market is
  'Catalog market slug (same vocabulary as service_areas) used as the default '
  'market for Beast Property Explorer when no client is selected. Must be one of '
  'service_areas. Never inferred from selection order.';

-- ── Backfill: only the unambiguous case ─────────────────────────────────────
-- A workspace serving exactly ONE market has exactly one possible primary.
-- Workspaces serving several are deliberately left NULL: the agent chooses on
-- their next Profile save. Until then the map falls back as it does today.
update public.workspaces
   set primary_market = service_areas[1]
 where primary_market is null
   and coalesce(array_length(service_areas, 1), 0) = 1;

-- ── Expose the primary through the existing workspace accessor ──────────────
-- get_current_workspace() is the ONE path the client already uses to read its
-- workspace; primary_market joins slug and service_areas there rather than
-- becoming a second query. The return TYPE changes, so this must drop first —
-- `create or replace` cannot widen a returns-table signature. Adding a column is
-- backward compatible for every existing caller: all of them destructure named
-- fields (`row?.slug`, `row?.service_areas`) and ignore the rest.
drop function if exists public.get_current_workspace();

create or replace function public.get_current_workspace()
returns table (slug text, service_areas text[], primary_market text)
language sql stable security definer set search_path = public as $$
  select w.slug, w.service_areas, w.primary_market
  from public.workspaces w
  where w.id = public.current_workspace_id();
$$;
