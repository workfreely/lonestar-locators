-- ROLLBACK 20261114000000_lead_screening_resolution.
--
-- Safe while the columns are empty, which the verify script proves. If an agent has since
-- recorded a paid/unpaid fact, DROP DISCARDS IT — check the counts below before running this.
--
--   select count(broken_lease_paid)  as bl_paid,
--          count(eviction_paid)      as ev_paid,
--          count(rental_debt_status) as debt
--     from public.leads;
alter table public.leads drop constraint if exists leads_rental_debt_status_vocab;
alter table public.leads
  drop column if exists broken_lease_paid,
  drop column if exists eviction_paid,
  drop column if exists rental_debt_status;
-- destination_zip is NOT dropped here: it shipped separately in 20261113000000 and is live.
