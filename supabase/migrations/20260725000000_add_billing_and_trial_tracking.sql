-- Stripe billing + free trial tracking. Additive only — does not touch
-- leads, workflow, or any CRM table. This milestone is intentionally
-- decoupled from /admin: no access enforcement is wired up yet, so these
-- columns/tables are inert until a future milestone connects them.

alter table public.profiles
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,
  add column subscription_status text,
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique;

-- Trial abuse ledger — deliberately NOT the profiles table, so a deleted
-- account can't be recreated to get a second trial. Insert-only, never
-- updated. user_id is for traceability only; the row outlives the user.
-- Email-only for now — the original spec also wanted verified-phone dedup,
-- but phone verification lives in onboarding (Step 2), which is frozen for
-- this milestone. Add a phone_number column + check here when that lands.
create table public.trial_usage (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.trial_usage enable row level security;
-- No policies: service-role only. This table must never be readable or
-- writable by an authenticated user's own session.

-- Stripe webhook idempotency — Stripe retries deliveries, so we dedupe on
-- event.id before processing.
create table public.processed_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;
-- No policies: service-role only, same reasoning as trial_usage.

-- Grandfather in everyone who completed onboarding before billing existed
-- (i.e. the existing business's own team) so this migration can't lock
-- anyone out once enforcement is wired up later.
update public.profiles
set subscription_status = 'active'
where onboarding_completed = true
  and subscription_status is null;
