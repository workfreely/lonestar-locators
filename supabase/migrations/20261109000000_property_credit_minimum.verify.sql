-- VERIFY 20261109000000_property_credit_minimum. Read-only; run after applying.
-- Every query must return the stated expectation.

-- 1) The five columns exist with the intended types.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'property_catalog'
   and column_name in ('credit_minimum_status','credit_minimum_score',
                       'credit_observed_approval_score','credit_screening_notes',
                       'credit_screening_checked_at')
 order by column_name;
-- EXPECT 5 rows: integer x2, text x2, date x1, all is_nullable = YES.

-- 2) The three constraints exist.
select conname, convalidated
  from pg_constraint
 where conrelid = 'public.property_catalog'::regclass
   and conname like 'property_catalog_credit%'
 order by conname;
-- EXPECT 3 rows. convalidated = false for the two NOT VALID ones; that is intended.

-- 3) NOTHING WAS BACKFILLED. Every row must still be untouched.
select count(*) as total,
       count(credit_minimum_status)          as with_status,
       count(credit_minimum_score)           as with_score,
       count(credit_observed_approval_score) as with_observed,
       count(credit_screening_notes)         as with_notes,
       count(credit_screening_checked_at)    as with_date
  from public.property_catalog;
-- EXPECT total ~4204 and every other count = 0.

-- 4) The client read path cannot see the new columns.
select count(*) as leaks
  from pg_get_functiondef('public.lb_resolve_client_recommendations(text)'::regprocedure) as d(def)
 where def like '%credit_minimum%' or def like '%credit_screening%' or def like '%credit_observed%';
-- EXPECT leaks = 0. This is the requirement, not a nicety.

-- 5) The agent read path is likewise unchanged by this migration.
select count(*) as present
  from pg_get_functiondef('public.lb_property_catalog_by_ids(text[])'::regprocedure) as d(def)
 where def like '%credit_minimum%';
-- EXPECT present = 0.

-- 6) The constraints actually bite. Each of these must RAISE; run them one at a time.
-- select 1 where false; -- placeholder so this file is runnable as a whole
--   a) a score with no status
-- update public.property_catalog set credit_minimum_score = 600 where place_id = '<any>';          -- EXPECT violation
--   b) a score under 'no_check_reported'
-- update public.property_catalog set credit_minimum_status='no_check_reported', credit_minimum_score=600 where place_id='<any>'; -- EXPECT violation
--   c) an out-of-range score
-- update public.property_catalog set credit_minimum_status='reported_minimum', credit_minimum_score=0 where place_id='<any>';    -- EXPECT violation
--   d) a bad status token
-- update public.property_catalog set credit_minimum_status='unknown' where place_id='<any>';        -- EXPECT violation
