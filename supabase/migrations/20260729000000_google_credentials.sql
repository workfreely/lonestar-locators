-- Per-user Google OAuth credential storage — the "real OAuth token storage"
-- the profiles onboarding migration deferred. One row per user; holds the
-- long-lived refresh token granted during onboarding's Connect step (Google
-- Calendar + Contacts scopes).
--
-- SECURITY: RLS is enabled with NO policies, so the anon/authenticated roles
-- can never read or write this table — only the service role (which bypasses
-- RLS) touches it, from the server-side OAuth callback. This keeps the refresh
-- token out of the browser entirely. The client learns connection state from
-- the non-sensitive profiles.google_connected boolean, never from here.

create table if not exists public.google_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  google_email text,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_credentials enable row level security;

-- Intentionally no policies: service-role only.

comment on table public.google_credentials is
  'Per-user Google OAuth refresh tokens (Calendar + Contacts). Service-role only; RLS enabled with no policies. Client reads connection state from profiles.google_connected.';
