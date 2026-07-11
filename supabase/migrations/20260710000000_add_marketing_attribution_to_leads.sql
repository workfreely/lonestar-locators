-- Marketing attribution fields for the leads table (Phase 1: Marketing
-- Attribution Foundation + Performance page).
--
-- Purely additive: nullable, no default, no backfill, no change to any
-- existing row. `source` (the existing collapsed website/facebook/tiktok/
-- etc. value) is untouched and continues to work exactly as it does today
-- — these are separate, raw attribution fields alongside it.

alter table public.leads
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists fbclid text,
  add column if not exists referrer_url text,
  add column if not exists landing_page text,
  add column if not exists device_type text,
  add column if not exists browser text,
  add column if not exists operating_system text;
