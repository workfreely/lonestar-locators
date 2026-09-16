-- Phase 2B — Sales Goals → Sales Analytics → Meta Analytics wiring.
--
-- 1) CLOSED-LEAD COMMISSION SNAPSHOT
--    Historical Sales / Meta ROAS reporting must stay stable when an agent later
--    changes their Sales Goals (Average Commission / Projection Method). So when a
--    lead transitions into Closed, application code freezes that lead's estimated
--    commission here, computed with the ONE canonical estimator
--    (lib/leads/commissionEstimate.ts::estimateLeadCommission) at that moment.
--    Open-pipeline projections keep using the LIVE estimate; only closes are frozen.
--
--    Both columns are nullable and populated only by app code on close (Kanban →
--    Closed and Confirm Lease). Reporting falls back to a live estimate for any
--    close that predates the snapshot, so no existing close is ever dropped.
--
-- 2) META PUBLISHER PLATFORM
--    Facebook vs Instagram (vs Messenger / Audience Network) can only be known from
--    Meta's {{site_source_name}} URL macro at click time. We persist the raw token
--    on the lead as first-touch attribution (normalized for display in code, never
--    collapsed). Existing meta_campaign_id/adset_id/ad_id + names + UTMs + fbclid and
--    their first-touch protection are unchanged.
--
-- Pre-launch: zero existing closed leads, so there is nothing to backfill. All
-- three columns start NULL for every current row. Fully reversible (DROP COLUMN).

alter table public.leads
  add column if not exists closed_estimated_commission numeric,
  add column if not exists closed_estimation_method text,
  add column if not exists meta_publisher_platform text;

comment on column public.leads.closed_estimated_commission is
  'Frozen estimated commission at the moment this lead closed (canonical estimator). Historical Sales/Meta reporting reads this; NULL for open leads and pre-snapshot closes (which fall back to a live estimate).';
comment on column public.leads.closed_estimation_method is
  'Projection method used to produce closed_estimated_commission: avg_commission | lead_budget.';
comment on column public.leads.meta_publisher_platform is
  'Raw Meta {{site_source_name}} token captured at click (fb | ig | msg | an | ...). First-touch attribution; normalized for display in lib/meta/publisherPlatform.ts.';
