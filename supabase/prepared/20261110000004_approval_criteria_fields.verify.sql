-- VERIFY 20261110000004_approval_criteria_fields. Read-only; run after applying.
-- Run AFTER 20261110000000 and its verify. Every query must return the stated expectation.

-- 1) The five columns exist, with the intended types, all nullable, none defaulted.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'property_catalog'
   and column_name in ('broken_lease_positive_history_required',
                       'eviction_balance_requirement',
                       'eviction_positive_history_required',
                       'rental_debt_balance_requirement',
                       'rental_debt_max_balance')
 order by column_name;
-- EXPECT 5 rows: boolean x2, text x2, numeric x1.
-- EXPECT is_nullable = YES and column_default NULL on every row. The booleans are NULLABLE on
--        purpose: NULL unknown, true required, false "they said it is not required" — three
--        states, because an office that said it does not matter is a finding too.

-- 2) The three constraints exist.
select conname, convalidated
  from pg_constraint
 where conrelid = 'public.property_catalog'::regclass
   and conname in ('property_catalog_ev_balance_requirement_vocab',
                   'property_catalog_rd_balance_requirement_vocab',
                   'property_catalog_rd_max_balance_sane')
 order by conname;
-- EXPECT 3 rows, convalidated = false on all three.

-- 3) ALL SIXTEEN EDITOR COLUMNS ARE NOW PRESENT. This is the one the application depends on:
--    the route probes all sixteen in a single select, and a single missing column is reported to
--    the agent as "not available on this database yet".
select count(*) as approval_columns_present
  from information_schema.columns
 where table_schema = 'public' and table_name = 'property_catalog'
   and column_name in ('broken_lease_status','broken_lease_min_age_years',
                       'broken_lease_balance_requirement','broken_lease_max_balance',
                       'broken_lease_positive_history_required','eviction_status',
                       'eviction_min_age_years','eviction_balance_requirement',
                       'eviction_positive_history_required','rental_debt_status',
                       'rental_debt_balance_requirement','rental_debt_max_balance',
                       'screening_additional_deposit','screening_risk_fee',
                       'screening_guarantor_program','screening_requirements_checked_at');
-- EXPECT exactly 16.

-- 4) NOTHING WAS BACKFILLED.
select count(broken_lease_positive_history_required) as a,
       count(eviction_balance_requirement)           as b,
       count(eviction_positive_history_required)     as c,
       count(rental_debt_balance_requirement)        as d,
       count(rental_debt_max_balance)                as e
  from public.property_catalog;
-- EXPECT every count = 0.
