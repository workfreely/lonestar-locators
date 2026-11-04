-- PROPOSED — NOT APPLIED TO PRODUCTION. SEPARATELY APPROVABLE.
--
-- Carry the criminal-background answer that already exists in public.property_approval_policy
-- across to the columns the Approval Criteria editor reads. Apply AFTER 20261112000000.
--
-- DELIBERATELY A SEPARATE FILE. 20261112000000 adds empty columns and changes no data; this one
-- changes data. Approving the schema does not approve the copy, and the editor works either way:
-- without this file the eight properties keep their policy in property_approval_policy, where it
-- is today, and the editor simply shows Unknown until somebody enters it.
--
-- ── WHAT MOVES, EXACTLY ─────────────────────────────────────────────────────────────────────
--   (EIGHT distinct properties are touched. The per-column counts below do not add up to eight
--   because the answers are ragged: two properties carry only a misdemeanor sentence, two carry
--   a felony policy and no misdemeanor answer at all, and one carries both policies with no
--   felony sentence. Every column is copied independently, so a ragged row stays ragged.)
--   felony_policy              6 rows, all the single value 'Case-by-Case' → 'case_by_case'
--   misdemeanor_policy         6 rows, all 'Case-by-Case'                  → 'case_by_case'
--   felony_restrictions        5 rows of prose                            → verbatim
--   misdemeanor_restrictions   6 rows of prose                            → verbatim
--   felony_min_age_years       0 rows (the column is empty)                → no-op, copied anyway
--   misdemeanor_min_age_years  0 rows                                      → no-op, copied anyway
--   background_screening_notes 0 rows                                      → no-op, copied anyway
--
-- ── WHAT DOES NOT MOVE, AND WHY ─────────────────────────────────────────────────────────────
-- THE AGES INSIDE THE PROSE. "Heron at Hausman - 10 years old - nothing assault related" states a
-- ten-year lookback in a sentence, and nothing here parses it out. Three reasons, any one
-- sufficient: the sentence does not say whether ten years is counted from the offense or the
-- conviction (criminal_lookback_basis would have to be guessed); "5-7 years old" is a range, not
-- a number; and a lookback invented by a regular expression is a screening policy no leasing
-- office ever stated. The prose is preserved verbatim in felony_restrictions /
-- misdemeanor_restrictions, where an agent can read it and enter the structured value — which is
-- the only way it becomes one.
--
-- THE CATEGORY SET. "Nothing assault related" plainly means assault is restricted, and this file
-- still does not write criminal_restricted_offense_types. The prose is the office's wording about
-- felonies specifically, three of the five felony sentences name no category at all, and a set
-- derived by keyword would be a filter Quick Match could later act on — built from a guess. The
-- agent sets the chips; the sentence stays beside them.
--
-- NOTHING IS MARKED VERIFIED. This writes the columns directly and records no provenance event,
-- so the editor shows these values with no "Updated" line and no verified tick: imported data,
-- honestly labelled as not confirmed by this office. An owner editing the field afterwards goes
-- through the normal writer and gets the normal audit trail.
--
-- ── IT CANNOT OVERWRITE ANYBODY ─────────────────────────────────────────────────────────────
-- Every assignment is coalesce(existing, imported): a column an agent has already filled keeps
-- its value, and re-running this file is a no-op. The source table is only read.

update public.property_catalog c
   set felony_policy = coalesce(c.felony_policy, case lower(btrim(p.felony_policy))
         when 'case-by-case'   then 'case_by_case'
         when 'case by case'   then 'case_by_case'
         when 'considered'     then 'considered'
         when 'not considered' then 'not_considered'
         -- ANYTHING ELSE STAYS NULL. An unrecognised word is not mapped to the nearest token;
         -- verify step 2 lists every value this skipped so it can be entered by hand.
         else null end),
       misdemeanor_policy = coalesce(c.misdemeanor_policy, case lower(btrim(p.misdemeanor_policy))
         when 'case-by-case'   then 'case_by_case'
         when 'case by case'   then 'case_by_case'
         when 'considered'     then 'considered'
         when 'not considered' then 'not_considered'
         else null end),
       -- Prose, verbatim. btrim only; no sentence is rewritten, shortened or re-punctuated.
       felony_restrictions        = coalesce(c.felony_restrictions,        nullif(btrim(p.felony_restrictions), '')),
       misdemeanor_restrictions   = coalesce(c.misdemeanor_restrictions,   nullif(btrim(p.misdemeanor_restrictions), '')),
       background_screening_notes = coalesce(c.background_screening_notes, nullif(btrim(p.background_screening_notes), '')),
       -- Empty today in every row. Copied so that if the policy table is ever filled in before
       -- this runs, the value travels — it is the same quantity in the same unit, and the CHECK
       -- from 20261112000000 rejects anything outside 0–20 rather than storing it.
       felony_min_age_years       = coalesce(c.felony_min_age_years,       p.felony_min_age_years),
       misdemeanor_min_age_years  = coalesce(c.misdemeanor_min_age_years,  p.misdemeanor_min_age_years)
  from public.property_approval_policy p
 where p.place_id = c.place_id
   -- Only the rows that actually carry something, so this touches 8 rows and not 4,207.
   and (p.felony_policy is not null or p.misdemeanor_policy is not null
        or p.felony_restrictions is not null or p.misdemeanor_restrictions is not null
        or p.background_screening_notes is not null
        or p.felony_min_age_years is not null or p.misdemeanor_min_age_years is not null)
   -- AND THE EDITOR HAS NEVER TOUCHED THIS PROPERTY'S CRIMINAL FIELDS.
   --
   -- coalesce() above protects a value an agent has TYPED. It cannot protect a deliberate CLEAR
   -- back to Unknown, because a cleared column and a column nobody ever touched are both NULL —
   -- so if this file ran days after the editor went live, it could refill a field somebody had
   -- just emptied on purpose. The audit trail knows the difference: a clear writes a row to
   -- property_enrichment_events and an untouched field has none. Skipping any property with
   -- history makes the ORDER of this file and the deployment stop mattering.
   --
   -- As of the check run against production on 2026-11-04 this excludes NOTHING: there are 0
   -- events for any of these field names, because the columns do not exist yet.
   and not exists (
         select 1 from public.property_enrichment_events e
          where e.place_id = c.place_id
            and e.field_name in ('felony_policy','misdemeanor_policy','felony_restrictions',
                                 'misdemeanor_restrictions','background_screening_notes',
                                 'felony_min_age_years','misdemeanor_min_age_years'));
