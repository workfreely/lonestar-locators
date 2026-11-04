-- PREPARED — NOT APPLIED TO PRODUCTION.
--
-- The three client facts Quick Match needs and nothing currently records.
--
-- ── WHY broken_lease_paid IS NOT A DUPLICATE OF broken_lease_amount ─────────────────────────
-- leads.broken_lease_amount already exists and holds a BUCKET from BALANCE_OPTIONS, whose
-- smallest option is "Less than $500". There is no $0 and no "paid in full". A client who has
-- settled their balance is therefore forced to pick a bucket that says they still owe something,
-- and NULL means "not answered", never "paid".
--
-- So the amount column owns HOW MUCH and genuinely cannot express WHETHER IT IS SETTLED. Without
-- the boolean below, a property whose stated policy is "broken lease accepted only if paid off"
-- can never resolve to a Strong Candidate for anybody, however completely the property side is
-- filled in. That is the single sharpest gap in the current intake.
--
-- ── destination_zip IS ALREADY LIVE AND IS NOT TOUCHED HERE ─────────────────────────────────
-- An earlier draft of this migration also added `destination_zip`. That column shipped on
-- 2026-11-04 in migration 20261113000000 with its own five-digit CHECK, so it is deliberately
-- ABSENT from the statement below — re-declaring it would be harmless under `if not exists` but
-- would misrepresent what this migration does.
--
-- ── THE SMART FORM IS NOT TOUCHED ───────────────────────────────────────────────────────────
-- None of these three columns is a public form field. They are CRM-side facts learned in
-- conversation and entered by the agent. The public Smart Form keeps its current questions,
-- validations and submission logic exactly.
--
-- Three states matter for the booleans, which is why they are nullable and not NOT NULL DEFAULT
-- false: true (settled), false (still owed), NULL (nobody has asked). Reading NULL as false would
-- invent an unpaid balance for every client on file today.

alter table public.leads
  add column if not exists broken_lease_paid  boolean,
  add column if not exists eviction_paid      boolean,
  add column if not exists rental_debt_status text;

do $$
begin
  -- NOT VALID is deliberate: the column is empty, so there is nothing to validate, and this
  -- keeps the statement from scanning the table while still constraining every future write.
  if not exists (select 1 from pg_constraint where conname = 'leads_rental_debt_status_vocab') then
    alter table public.leads
      add constraint leads_rental_debt_status_vocab
      check (rental_debt_status is null
             or rental_debt_status in ('none','owed','paid','payment_plan')) not valid;
  end if;
end
$$;

comment on column public.leads.broken_lease_paid is
  'Whether the broken-lease balance is settled. NULL = not asked (never "unpaid"). broken_lease_amount owns HOW MUCH and cannot express zero.';
comment on column public.leads.eviction_paid is
  'Whether the eviction balance is settled. NULL = not asked, never "unpaid".';
comment on column public.leads.rental_debt_status is
  'none | owed | paid | payment_plan. Apartment/rental debt and collections only — not medical debt and not credit-card collections. NULL = not asked.';
