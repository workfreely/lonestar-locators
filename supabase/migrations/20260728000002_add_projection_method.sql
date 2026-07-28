-- Sales Goals: how the dashboard estimates commission for pipeline/projection.
--   'avg_commission' (default) — value every lead at avg_commission_per_lease.
--   'lead_budget'            — use the lower end of the lead's budget range,
--                              falling back to avg_commission_per_lease when the
--                              lead has no usable budget.
-- Kept as a single per-account setting (no per-market commission) to keep
-- onboarding simple.

alter table public.profiles
  add column if not exists projection_method text not null default 'avg_commission';
