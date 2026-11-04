-- PROPOSED — NOT APPLIED TO PRODUCTION.
--
-- Structured criminal-background screening for the Approval Criteria editor. Additive, nullable,
-- no defaults, no backfill. Apply AFTER 20261110000000 and 20261110000004.
--
-- ── WHAT ALREADY EXISTS, AND WHERE ──────────────────────────────────────────────────────────
-- public.property_approval_policy — the older, import-written policy table — ALREADY carries a
-- criminal answer, and it is the only place in this database that does:
--
--   column                       | rows filled (of 75) | what is in them
--   -----------------------------|---------------------|--------------------------------------
--   felony_policy                | 6                   | 'Case-by-Case', all six
--   misdemeanor_policy           | 6                   | 'Case-by-Case', all six
--   felony_restrictions          | 5                   | prose: "10 years old - nothing assault
--                                |                     | related", with the property's own name
--   misdemeanor_restrictions     | 6                   | prose, same shape
--   felony_min_age_years         | 0                   | EMPTY — the age lives inside the prose
--   misdemeanor_min_age_years    | 0                   | EMPTY — same
--   background_screening_notes   | 0                   | EMPTY
--
-- Those counts are per column; the answers are ragged, so EIGHT distinct properties carry some
-- criminal answer between them, not six. (Checked against production on 2026-11-04.)
--
-- So SEVEN of the nine columns below are that table's own names, deliberately: the same name
-- means the same thing in both tables, one reader understands both, and the proposed backfill
-- (20261112000001, separate and separately approvable) is a column-to-column copy with nothing
-- parsed. The ages are NOT read out of the prose by anything, here or there — an age inferred
-- from a sentence is a policy nobody stated, and the prose is preserved verbatim instead.
--
-- ── WHY ON property_catalog AND NOT ON property_approval_policy ─────────────────────────────
-- Because of where the firewall is. Every value the Approval Criteria editor writes goes through
-- lib/propertyEnrichment/writer.ts against property_catalog, which is what gives these fields,
-- for free and with no second implementation:
--
--   • OWNER_ONLY_FIELDS — no automated enrichment job can reach the column at all;
--   • the append-only audit trail in property_enrichment_events, recording the previous value,
--     the new value, the source and the timestamp of every correction;
--   • the provenance-derived "Updated 3 days ago" and the Source/verified distinction;
--   • the deliberate clear back to NULL (OWNER_CLEARABLE_FIELDS).
--
-- property_approval_policy sits OUTSIDE all of that and is written by imports. Putting the
-- editor's answer there would mean an import could silently overwrite what a leasing office told
-- a human being, and that the Source and verification behaviour the rest of this panel has would
-- not exist for these fields. Broken lease and eviction faced exactly this choice in
-- 20261110000000 — property_approval_policy already had broken_lease_policy and eviction_policy —
-- and were answered the same way, so this follows the shipped pattern rather than inventing one.
--
-- ── THE TWO GENUINELY NEW FIELDS ────────────────────────────────────────────────────────────
-- criminal_restricted_offense_types — the policy table has no structured category set at all.
-- "Nothing assault related" is readable by a person and invisible to a query, and a category set
-- is what a future Quick Match integration would filter on.
--
-- criminal_lookback_basis — the distinction a years-only column cannot carry. An offense date and
-- a conviction date can sit years apart, so "7 years" means two different things depending on
-- which the office counts from. NULL means they did not say, and an unstated basis must never be
-- read as a conviction date: A REPORTED CHARGE IS NOT A PROVEN CONVICTION.
--
-- ── NULL MEANS UNKNOWN, ALWAYS ──────────────────────────────────────────────────────────────
-- Every column is nullable and ships EMPTY. NULL is never "Not Considered": a property nobody has
-- asked must never read as one that refuses, and refusing IS a finding. Likewise an EMPTY
-- category set is not "nothing is restricted" — the application writes NULL instead, and the
-- cardinality CHECK below makes the empty array unstorable so the two can never be confused.
--
-- ── NOTHING HERE MATCHES ANYBODY ────────────────────────────────────────────────────────────
-- No matching code reads these columns. Quick Match, Unleash Beast, Top Pick and the Smart Form
-- are untouched by this migration and by the release that accompanies it; the columns exist to be
-- entered and verified first, and to be read later only when that is approved on its own.

