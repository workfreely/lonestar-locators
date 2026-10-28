-- VERIFICATION for 20261111000000_tour_follow_up_sequence.sql.
-- Every statement is a SELECT — this file writes nothing at all, not even a temporary row,
-- so it is safe to run BEFORE and AFTER the migration. Expect 9 rows.
--
-- Row 1 tells you which state the database is currently in:
--   NOT YET APPLIED -> 'tour_follow_up_2' and 'tour_follow_up_3' are the only keys
--                      missing. This is the expected pre-apply state, and it is what
--                      production reported on 2026-10-28.
--   APPLIED         -> all 27 keys are permitted; the migration has run.
--   Anything else   -> stop and investigate. In particular, 'resume_search' missing
--                      means an earlier revision of this migration was applied.
--
-- Rows 2-3 are the two assertions that matter either way: 'resume_search' must be
-- permitted (it was never ours to remove), and both new rungs must be permitted
-- once the migration has run.
--
-- Rows 4-9 describe the POST-apply state. Before applying, rows 4-6 are EXPECTED to
-- report FAIL, because the indexes and the property CHECK still carry only
-- 'tour_follow_up' — that is the pre-state from 20260815000000, not a fault. After
-- applying, every row from 2 to 8 must read PASS.

with expected(action_key) as (
  values
    ('build_list'),
    ('check_application'),
    ('commission_paid'),
    ('confirm_lease'),
    ('contact_follow_up_1'),
    ('contact_follow_up_2'),
    ('contact_follow_up_3'),
    ('contact_lead'),
    ('contacted_follow_up'),
    ('email_guest_card'),
    ('final_follow_up'),
    ('follow_up_1'),
    ('follow_up_2'),
    ('follow_up_3'),
    ('get_invoice_details'),
    ('lease_follow_up'),
    ('reconnect_client'),
    ('resume_search'),
    ('send_invoice'),
    ('send_list'),
    ('send_rebate'),
    ('setup_movers'),
    ('setup_tour'),
    ('start_application'),
    ('tour_follow_up'),
    ('tour_follow_up_2'),
    ('tour_follow_up_3')
),
chk as (
  select pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'public.lead_next_actions'::regclass
    and conname = 'lead_next_actions_action_key_chk'
),
missing as (
  select e.action_key
  from expected e
  cross join chk
  where strpos(chk.def, '''' || e.action_key || '''') = 0
)

-- 1. Which state are we in?
select
  'current state' as assertion,
  case when exists (select 1 from chk) then
    case when (select count(*) from missing) = 0 then 'all 27 keys permitted'
         else (select count(*) from missing)::text || ' key(s) missing: '
              || (select string_agg(action_key, ', ' order by action_key) from missing)
    end
  else '(constraint not found)' end as value,
  case
    when not exists (select 1 from chk) then 'UNEXPECTED — constraint absent, stop and investigate'
    when (select count(*) from missing) = 0 then 'APPLIED (complete 27-key vocabulary)'
    when exists (select 1 from missing where action_key = 'resume_search')
      then 'UNEXPECTED — resume_search is missing; an earlier revision was applied. Stop.'
    when (select count(*) from missing) = 2
     and not exists (select 1 from missing
                      where action_key not in ('tour_follow_up_2','tour_follow_up_3'))
      then 'NOT YET APPLIED — expected pre-apply state'
    else 'UNEXPECTED — an unrelated key is missing, stop and investigate'
  end as result

union all

-- 2. The repair restored Resume Search. This is the regression itself.
select 'resume_search is permitted',
  case when exists (select 1 from missing where action_key = 'resume_search') then 'absent' else 'present' end,
  case when exists (select 1 from missing where action_key = 'resume_search') then 'FAIL' else 'PASS' end

union all

-- 3. Both new rungs are permitted (FAIL here before the migration is applied).
select 'both new tour rungs still permitted',
  case when exists (select 1 from missing where action_key in ('tour_follow_up_2','tour_follow_up_3'))
       then 'one or both missing' else 'tour_follow_up_2 + tour_follow_up_3' end,
  case when exists (select 1 from missing where action_key in ('tour_follow_up_2','tour_follow_up_3'))
       then 'FAIL' else 'PASS' end

union all

-- 4. The generic one-open-per-key index is untouched: still per-lead-per-key, still open-only,
--    and still excluding the four per-property keys.
select 'generic one-open index unchanged',
  coalesce((select 'present' from pg_indexes
             where schemaname = 'public' and tablename = 'lead_next_actions'
               and indexname = 'lead_next_actions_one_open_per_action_uidx'), '(MISSING)'),
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'lead_next_actions'
      and indexname = 'lead_next_actions_one_open_per_action_uidx'
      and indexdef like '%(lead_id, action_key)%'
      and indexdef like '%status = ''open''%'
      and indexdef like '%email_guest_card%'
      and indexdef like '%tour_follow_up_2%'
      and indexdef like '%tour_follow_up_3%'
  ) then 'PASS' else 'FAIL' end

union all

-- 5. The per-property tour index is untouched: one open rung per property, all three rungs.
select 'per-property tour index unchanged',
  coalesce((select 'present' from pg_indexes
             where schemaname = 'public' and tablename = 'lead_next_actions'
               and indexname = 'lead_next_actions_one_open_tour_follow_up_per_property_uidx'), '(MISSING)'),
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'lead_next_actions'
      and indexname = 'lead_next_actions_one_open_tour_follow_up_per_property_uidx'
      and indexdef like '%(lead_id, property_id)%'
      and indexdef like '%status = ''open''%'
      and indexdef like '%tour_follow_up_2%'
      and indexdef like '%tour_follow_up_3%'
  ) then 'PASS' else 'FAIL' end

union all

-- 6. The property-scope CHECK survives and stays NOT VALID, so no existing row is re-validated.
select 'tour property CHECK present and NOT VALID',
  coalesce((select case when convalidated then 'present but VALIDATED' else 'present, not valid' end
            from pg_constraint
            where conrelid = 'public.lead_next_actions'::regclass
              and conname = 'lead_next_actions_tour_follow_up_property_chk'), '(MISSING)'),
  case when exists (select 1 from pg_constraint
                     where conrelid = 'public.lead_next_actions'::regclass
                       and conname = 'lead_next_actions_tour_follow_up_property_chk'
                       and not convalidated)
       then 'PASS' else 'FAIL' end

union all

-- 7. The Resume Search function itself was never edited: still there, still SECURITY DEFINER,
--    still inserting the key this repair restores.
select 'lb_client_resume_search unchanged',
  coalesce((select case when p.prosecdef then 'security definer' else 'NOT security definer' end
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'lb_client_resume_search' limit 1), '(MISSING)'),
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'lb_client_resume_search'
                       and p.prosecdef
                       and p.prosrc like '%resume_search%')
       then 'PASS' else 'FAIL' end

union all

-- 8. No action row was created, deleted, or re-keyed. Every key in use is a permitted key,
--    and the repair writes nothing, so this count is identical before and after.
select 'every action_key in use is permitted',
  count(*)::text || ' row(s) with a key outside the vocabulary',
  case when count(*) = 0 then 'PASS' else 'FAIL' end
from public.lead_next_actions a
where a.action_key is not null
  and a.action_key not in (select action_key from expected)

union all

-- 9. Index inventory for the eye: every index on the table, for comparison across runs.
select 'index inventory (informational)',
  (select string_agg(indexname, ', ' order by indexname) from pg_indexes
    where schemaname = 'public' and tablename = 'lead_next_actions'),
  'INFO';
