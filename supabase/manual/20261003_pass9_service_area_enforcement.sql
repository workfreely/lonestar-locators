-- ════════════════════════════════════════════════════════════════════════════
-- PASS 9 (SQL) — server-side enforcement of the Texas launch markets
--
-- PREPARED FOR MANUAL APPLICATION. The migration ledger is out of sync, so
-- `supabase db push` would re-run 51 already-applied migrations against live
-- Property Intelligence data. Apply by hand in the Supabase SQL Editor for
-- project onwrrajmklxtnabekzcy, as one transaction, then run the verification
-- queries at the bottom. Rollback is at the very end.
--
-- WHAT THIS CLOSES. Pass 2 filtered the market pickers to Texas in the UI and
-- explicitly accepted, for the time being, that "a malicious direct RPC call may
-- still submit a non-launch slug". It can: set_workspace_service_areas validates
-- the COUNT (1..5) and the primary market, and nothing else. Any string at all
-- can be written into workspaces.service_areas today — 'chicago', or 'mars'.
--
-- WHY THE RPC IS THE RIGHT SEAM. workspaces has RLS enabled with SELECT policies
-- only ("members read their workspace"); its foundation migration states that all
-- writes go through service-role / SECURITY DEFINER flows. So these two overloads
-- are the ONLY user-reachable write path for service_areas, and hardening them
-- hardens the surface. A CHECK constraint on the column was considered and NOT
-- added: it would have to be NOT VALID to spare the one legacy row, and it would
-- then also block legitimate service-role corrections of that same legacy data.
--
-- LEGACY DATA IS PRESERVED. This migration rewrites NO rows. One workspace
-- currently stores ['chicago'] (owner's licence state is IL). It keeps it. The
-- rule is write-time only: that row changes solely if its owner saves new markets
-- themselves, which is their own explicit action — the same principle Pass 2 set.
--
-- It deliberately does NOT: touch the 5-market cap, the primary-market rule, the
-- licence gate, billing, trials, or any market DISPLAY logic.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. The launch allow-list, as one SQL-side definition ────────────────────
-- The market catalog lives in TypeScript (lib/markets/catalog.ts). SQL cannot
-- import it, so this is a mirror — and a mirror can drift. It is therefore kept
-- to ONE function that a regression test parses and compares against
-- LAUNCH_MARKETS, exactly as Pass 7 does for the licence rule. Adding a launch
-- market means changing the catalog AND this list; the test fails until both agree.
create or replace function public.lb_launch_market_slugs()
returns text[]
language sql
immutable
as $$
  select array[
    'austin',
    'dallas',
    'fort-worth',
    'houston',
    'new-braunfels',
    'san-antonio',
    'san-marcos'
  ]::text[];
$$;

comment on function public.lb_launch_market_slugs() is
  'The Texas launch markets, mirroring LAUNCH_MARKETS in lib/markets/catalog.ts. '
  'Changing one without the other is caught by scripts/markets/serviceAreaEnforcement.test.ts.';

-- ── 2. The validator ────────────────────────────────────────────────────────
-- Rejects the whole write if ANY element is unusable, and names every offending
-- slug rather than only the first — a caller fixing three bad values should not
-- have to submit three times to discover them.
--
-- Null and blank entries are rejected too. They are not merely "not launched":
-- an empty market is meaningless, and letting one through would store a slug that
-- no display path can resolve.
create or replace function public.lb_validate_service_areas(p_areas text[])
returns void
language plpgsql
immutable
as $$
declare
  v_launch text[] := public.lb_launch_market_slugs();
  v_bad    text[];
begin
  select coalesce(array_agg(a), '{}')
    into v_bad
    from unnest(coalesce(p_areas, '{}'::text[])) as a
   where a is null
      or btrim(a) = ''
      or not (a = any(v_launch));

  if array_length(v_bad, 1) is not null then
    -- 22023 = invalid_parameter_value, the code the sibling validators already use.
    raise exception 'service_area_not_launched: %', array_to_string(v_bad, ', ')
      using errcode = '22023';
  end if;
end;
$$;

-- ── 3. Both overloads call it ───────────────────────────────────────────────
-- There are TWO set_workspace_service_areas functions — (text[], text) and
-- (text[]). Hardening one would leave the other wide open, and the single-argument
-- form is still reachable by a direct RPC call even though the app no longer uses
-- it. Both bodies are otherwise byte-for-byte unchanged.
--
-- The validation runs AFTER the count checks and BEFORE the primary-market
-- validation and the UPDATE, so a rejected write leaves the row completely
-- untouched — markets and primary continue to move together or not at all.
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

  -- PASS 9: every market must be a Texas launch market.
  perform public.lb_validate_service_areas(p_areas);

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

  -- PASS 9: every market must be a Texas launch market.
  perform public.lb_validate_service_areas(p_areas);

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

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying.
-- ════════════════════════════════════════════════════════════════════════════
-- a) the allow-list is exactly the seven Texas launch markets
--    select public.lb_launch_market_slugs();
--
-- b) the validator accepts a launch set and rejects everything else.
--    The first returns void (success); each of the others must RAISE.
--    select public.lb_validate_service_areas(array['austin','houston']);
--    select public.lb_validate_service_areas(array['chicago']);          -- legacy, valid slug
--    select public.lb_validate_service_areas(array['mars']);             -- nonsense
--    select public.lb_validate_service_areas(array['austin','chicago']); -- mixed
--    select public.lb_validate_service_areas(array['']);                 -- blank
--
-- c) BOTH overloads now validate (expect 2 rows, both true)
--    select p.oid::regprocedure as signature,
--           prosrc ilike '%lb_validate_service_areas%' as validates
--      from pg_proc p
--     where proname = 'set_workspace_service_areas';
--
-- d) NOTHING was rewritten — the legacy Chicago workspace is intact
--    (expect service_areas = {chicago}, primary_market = chicago)
--    select id, service_areas, primary_market from public.workspaces
--     where 'chicago' = any(service_areas);
--
-- e) the stored data is otherwise unchanged (expect 5 workspaces with areas,
--    and the same six distinct slugs as before)
--    select count(*) filter (where service_areas is not null
--                              and array_length(service_areas,1) > 0) as with_areas,
--           count(*) as total
--      from public.workspaces;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the exact pre-Pass-9 behaviour.
-- The two overloads go back to their 20260828000000 bodies; the two new helper
-- functions are dropped LAST, once nothing calls them.
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--
-- create or replace function public.set_workspace_service_areas(
--   p_areas text[], p_primary text
-- ) returns void language plpgsql security definer set search_path = public as $$
-- declare v_ws uuid; v_count int; v_primary text;
-- begin
--   v_ws := public.current_workspace_id();
--   if v_ws is null then raise exception 'no active workspace for current user'; end if;
--   v_count := coalesce(array_length(p_areas, 1), 0);
--   if v_count < 1 then raise exception 'no_service_areas'; end if;
--   if v_count > 5 then raise exception 'too_many_service_areas'; end if;
--   v_primary := public.lb_validate_primary_market(p_areas, p_primary);
--   update public.workspaces
--      set service_areas = p_areas, primary_market = v_primary, updated_at = now()
--    where id = v_ws;
-- end; $$;
--
-- create or replace function public.set_workspace_service_areas(p_areas text[])
-- returns void language plpgsql security definer set search_path = public as $$
-- declare v_ws uuid; v_count int; v_current text; v_primary text;
-- begin
--   v_ws := public.current_workspace_id();
--   if v_ws is null then raise exception 'no active workspace for current user'; end if;
--   v_count := coalesce(array_length(p_areas, 1), 0);
--   if v_count < 1 then raise exception 'no_service_areas'; end if;
--   if v_count > 5 then raise exception 'too_many_service_areas'; end if;
--   select primary_market into v_current from public.workspaces where id = v_ws;
--   if v_count = 1 then
--     v_primary := p_areas[1];
--   elsif nullif(trim(coalesce(v_current, '')), '') is not null
--         and v_current = any(p_areas) then
--     v_primary := v_current;
--   else
--     v_primary := null;
--   end if;
--   update public.workspaces
--      set service_areas = p_areas, primary_market = v_primary, updated_at = now()
--    where id = v_ws;
-- end; $$;
--
-- drop function if exists public.lb_validate_service_areas(text[]);
-- drop function if exists public.lb_launch_market_slugs();
--
-- commit;
