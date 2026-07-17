-- Timestamp for when a lead first transitioned into crm_status = "closed".
-- Set only by app/api/admin/leads/update-stage/route.ts, on transitions
-- into "closed" — never inferred from created_at. Lets Closed-based
-- reporting (Closed This Month, Conversion Rate, Monthly Performance
-- History) keep counting a lead correctly even after the monthly Closed
-- cleanup archives it out of the Closed column.
--
-- Purely additive: nullable, no default, no backfill, no change to any
-- existing row.

alter table public.leads
  add column if not exists closed_at timestamptz;
