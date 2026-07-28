-- Onboarding redesign, Phase 1. Additive only — extends the profiles table
-- (created in 20260724000000_add_profiles_onboarding.sql) with the Business
-- Profile name/email split, the two Business Goals fields, and the demo-
-- workspace flag. No existing column or table is touched.

alter table public.profiles
  -- Business Profile (Step 2). full_name is kept for backward compatibility;
  -- new signups collect first/last separately and email (prefilled from auth).
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,

  -- Business Goals (Step 3). Nullable — sensible client-side defaults are used
  -- when the user skips, and both are editable later in Settings. Drive the
  -- dashboard's monthly goal + projected-pipeline math (Phase 2).
  add column if not exists monthly_commission_goal numeric,
  add column if not exists avg_commission_per_lease numeric,

  -- Demo workspace. When true, the CRM renders client-side demo fixtures
  -- instead of real leads (nothing is ever written to the shared leads
  -- table); "Delete Demo Workspace" in Settings flips this back to false.
  add column if not exists demo_mode boolean not null default false;
