-- ─────────────────────────────────────────────────────────────────────────────
-- PASS 2 — AREA SELECTION LIMIT (combined cap across both area columns)
--
-- A client may hold at most 2 areas IN TOTAL across `leads.neighborhoods`
-- (Preferred Neighborhoods) and `leads.submarkets` (Nearby Areas). Not 2 in each:
-- the two columns are two inputs onto ONE allowance, which is how matching reads
-- them (composeDesiredAreas, lib/propertyExplorer/multiArea.ts).
--
-- WHY A TRIGGER AND NOT A CHECK CONSTRAINT.
--   • A CHECK is evaluated against every row, so it would reject ANY update to the
--     9 existing over-cap leads — including an update that REMOVES areas. That
--     directly contradicts the requirement that legacy leads stay editable and can
--     be walked back down. A trigger can compare NEW to OLD and allow reduction.
--   • Edit Client has no server route behind it: components/LeadFormModal.tsx writes
--     to `leads` DIRECTLY from the browser over RLS. The API-route guard in
--     /api/leads/submit therefore cannot see that path, and a browser-side check is
--     the UX, not the rule. This trigger is the only layer no surface can bypass.
--
-- WHAT IT ALLOWS
--   • any write landing at 2 or fewer areas                      → allowed
--   • an over-cap row whose count STRICTLY DECREASES             → allowed (12 → 5)
--   • an over-cap row updated without touching the area columns  → allowed
--   • everything else                                            → rejected
--
-- NOTHING IS REWRITTEN. This adds no UPDATE statement of its own: the 9 existing
-- over-cap leads keep every saved value. Choosing which two of someone's twelve
-- areas to keep would invent a preference they never expressed, so the trigger only
-- ever requires movement DOWNWARD and never performs it.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Count non-empty, comma-separated entries across both columns. IMMUTABLE +
-- STRICT-safe: null is treated as the empty list, matching csvToArr on the app side.
create or replace function public.lb_area_selection_count(
  p_neighborhoods text,
  p_submarkets    text
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    coalesce((
      select count(*)
      from unnest(string_to_array(coalesce(p_neighborhoods, ''), ',')) as t(v)
      where btrim(t.v) <> ''
    ), 0)
    +
    coalesce((
      select count(*)
      from unnest(string_to_array(coalesce(p_submarkets, ''), ',')) as t(v)
      where btrim(t.v) <> ''
    ), 0);
$$;

comment on function public.lb_area_selection_count(text, text) is
  'Combined count of area selections across leads.neighborhoods + leads.submarkets. Mirrors countAreaSelections() in lib/leads/areaLimit.ts.';

create or replace function public.lb_enforce_area_selection_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_limit    constant integer := 2;  -- keep in sync with MAX_LOCATIONS (lib/formOptions.ts)
  v_new_count integer;
  v_old_count integer;
begin
  v_new_count := public.lb_area_selection_count(new.neighborhoods, new.submarkets);

  -- At or under the cap is always fine, and is the only case a fresh INSERT can take.
  if v_new_count <= v_limit then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_count := public.lb_area_selection_count(old.neighborhoods, old.submarkets);

    -- Untouched area columns on a legacy over-cap row: let unrelated edits through,
    -- otherwise a 12-area lead could not have its phone or stage changed.
    if new.neighborhoods is not distinct from old.neighborhoods
       and new.submarkets is not distinct from old.submarkets then
      return new;
    end if;

    -- A legacy lead on its way down.
    if v_new_count < v_old_count then
      return new;
    end if;
  end if;

  raise exception
    'Area selection limit: % areas requested, maximum is % in total across Preferred Neighborhoods and Nearby Areas. Remove areas to continue.',
      v_new_count, v_limit
    using errcode = 'check_violation';
end;
$$;

comment on function public.lb_enforce_area_selection_limit() is
  'Rejects writes that would leave a lead above the combined area limit, while allowing an over-cap legacy lead to be reduced or edited in unrelated columns. Mirrors verdictForWrite() in lib/leads/areaLimit.ts.';

drop trigger if exists lb_area_selection_limit on public.leads;
create trigger lb_area_selection_limit
  before insert or update of neighborhoods, submarkets on public.leads
  for each row
  execute function public.lb_enforce_area_selection_limit();

commit;

-- ─── VERIFICATION (read-only; run after the transaction above) ───────────────
--
-- 1. The trigger exists and fires only for the two area columns:
--
-- select tgname, pg_get_triggerdef(t.oid) as def
--   from pg_trigger t join pg_class c on c.oid = t.tgrelid
--  where c.relname = 'leads' and tgname = 'lb_area_selection_limit';
--
-- 2. Nothing was rewritten — the 9 over-cap leads still hold every value:
--
-- select id, first_name,
--        public.lb_area_selection_count(neighborhoods, submarkets) as areas
--   from public.leads
--  where public.lb_area_selection_count(neighborhoods, submarkets) > 2
--  order by areas desc, id;
--
--    Expected (measured 2026-09-30, before this migration):
--      83 Delilah 12 · 70 Isaiah 12 · 62 Stefan 12 · 82 Alexandria 6 ·
--      63 Keyonta 5 · 11 ZZAUDIT 3 · 57 Jerry 3 · 58 BridgeTest 3 · 59 StageTwo 3
--
-- 3. The cap actually bites (each of these must RAISE, changing nothing):
--
-- begin;
--   update public.leads set neighborhoods = 'Downtown San Antonio, Stone Oak, UTSA'
--    where id = 84;                                   -- 3 on an at-cap lead → rejected
-- rollback;
--
-- begin;
--   update public.leads set submarkets = 'Boerne, Schertz'
--    where id = 58;                                   -- 2 + 2 = 4 → rejected
-- rollback;
--
-- 4. A legacy lead CAN still be reduced, and unrelated edits still work:
--
-- begin;
--   update public.leads set neighborhoods = 'Downtown Houston, Midtown'
--    where id = 83;                                   -- 12 → 2, allowed
--   update public.leads set neighborhoods = 'Downtown Houston, Midtown, Montrose'
--    where id = 70;                                   -- 12 → 3, allowed (still reducing)
--   update public.leads set priority = 'high' where id = 62;  -- areas untouched, allowed
-- rollback;
