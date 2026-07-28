-- Invoice Details for Closed leads — a structured post-close commission-
-- tracking record (lease + commission info needed to get paid) that also feeds
-- future commission reporting/analytics. Stored inline on the lead; surfaced in
-- the Lead Panel's "Invoice Details" section, which only renders for Closed
-- leads. Total Invoice Amount is derived (Base Rent × Commission %), so it is
-- computed in the UI and deliberately NOT stored.

alter table public.leads
  add column if not exists invoice_property_name        text,
  add column if not exists invoice_unit_number          text,
  add column if not exists invoice_lease_start_date     date,
  add column if not exists invoice_lease_term           text,
  add column if not exists invoice_base_rent            numeric,
  add column if not exists invoice_commission_pct       numeric,
  add column if not exists invoice_expected_commission  numeric,
  add column if not exists invoice_submitted            boolean not null default false,
  add column if not exists invoice_commission_paid      boolean not null default false;
