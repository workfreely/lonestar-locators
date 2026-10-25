-- ============================================================================
-- AGENT TOP PICK — post-migration verification
-- ============================================================================
-- Run in the Supabase SQL Editor AFTER 20261108000000_agent_top_pick.sql.
--
-- PART 2 IS WRAPPED IN A TRANSACTION THAT ROLLS BACK. It writes, proves the
-- trigger's four behaviours against a real lead, and then undoes every one of
-- them — so the database is byte-identical afterwards. Nothing in this file
-- leaves a change behind.
--
-- Why it exists: PostgREST cannot read pg_catalog, so the app side can confirm
-- the COLUMN and the RPC but not the index, the function, or the trigger. This
-- is the same arrangement scripts/sql/checkFunctionDrift.ts already uses.

-- ── PART 1 · the objects exist (read-only) ──────────────────────────────────

select 'column' as object,
       column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'leads'
   and column_name = 'agent_top_pick_recommendation_id';
-- EXPECT: 1 row · bigint · YES

select 'index' as object, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and indexname = 'leads_agent_top_pick_recommendation_id_idx';
-- EXPECT: 1 row

select 'fk' as object,
       conname,
       confdeltype as on_delete   -- 'n' = SET NULL
  from pg_constraint
 where conrelid = 'public.leads'::regclass
   and contype = 'f'
   and conkey = array[(select attnum from pg_attribute
                        where attrelid = 'public.leads'::regclass
                          and attname = 'agent_top_pick_recommendation_id')];
-- EXPECT: 1 row with on_delete = 'n'

select 'function' as object, proname, prosecdef as security_definer, provolatile
  from pg_proc
 where proname in ('lb_agent_top_pick_index', 'lb_assert_agent_top_pick_belongs_to_lead')
 order by proname;
-- EXPECT: 2 rows. lb_agent_top_pick_index → security_definer = true, provolatile = 's'

select 'trigger' as object, tgname, tgtype,
       pg_get_triggerdef(oid) as definition
  from pg_trigger
 where tgrelid = 'public.leads'::regclass
   and not tgisinternal
   and tgname = 'leads_agent_top_pick_belongs_to_lead';
-- EXPECT: 1 row whose definition contains
--         "BEFORE INSERT OR UPDATE OF agent_top_pick_recommendation_id"
--         ← the "OF <column>" is what keeps it off every other lead write

select 'grants' as object, grantee, privilege_type
  from information_schema.role_routine_grants
 where routine_schema = 'public'
   and routine_name = 'lb_agent_top_pick_index'
 order by grantee;
-- EXPECT: anon and authenticated with EXECUTE; PUBLIC absent


-- ── PART 2 · the trigger behaves (writes, then ROLLS BACK) ──────────────────
-- Change :test_lead / :own_rec / :foreign_rec if these ids no longer apply.
--   lead 27 "Derek Stoneoak" is seeded test data and owns recommendations 10, 12, 14
--   recommendation 83 belongs to lead 84, so it is the foreign one

begin;

\set test_lead 27
\set own_rec 12
\set other_own_rec 10
\set foreign_rec 83

-- 2a · a FOREIGN recommendation must be refused
do $$
declare ok boolean := false;
begin
  begin
    update public.leads set agent_top_pick_recommendation_id = 83 where id = 27;
  exception when check_violation then
    ok := true;
    raise notice '2a PASS — foreign recommendation refused: %', sqlerrm;
  end;
  if not ok then
    raise exception '2a FAIL — a recommendation belonging to another lead was ACCEPTED';
  end if;
end $$;

-- 2b · its OWN recommendation is accepted
update public.leads set agent_top_pick_recommendation_id = 12 where id = 27;
select '2b accept' as step, agent_top_pick_recommendation_id from public.leads where id = 27;
-- EXPECT: 12

-- 2c · switching replaces, in ONE write, with nothing left behind
update public.leads set agent_top_pick_recommendation_id = 10 where id = 27;
select '2c switch' as step, agent_top_pick_recommendation_id from public.leads where id = 27;
-- EXPECT: 10
select '2c only one' as step, count(*) as leads_pointing_at_12
  from public.leads where agent_top_pick_recommendation_id = 12;
-- EXPECT: 0

-- 2d · clearing is always allowed
update public.leads set agent_top_pick_recommendation_id = null where id = 27;
select '2d clear' as step, agent_top_pick_recommendation_id from public.leads where id = 27;
-- EXPECT: null

-- 2e · ON DELETE SET NULL clears it without the trigger objecting
update public.leads set agent_top_pick_recommendation_id = 14 where id = 27;
delete from public.lead_recommendations where id = 14;
select '2e on-delete' as step, agent_top_pick_recommendation_id from public.leads where id = 27;
-- EXPECT: null   (the delete is undone by the rollback below)

-- 2f · an unrelated lead write does not fire the trigger at all
update public.leads set agent_top_pick_recommendation_id = 12 where id = 27;
update public.leads set first_name = first_name where id = 27;
select '2f untouched' as step, agent_top_pick_recommendation_id from public.leads where id = 27;
-- EXPECT: 12 — still there, and no exception was raised

rollback;
-- ↑ EVERY write above is undone. Confirm with Part 1 again, or:
--   select count(*) from public.leads where agent_top_pick_recommendation_id is not null;  → 0
--   select count(*) from public.lead_recommendations;                                      → 8
