-- PROPOSED — NOT APPLIED TO PRODUCTION.
--
-- The five columns the Approval Criteria editor needs that 20261110000000 does not already
-- provide. Additive, nullable, no defaults, no backfill. Apply AFTER 20261110000000.
--
-- ── WHY FIVE AND NOT FIFTEEN ────────────────────────────────────────────────────────────────
-- Everything else the editor asks for is already representable:
--
--   asked for                         | where it goes                              | new column?
--   ----------------------------------|--------------------------------------------|------------
--   broken-lease acceptance           | broken_lease_status                        | no (0000)
--   broken-lease minimum age          | broken_lease_min_age_years                 | no (0000)
--   balance must be paid in full      | broken_lease_balance_requirement=must_be_paid| no (0000)
--   payment plan / active payments    | …_balance_requirement=payments_or_plan     | no (0000)
--   maximum outstanding balance       | broken_lease_max_balance                   | no (0000)
--   eviction acceptance, minimum age  | eviction_status, eviction_min_age_years     | no (0000)
--   rental-debt acceptance            | rental_debt_status                         | no (0000)
--   additional / conditional deposit  | screening_additional_deposit (text)        | no (0000)
--   risk fee, and a fee RANGE         | screening_risk_fee (text)                  | no (0000)
--   nonrefundable requirement         | stated inside the two text fields above    | no
--   guarantor / co-signer program     | screening_guarantor_program (text)         | no (0000)
--   credit minimum, no-check, history | the five live credit_* columns             | no (live)
--   additional approval notes         | credit_screening_notes (live, 4000 chars)  | no (live)
--
-- The two charge fields stay TEXT deliberately: a risk fee is quoted as "$250–$500", as
-- "one month, nonrefundable", or as "$400 if the balance is unpaid". A numeric column would
-- have to drop the part that decides whether the number applies.
--
-- ── WHAT WAS GENUINELY MISSING ──────────────────────────────────────────────────────────────
-- Positive rental history AFTER the incident is a separate requirement from the incident's age
-- and from its balance — "2+ years old with good rental history since" states all three, and
-- folding it into the age would lose it. Eight of the fifty-five entries in the November batch
-- carry one.
--
-- Evictions and rental debt each needed their own balance rule. Reusing the broken-lease column
-- would say a property treats the two alike, which is exactly the assumption the owner asked not
-- to make: a property may accept a paid-off eviction while ignoring apartment debt entirely.
--
-- Nullable BOOLEAN carries three states, which is what is needed: NULL unknown, true required,
-- false explicitly not required. A property that said "no, we don't care about that" is a real
-- finding and must be storable as one.

alter table public.property_catalog
  add column if not exists broken_lease_positive_history_required  boolean,
  add column if not exists eviction_balance_requirement            text,
  add column if not exists eviction_positive_history_required      boolean,
  add column if not exists rental_debt_balance_requirement         text,
  add column if not exists rental_debt_max_balance                 numeric(10,2);

-- ── CONTROLLED VOCABULARIES ─────────────────────────────────────────────────────────────────
-- The SAME three tokens broken_lease_balance_requirement uses, so one reader understands all
-- three. NOT VALID because the columns ship empty — nothing to scan, every future write
-- constrained.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_ev_balance_requirement_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_ev_balance_requirement_vocab
      check (eviction_balance_requirement is null
             or eviction_balance_requirement in ('must_be_paid','payments_or_plan','balance_ok')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_rd_balance_requirement_vocab') then
    alter table public.property_catalog
      add constraint property_catalog_rd_balance_requirement_vocab
      check (rental_debt_balance_requirement is null
             or rental_debt_balance_requirement in ('must_be_paid','payments_or_plan','balance_ok')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_catalog_rd_max_balance_sane') then
    alter table public.property_catalog
      add constraint property_catalog_rd_max_balance_sane
      check (rental_debt_max_balance is null or rental_debt_max_balance >= 0) not valid;
  end if;
end
$$;

comment on column public.property_catalog.broken_lease_positive_history_required is
  'Owner-entered: does the property require good rental history AFTER the broken lease? NULL = unknown, false = they said it is not required.';
comment on column public.property_catalog.eviction_balance_requirement is
  'Owner-entered: must_be_paid | payments_or_plan | balance_ok, for an EVICTION balance. Deliberately separate from the broken-lease rule — a property may treat the two differently.';
comment on column public.property_catalog.rental_debt_balance_requirement is
  'Owner-entered: must_be_paid | payments_or_plan | balance_ok, for APARTMENT/RENTAL debt. Not medical and not credit-card collections, which properties weigh differently.';
comment on column public.property_catalog.rental_debt_max_balance is
  'Owner-entered ceiling on outstanding apartment/rental debt. NULL = unknown, never "no ceiling".';
