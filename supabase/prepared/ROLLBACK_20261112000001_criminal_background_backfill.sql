-- ROLLBACK 20261112000001_criminal_background_backfill.
--
-- Returns to NULL exactly what the backfill copied, and NOTHING an agent has typed since.
--
-- The guard is the join: a row is only cleared where property_approval_policy still holds the
-- same value, so a column an agent has corrected (and which therefore no longer matches the
-- import) is left alone. An agent's own edit also has a provenance row behind it, which this
-- does not touch — property_enrichment_events is append-only and keeps the record either way.
--
-- If the import source itself has since changed, this cannot tell what was copied; in that case
-- restore from the CSV named in ROLLBACK_20261112000000 instead of running this.

update public.property_catalog c
   set felony_policy = case when c.felony_policy = case lower(btrim(p.felony_policy))
                                 when 'case-by-case'   then 'case_by_case'
                                 when 'case by case'   then 'case_by_case'
                                 when 'considered'     then 'considered'
                                 when 'not considered' then 'not_considered'
                                 else null end
                            then null else c.felony_policy end,
       misdemeanor_policy = case when c.misdemeanor_policy = case lower(btrim(p.misdemeanor_policy))
                                      when 'case-by-case'   then 'case_by_case'
                                      when 'case by case'   then 'case_by_case'
                                      when 'considered'     then 'considered'
                                      when 'not considered' then 'not_considered'
                                      else null end
                                 then null else c.misdemeanor_policy end,
       felony_restrictions = case when c.felony_restrictions = nullif(btrim(p.felony_restrictions), '')
                                  then null else c.felony_restrictions end,
       misdemeanor_restrictions = case when c.misdemeanor_restrictions = nullif(btrim(p.misdemeanor_restrictions), '')
                                       then null else c.misdemeanor_restrictions end,
       background_screening_notes = case when c.background_screening_notes = nullif(btrim(p.background_screening_notes), '')
                                         then null else c.background_screening_notes end,
       felony_min_age_years = case when c.felony_min_age_years = p.felony_min_age_years
                                   then null else c.felony_min_age_years end,
       misdemeanor_min_age_years = case when c.misdemeanor_min_age_years = p.misdemeanor_min_age_years
                                        then null else c.misdemeanor_min_age_years end
  from public.property_approval_policy p
 where p.place_id = c.place_id;
