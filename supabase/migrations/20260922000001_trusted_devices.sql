-- Security Beast — Checkpoint 3: Trusted Device foundation (RECOGNITION only).
--
-- Lets Security Beast answer "has this browser been seen for this account
-- before?" using a cryptographically random device credential — NOT browser
-- fingerprinting. Modeled on device_tokens: the raw credential is generated
-- server-side, returned to the browser ONCE in an httpOnly cookie, and only its
-- sha256 hash is stored here. A DB leak cannot yield a working device cookie.
--
-- RECOGNITION ≠ VERIFICATION. A row is created the first time a browser that
-- successfully authenticated is seen (ENROLLED / recognized). That is NOT proof
-- the device passed an independent challenge, so we do NOT call it "verified"
-- yet: `verified_at` stays null until a future "Was this you?" flow confirms it.
-- Only then is a device genuinely trusted. This checkpoint never sets it.
--
-- WRITE MODEL (like device_tokens / security_events): server-written via the
-- service role only. RLS is enabled with NO policies, so a browser client
-- (authenticated or anon) can neither read nor create/revoke device rows. A
-- future device-management UI checkpoint adds a scoped owner-only policy.
create table if not exists public.trusted_devices (
  id               uuid primary key default gen_random_uuid(),
  -- The account this device belongs to. Recognition is ALWAYS re-checked against
  -- the authenticated user, so one user's cookie can never recognize another's.
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- sha256(raw device credential). The raw credential is NEVER stored here (or
  -- anywhere server-side) — it lives only in the browser's httpOnly cookie.
  token_hash       text not null unique,
  -- Enrolled vs verified. Null = recognized only (this checkpoint). A future
  -- verification flow sets it; only a non-null value means genuinely trusted.
  verified_at      timestamptz,
  -- Coarse parsed device context (lib/leads/parseUserAgent) — never the raw UA.
  device_type      text,
  browser          text,
  operating_system text,
  -- Most recent server-observed IP — retained for future security analysis only.
  last_ip          text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  -- For future revocation ("secure my account" / remote logout). Unused here.
  revoked_at       timestamptz
);

create index if not exists trusted_devices_user_id_idx
  on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;
