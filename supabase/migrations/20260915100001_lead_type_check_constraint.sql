-- Canonical lead classification, part 2 of 2 (CHECK constraint).
--
-- Applied ONLY after the new submit route (which writes lead_type = client type
-- and form_variant = form shape) is deployed. Adding this while the old writer
-- still emitted "full"/"short" would have rejected every new lead.
--
-- Re-normalize first, defensively: any lead created in the window between the
-- data migration and the code deploy could still carry a form-shape value.
-- ADD CONSTRAINT validates existing rows, so a straggler would fail the ALTER.
update public.leads set lead_type = 'renter' where lead_type in ('full', 'short');

-- lead_type is now strictly the client type. Default stays 'renter'.
-- buyer/seller are schema-valid for future intake; no buyer/seller workflow yet.
alter table public.leads
  drop constraint if exists leads_lead_type_check;
alter table public.leads
  add constraint leads_lead_type_check
  check (lead_type in ('renter', 'buyer', 'seller'));

-- Form shape is optional but, when present, must be one of the two known
-- shapes — keeps the new column from silently accumulating garbage.
alter table public.leads
  drop constraint if exists leads_form_variant_check;
alter table public.leads
  add constraint leads_form_variant_check
  check (form_variant is null or form_variant in ('short', 'full'));