alter table public.property_catalog
  -- Felony. 'considered' is the office's word and promises REVIEW, never approval.
  add column if not exists felony_policy                      text,
  add column if not exists felony_min_age_years               integer,
  add column if not exists felony_restrictions                text,
  -- Misdemeanor, kept entirely separate: a property may weigh the two very differently, and one
  -- shared "criminal" answer could not say so.
  add column if not exists misdemeanor_policy                 text,
  add column if not exists misdemeanor_min_age_years          integer,
  add column if not exists misdemeanor_restrictions           text,
  -- The structured category set, and what the lookback is counted from.
  add column if not exists criminal_restricted_offense_types  text[],
  add column if not exists criminal_lookback_basis            text,
  -- Exceptions and anything the structured fields cannot hold. The policy table's own name.
  add column if not exists background_screening_notes         text;

-- ── CONTROLLED VOCABULARIES ─────────────────────────────────────────────────────────────────
-- NOT VALID is deliberate and matches 20261110000000/4: the columns ship empty, so there is
-- nothing to validate and no 4,207-row scan, while every future write is constrained.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_felony_policy_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_felony_policy_vocab
      check (felony_policy is null
             or felony_policy in ('considered','case_by_case','not_considered')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_misdemeanor_policy_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_misdemeanor_policy_vocab
      check (misdemeanor_policy is null
             or misdemeanor_policy in ('considered','case_by_case','not_considered')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_criminal_lookback_basis_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_criminal_lookback_basis_vocab
      check (criminal_lookback_basis is null
             or criminal_lookback_basis in ('offense_date','conviction_date')) not valid;
  end if;
  -- Ages are years, not decades. A stray 300 is a typo, not a policy. Same bound as the
  -- broken-lease and eviction ages, so one rule covers every lookback in the table.
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_criminal_age_sane') then
    alter table public.property_catalog
      add constraint property_catalog_criminal_age_sane
      check ((felony_min_age_years      is null or felony_min_age_years      between 0 and 20)
         and (misdemeanor_min_age_years is null or misdemeanor_min_age_years between 0 and 20)) not valid;
  end if;
  -- The category set: known tokens only, and NEVER the empty array. An empty set would be a
  -- second way to say "unknown", and the one that reads like a stated "nothing is restricted".
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_criminal_offense_types_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_criminal_offense_types_vocab
      check (criminal_restricted_offense_types is null
             or (cardinality(criminal_restricted_offense_types) > 0
                 and criminal_restricted_offense_types
                     <@ array['drug','dwi','assault','theft_fraud','sex_offense','other']::text[])) not valid;
  end if;
end
$$;

comment on column public.property_catalog.felony_policy is
  'Owner-entered: considered | case_by_case | not_considered. NULL = unknown, never "not considered". Describes the PROPERTY, never a renter; "considered" promises review, not approval.';
comment on column public.property_catalog.misdemeanor_policy is
  'Owner-entered: considered | case_by_case | not_considered. Deliberately separate from felony_policy — a property may treat the two differently.';
comment on column public.property_catalog.felony_min_age_years is
  'Owner-entered lookback in whole years. Read together with criminal_lookback_basis, which says whether the office counts from the offense or the conviction. NULL = unknown.';
comment on column public.property_catalog.misdemeanor_min_age_years is
  'Owner-entered lookback in whole years, for a misdemeanor. NULL = unknown.';
comment on column public.property_catalog.felony_restrictions is
  'Property-specific wording about felonies, verbatim from the office ("nothing assault related"). Free text because the condition is what decides whether the policy applies.';
comment on column public.property_catalog.misdemeanor_restrictions is
  'Property-specific wording about misdemeanors, verbatim from the office. Free text, same reason.';
comment on column public.property_catalog.criminal_restricted_offense_types is
  'Owner-entered set of RESTRICTED categories: drug | dwi | assault | theft_fraud | sex_offense | other. NULL = unknown. The empty array is unstorable on purpose — it would read as "nothing is restricted", which is a different claim.';
comment on column public.property_catalog.criminal_lookback_basis is
  'Owner-entered: offense_date | conviction_date — what the minimum ages are measured FROM. NULL = the office did not say, and must never be read as a conviction date. A reported charge is not a proven conviction.';
comment on column public.property_catalog.background_screening_notes is
  'Owner-entered exceptions and screening details the structured columns cannot hold. Same name as property_approval_policy.background_screening_notes, same meaning.';
