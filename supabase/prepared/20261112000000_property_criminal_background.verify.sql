-- VERIFY 20261112000000_property_criminal_background. Read-only; run after applying.
-- Every query states its expectation. Run AFTER 20261110000000 / 20261110000004 and their verifies.

-- 1) The nine columns exist, with the intended types, all nullable, none defaulted.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'property_catalog'
   and column_name in ('felony_policy','felony_min_age_years','felony_restrictions',
                       'misdemeanor_policy','misdemeanor_min_age_years','misdemeanor_restrictions',
                       'criminal_restricted_offense_types','criminal_lookback_basis',
                       'background_screening_notes')
 order by column_name;
-- EXPECT 9 rows: text x5, integer x2, ARRAY x1 (criminal_restricted_offense_types), text x1.
-- EXPECT is_nullable = YES and column_default NULL on EVERY row. NULL is the vocabulary's own
--        word for "nobody has asked", and a default would encode a guess for 4,207 properties.

-- 2) The five constraints exist and are NOT VALID (nothing was scanned; everything future is
--    constrained).
select conname, convalidated
  from pg_constraint
 where conrelid = 'public.property_catalog'::regclass
   and conname in ('property_catalog_felony_policy_vocab',
                   'property_catalog_misdemeanor_policy_vocab',
                   'property_catalog_criminal_lookback_basis_vocab',
                   'property_catalog_criminal_age_sane',
                   'property_catalog_criminal_offense_types_vocab')
 order by conname;
-- EXPECT 5 rows, convalidated = false on all five.

-- 3) NOTHING WAS WRITTEN. The migration is additive only; every one of the nine columns is empty
--    across the whole catalog. If any of these is non-zero, something other than this migration
--    wrote data and that must be explained before the editor is trusted.
select count(*)                                      as rows_total,
       count(felony_policy)                           as felony_policy,
       count(felony_min_age_years)                    as felony_age,
       count(felony_restrictions)                     as felony_restrictions,
       count(misdemeanor_policy)                      as misdemeanor_policy,
       count(misdemeanor_min_age_years)               as misdemeanor_age,
       count(misdemeanor_restrictions)                as misdemeanor_restrictions,
       count(criminal_restricted_offense_types)       as offense_types,
       count(criminal_lookback_basis)                 as lookback_basis,
       count(background_screening_notes)              as notes
  from public.property_catalog;
-- EXPECT rows_total = the catalog count (4,207 at the time of writing) and EVERY other column 0.

-- 4) THE SOURCE TABLE IS UNTOUCHED. property_approval_policy keeps every criminal value it had;
--    this migration does not read it, write it, or drop anything from it.
select count(*)                            as policy_rows,
       count(felony_policy)                as felony_policy,
       count(misdemeanor_policy)           as misdemeanor_policy,
       count(felony_restrictions)          as felony_restrictions,
       count(misdemeanor_restrictions)     as misdemeanor_restrictions,
       count(background_screening_notes)   as notes
  from public.property_approval_policy;
-- EXPECT policy_rows = 75, felony_policy = 6, misdemeanor_policy = 6, felony_restrictions = 5,
--        misdemeanor_restrictions = 6, notes = 0 — exactly the values recorded in the migration's
--        own header. A DIFFERENT number means something else changed that table and the backfill
--        in 20261112000001 should be re-read before it is approved.

-- 5) The vocabularies actually bite. Each of these must FAIL; run them one at a time, in a
--    transaction you roll back, against a scratch row.
--
--   begin;
--     insert into public.property_catalog (place_id, felony_policy) values ('verify_cb_1','Case-by-Case');
--     -- EXPECT ERROR: property_catalog_felony_policy_vocab. The DISPLAY form is not a token;
--     -- 'case_by_case' is. This is what the backfill maps, and what the editor sends.
--   rollback;
--
--   begin;
--     insert into public.property_catalog (place_id, criminal_restricted_offense_types)
--       values ('verify_cb_2', array[]::text[]);
--     -- EXPECT ERROR: property_catalog_criminal_offense_types_vocab. An empty set is unstorable
--     -- on purpose — "unknown" is NULL, and only NULL.
--   rollback;
--
--   begin;
--     insert into public.property_catalog (place_id, criminal_restricted_offense_types)
--       values ('verify_cb_3', array['arson']::text[]);
--     -- EXPECT ERROR: a category outside the six the application offers.
--   rollback;
--
--   begin;
--     insert into public.property_catalog (place_id, felony_min_age_years) values ('verify_cb_4', 300);
--     -- EXPECT ERROR: property_catalog_criminal_age_sane. Years, not decades.
--   rollback;
--
--   begin;
--     insert into public.property_catalog (place_id, criminal_lookback_basis) values ('verify_cb_5','unknown');
--     -- EXPECT ERROR. "Unknown" is NULL, never a token — otherwise two values would mean the
--     -- same thing and only one of them would be queryable.
--   rollback;

-- 6) The editor's own probe. The route selects all nine in one statement and reports their
--    absence as "not available on this database yet"; after this migration it must succeed.
select felony_policy, felony_min_age_years, felony_restrictions,
       misdemeanor_policy, misdemeanor_min_age_years, misdemeanor_restrictions,
       criminal_restricted_offense_types, criminal_lookback_basis, background_screening_notes
  from public.property_catalog
 limit 1;
-- EXPECT one row of nine NULLs (or no rows on an empty table). No error is the assertion.
