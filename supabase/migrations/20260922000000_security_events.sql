-- Security Beast — Checkpoint 2: append-only security event foundation.
--
-- Server-written telemetry that later supports login history, new-device
-- detection, unusual-login detection, Trusted Devices and account-security
-- alerts. This checkpoint records only successful authentication ('login')
-- events; the `event_type` column is free text so new types need no migration.
--
-- WRITE MODEL (mirrors device_tokens, NOT lead_timeline): events are written
-- ONLY by the server via the service role. RLS is enabled with NO policies, so
-- authenticated browser clients and anon cannot read OR insert — a client can
-- never fabricate a security event, and nothing is exposed until a future
-- Security Beast UI checkpoint adds a narrowly-scoped (owner-only) SELECT policy.
--
-- DATA CAPTURED is deliberately minimal and non-invasive: who, when, where-from
-- (server-observed IP + Vercel country), and coarse parsed device info (device
-- type / browser / OS — NOT the raw UA string, and no browser fingerprinting).
-- It stores NO passwords, session tokens, auth tokens, device credentials, or
-- other secrets.
create table if not exists public.security_events (
  id               uuid primary key default gen_random_uuid(),
  -- Who the event is about. Nullable so future pre-auth/system events (not in
  -- this checkpoint) can be recorded. Cascade-delete so account deletion purges
  -- the user's security history (it holds IP/region PII).
  user_id          uuid references auth.users(id) on delete cascade,
  -- Populated for future workspace-scoped events; left null for login events in
  -- this checkpoint (login history is user-scoped). set null so a deleted
  -- workspace never removes security history.
  workspace_id     uuid references public.workspaces(id) on delete set null,
  -- Broad event type. This checkpoint writes only 'login'. Free text (no CHECK)
  -- so 'new_device', 'login_failed', 'trusted_device_added', … need no migration.
  event_type       text not null,
  -- How the auth happened, when relevant: 'password' | 'google_oauth'.
  method           text,
  -- Server-observed client IP (x-forwarded-for / x-real-ip). Null when unknown.
  ip               text,
  -- Approximate country from Vercel's x-vercel-ip-country when present; else null.
  country          text,
  -- Coarse parsed User-Agent (lib/leads/parseUserAgent) — NOT the raw UA.
  device_type      text,
  browser          text,
  operating_system text,
  -- Structured payload for future extensibility without new columns.
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- Read pattern is "this user's recent events, newest first" (login history,
-- new-device checks).
create index if not exists security_events_user_id_created_at_idx
  on public.security_events (user_id, created_at desc);

-- Server-written only: RLS enabled, and intentionally NO policies. The service
-- role bypasses RLS for the server-side inserts; every non-service caller
-- (authenticated browser session or anon) is denied both read and write. A
-- future UI checkpoint will add a scoped owner-only SELECT policy when needed.
alter table public.security_events enable row level security;
