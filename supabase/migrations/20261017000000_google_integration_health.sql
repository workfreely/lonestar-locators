-- GOOGLE INTEGRATION HEALTH — make a dead token visible instead of silent.
--
-- ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────────────────────
-- Google Contacts and Calendar are both deliberately best-effort: a failure is swallowed so it
-- can never break a lead write. That is right, but it has no counterpart — a refresh token that
-- was revoked in August kept failing silently into October, and every new lead quietly skipped
-- its contact and its calendar event. Nobody could see it without reading server logs.
--
-- Two columns, on the row that already holds the credential:
--   last_error     a short, non-sensitive CODE (e.g. 'invalid_grant'). Never a provider message,
--                  never a token, never an email — the agent is shown a reconnect prompt, not a
--                  stack trace.
--   last_error_at  when it was last observed, so "failing since" is answerable.
--
-- Cleared on the next success, so the indicator reflects the CURRENT state rather than a scar.
--
-- Deliberately NOT a retry counter or a backoff schedule: a revoked token never heals by itself,
-- so the only useful response is to stop trying and ask the human to reconnect.

alter table public.google_credentials
  add column if not exists last_error    text,
  add column if not exists last_error_at timestamptz;

comment on column public.google_credentials.last_error is
  'Short non-sensitive failure code from the last Google call (e.g. invalid_grant). NULL = healthy. Never a provider message or token.';

-- Finding the accounts that need reconnecting, without scanning every credential.
create index if not exists google_credentials_unhealthy_idx
  on public.google_credentials (user_id) where last_error is not null;
