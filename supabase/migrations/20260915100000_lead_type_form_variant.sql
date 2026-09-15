-- Canonical lead classification, part 1 of 2 (data/schema; NO constraint yet).
--
-- `lead_type` had been overloaded with two different dimensions:
--   • CLIENT TYPE  — renter / buyer / seller  (what kind of client)
--   • FORM SHAPE   — short / full             (which form they filled out)
-- The deployed submit route wrote the form shape into lead_type (formType),
-- so renter leads were stored as "full"/"short". This splits the dimensions:
-- lead_type becomes CLIENT TYPE only; a new form_variant column carries the
-- shape.
--
-- Part 2 (the CHECK constraint locking lead_type to renter/buyer/seller) is a
-- SEPARATE migration applied only AFTER the new writer is deployed — adding it
-- while the old writer still emits "full"/"short" would make its inserts fail.

-- 1) Form shape lives here now. Nullable: a row whose shape is genuinely
--    unknown (e.g. a direct insert that never went through a form) stays null
--    rather than being guessed.
alter table public.leads add column if not exists form_variant text;

-- 2) Backfill the shape from the old overloaded value, before we overwrite it.
update public.leads set form_variant = 'full'  where lead_type = 'full'  and form_variant is null;
update public.leads set form_variant = 'short' where lead_type = 'short' and form_variant is null;

-- 3) Normalize lead_type to the client type. Every current lead is a renter
--    (audit confirmed: the only non-form-shape value present was the default
--    'renter' itself), so both form-shape values collapse to 'renter'.
update public.leads set lead_type = 'renter' where lead_type in ('full', 'short');

-- Sibling tables (new_home_leads, reported_leases) are intentionally untouched.
