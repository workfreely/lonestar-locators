-- VERIFY 20261112000001_criminal_background_backfill. Read-only; run after applying.

-- 1) WHAT LANDED. Six properties, a policy on each, the prose beside it.
select c.place_id, c.property_name,
       c.felony_policy, c.misdemeanor_policy,
       c.felony_min_age_years, c.misdemeanor_min_age_years,
       c.criminal_lookback_basis, c.criminal_restricted_offense_types,
       left(coalesce(c.felony_restrictions, ''), 60)      as felony_prose,
       left(coalesce(c.misdemeanor_restrictions, ''), 60) as misdemeanor_prose
  from public.property_catalog c
 where c.felony_policy is not null or c.misdemeanor_policy is not null
    or c.felony_restrictions is not null or c.misdemeanor_restrictions is not null
 order by c.property_name;
-- EXPECT 6 rows. EXPECT felony_policy / misdemeanor_policy = 'case_by_case' where the source had
--        'Case-by-Case'. EXPECT felony_min_age_years, misdemeanor_min_age_years,
--        criminal_lookback_basis and criminal_restricted_offense_types ALL NULL on every row —
--        the lookback and the categories live inside the prose and were deliberately not parsed.
--        A non-null age here means something inferred a policy nobody stated.

-- 2) WHAT WAS SKIPPED. Any source value the mapping did not recognise, so it can be entered by
--    hand rather than silently lost.
select p.place_id, p.felony_policy, p.misdemeanor_policy
  from public.property_approval_policy p
  join public.property_catalog c on c.place_id = p.place_id
 where (p.felony_policy is not null and c.felony_policy is null)
    or (p.misdemeanor_policy is not null and c.misdemeanor_policy is null)
 order by p.place_id;
-- EXPECT 0 rows against the data recorded in the migration header ('Case-by-Case' only). Any row
--        here is a value the vocabulary does not cover — read it and enter it in the editor.

-- 3) NOTHING WAS OVERWRITTEN, AND THE SOURCE IS INTACT.
select count(*) as policy_rows, count(felony_policy) as felony_policy,
       count(misdemeanor_policy) as misdemeanor_policy,
       count(felony_restrictions) as felony_restrictions,
       count(misdemeanor_restrictions) as misdemeanor_restrictions
  from public.property_approval_policy;
-- EXPECT 75 / 6 / 6 / 5 / 6 — unchanged. This file only reads that table.

-- 4) THE PROSE IS IDENTICAL, not reformatted. Compares the two tables character for character.
select p.place_id,
       (c.felony_restrictions      is not distinct from nullif(btrim(p.felony_restrictions), ''))      as felony_matches,
       (c.misdemeanor_restrictions is not distinct from nullif(btrim(p.misdemeanor_restrictions), '')) as misdemeanor_matches
  from public.property_approval_policy p
  join public.property_catalog c on c.place_id = p.place_id
 where p.felony_restrictions is not null or p.misdemeanor_restrictions is not null
 order by p.place_id;
-- EXPECT felony_matches and misdemeanor_matches true on every row.

-- 5) NO PROVENANCE WAS INVENTED. A backfilled value is imported, not confirmed, and must not
--    carry an owner's verification.
select count(*) as criminal_provenance_rows
  from public.property_field_provenance
 where field_name in ('felony_policy','misdemeanor_policy','felony_restrictions',
                      'misdemeanor_restrictions','felony_min_age_years',
                      'misdemeanor_min_age_years','background_screening_notes');
-- EXPECT 0 before anybody uses the editor. The editor's own saves add rows here afterwards, each
--        recorded verified only when a Source was supplied with it.
