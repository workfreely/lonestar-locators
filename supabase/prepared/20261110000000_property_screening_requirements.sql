-- PROPOSED — NOT APPLIED TO PRODUCTION.
--
-- Structured screening requirements for the Quick Match collection.
--
-- ── WHY COLUMNS AND NOT A JSONB BLOB ────────────────────────────────────────────────────────
-- Three existing mechanisms in this codebase are keyed on FIELD NAMES, and a blob is invisible
-- to all three:
--   • property_field_provenance / property_enrichment_events record provenance per field_name,
--     so a policy inside a blob could never carry its own source or verification date;
--   • the enrichment firewall in lib/propertyEnrichment/policy.ts gates on field names
--     (OWNER_ONLY_FIELDS), so a blob could not be protected from automated writes;
--   • a CHECK constraint can hold a column to a fixed vocabulary. Nothing constrains the inside
--     of a blob, and a screening policy is exactly where a typo must not be possible.
--
-- ── WHY THESE ARE OWNER-ONLY ────────────────────────────────────────────────────────────────
-- Same reason credit and commission already are, and stronger. These values come from a locator
-- asking a leasing office what they will accept. A scraper reading a marketing page cannot
-- establish that, and a wrong value does not merely mislead — it sends a renter to be declined,
-- or skips the one property that would have approved them. The application must add all eleven
-- to OWNER_ONLY_FIELDS so no automated job can reach them.
--
-- ── NULL MEANS UNKNOWN, ALWAYS ──────────────────────────────────────────────────────────────
-- Every column is nullable and ships EMPTY. No default encodes a guess. A property with nothing
-- entered reads as Needs Verification, and becomes a real criterion the moment the owner types
-- one. That is what makes added screening information take effect with no code change.
--
-- ── WHY NOT THE EXISTING DEPOSIT COLUMNS ────────────────────────────────────────────────────
-- deposit_amount / deposit_range already exist, but they are the property's STANDARD deposit and
-- they sit in CANONICAL_SCALAR_FIELDS, which automated enrichment may write from a marketing
-- page. A conditional screening surcharge is a different quantity, and storing it there would put
-- a screening condition outside the owner firewall that protects every other screening value.
-- Hence the two dedicated, owner-controlled charge columns below.

alter table public.property_catalog
  -- Broken lease. accepted_if_paid is the real condition several properties state ("only if
  -- paid off"); it is NOT the same as not_accepted and must stay distinguishable.
  add column if not exists broken_lease_status                text,
  add column if not exists broken_lease_min_age_years         integer,
  add column if not exists broken_lease_balance_requirement   text,
  add column if not exists broken_lease_max_balance           numeric(10,2),
  -- Eviction, mirroring broken lease.
  add column if not exists eviction_status                    text,
  add column if not exists eviction_min_age_years             integer,
  -- Outstanding apartment debt / collections, which several notes treat separately from a
  -- broken lease ("apartment/rental debt and utility balances are the concern").
  add column if not exists rental_debt_status                 text,
  -- Approval COSTS. Not pass/fail, but the agent and the client have to know them.
  add column if not exists screening_additional_deposit       text,
  add column if not exists screening_risk_fee                 text,
  add column if not exists screening_guarantor_program        text,
  -- When the owner last confirmed the requirements above. Separate from verified_at (the record
  -- as a whole) and from credit_screening_checked_at (the credit answer), so confirming one does
  -- not restamp the others.
  add column if not exists screening_requirements_checked_at  date;

-- ── CONTROLLED VOCABULARIES ─────────────────────────────────────────────────────────────────
-- NOT VALID is deliberate: the columns are empty, so there is nothing to validate, and this
-- keeps the statement from scanning 4,207 rows while still constraining every future write.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_broken_lease_status_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_broken_lease_status_vocab
      check (broken_lease_status is null or broken_lease_status in ('accepted','accepted_if_paid','not_accepted')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_eviction_status_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_eviction_status_vocab
      check (eviction_status is null or eviction_status in ('accepted','accepted_if_paid','not_accepted')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_rental_debt_status_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_rental_debt_status_vocab
      check (rental_debt_status is null or rental_debt_status in ('accepted','accepted_if_paid','not_accepted')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_bl_balance_requirement_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_bl_balance_requirement_vocab
      check (broken_lease_balance_requirement is null
             or broken_lease_balance_requirement in ('must_be_paid','payments_or_plan','balance_ok')) not valid;
  end if;
  -- Ages are years, not decades. A stray 300 is a typo, not a policy.
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_screening_age_sane') then
    alter table public.property_catalog
      add constraint property_catalog_screening_age_sane
      check ((broken_lease_min_age_years is null or broken_lease_min_age_years between 0 and 20)
         and (eviction_min_age_years    is null or eviction_min_age_years    between 0 and 20)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_bl_max_balance_sane') then
    alter table public.property_catalog
      add constraint property_catalog_bl_max_balance_sane
      check (broken_lease_max_balance is null or broken_lease_max_balance >= 0) not valid;
  end if;
end
$$;

comment on column public.property_catalog.broken_lease_status is
  'Owner-entered: accepted | accepted_if_paid | not_accepted. NULL = unknown, never "no".';
comment on column public.property_catalog.broken_lease_balance_requirement is
  'Owner-entered: must_be_paid | payments_or_plan | balance_ok. NULL = unknown.';
comment on column public.property_catalog.screening_requirements_checked_at is
  'When the OWNER last confirmed the structured screening requirements. Not a leasing-office verification unless the owner says so.';
