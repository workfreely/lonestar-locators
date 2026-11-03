-- VERIFY 20261110000000_property_screening_requirements. Read-only; run after applying.
-- Every query must return the stated expectation. Nothing here writes.

-- 1) The eleven columns exist, with the intended types, and every one is nullable.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'property_catalog'
   and column_name in ('broken_lease_status','broken_lease_min_age_years',
                       'broken_lease_balance_requirement','broken_lease_max_balance',
                       'eviction_status','eviction_min_age_years','rental_debt_status',
                       'screening_additional_deposit','screening_risk_fee',
                       'screening_guarantor_program','screening_requirements_checked_at')
 order by column_name;
-- EXPECT 11 rows. integer x2, numeric x1, date x1, text x7.
-- EXPECT is_nullable = YES on every row and column_default NULL on every row:
--        a default would encode a guess, and unknown must stay unknown.

-- 2) The six vocabularies exist.
select conname, convalidated
  from pg_constraint
 where conrelid = 'public.property_catalog'::regclass
   and conname in ('property_catalog_broken_lease_status_vocab',
                   'property_catalog_eviction_status_vocab',
                   'property_catalog_rental_debt_status_vocab',
                   'property_catalog_bl_balance_requirement_vocab',
                   'property_catalog_screening_age_sane',
                   'property_catalog_bl_max_balance_sane')
 order by conname;
-- EXPECT 6 rows, convalidated = false on all of them. NOT VALID is intended: the columns ship
-- empty, so there is nothing to scan, and every future write is still constrained.

-- 3) NOTHING WAS BACKFILLED. The migration is additive; every one of these must be 0.
select count(*)                                   as total_rows,
       count(broken_lease_status)                 as with_bl_status,
       count(broken_lease_min_age_years)          as with_bl_age,
       count(broken_lease_balance_requirement)    as with_bl_balance_rule,
       count(broken_lease_max_balance)            as with_bl_max,
       count(eviction_status)                     as with_ev_status,
       count(eviction_min_age_years)              as with_ev_age,
       count(rental_debt_status)                  as with_rd_status,
       count(screening_additional_deposit)        as with_deposit,
       count(screening_risk_fee)                  as with_risk_fee,
       count(screening_guarantor_program)         as with_guarantor,
       count(screening_requirements_checked_at)   as with_checked_at
  from public.property_catalog;
-- EXPECT total_rows unchanged (4207 at the time of writing) and EVERY other count = 0.

-- 4) NOTHING ELSE MOVED. The screening notes, the credit answer and the commissions are the
--    reason this migration is additive rather than a rewrite.
select count(*) filter (where credit_screening_notes is not null)      as rows_with_notes,
       count(*) filter (where credit_minimum_score is not null)        as rows_with_credit_minimum,
       count(*) filter (where credit_screening_checked_at is not null) as rows_claiming_a_screening_date,
       count(*) filter (where send_commission is not null)             as rows_with_send_commission,
       count(*) filter (where quick_match_collection is not null)      as quick_match_members
  from public.property_catalog;
-- EXPECT the same numbers as before the migration. At the time of writing:
--        57 with notes, 8 with a credit minimum, 0 claiming a screening date,
--        and the Quick Match collection still 68.

-- 5) The vocabularies actually bite. Run ONE of these in a transaction you ROLL BACK.
--    begin;
--      update public.property_catalog set broken_lease_status = 'conditional'
--       where place_id = (select place_id from public.property_catalog limit 1);
--      -- EXPECT: ERROR, violates property_catalog_broken_lease_status_vocab
--    rollback;
