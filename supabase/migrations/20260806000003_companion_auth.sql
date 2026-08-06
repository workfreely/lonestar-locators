-- Milestone B — Companion authentication storage (LB Supabase).
--
-- OPAQUE tokens + sha256 hashing (NO JWTs), matching LB's existing device-token
-- pattern (lib/companion/auth.ts): identity is always resolved server-side from
-- the token hash, never trusted from the request. Short-lived (15-min) access
-- tokens and 30-day ROTATING refresh tokens are both opaque and stored ONLY as
-- a hash; every request re-checks the connection (membership / entitlement /
-- revocation) against the DB. Authorization codes are single-use, hashed,
-- short-lived, and PKCE-bound. No password, cookie, or PII is ever stored here.
--
-- All four tables are server-only: RLS enabled with NO policies, so the anon
-- and authenticated roles have zero access; only the service role (used by the
-- server auth routes) can read/write them.

-- ── Connections: one approved (user, workspace, extension, scopes) grant ──────
create table if not exists public.companion_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  extension_id  text not null,                 -- Chrome extension client this grant is bound to
  scopes        text[] not null default '{}',
  label         text,                          -- optional display (e.g. browser/user-agent)
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz                    -- disconnect / switch → set; revokes access + refresh
);
create index if not exists companion_connections_user_idx on public.companion_connections (user_id);
create index if not exists companion_connections_active_idx
  on public.companion_connections (user_id, extension_id) where revoked_at is null;

-- ── Refresh tokens: opaque, hashed, ROTATING with reuse detection ────────────
create table if not exists public.companion_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.companion_connections(id) on delete cascade,
  family_id    uuid not null,                  -- rotation family; replaying a rotated token revokes the whole family
  token_hash   text not null unique,           -- sha256 of the opaque refresh secret (never the secret itself)
  expires_at   timestamptz not null,           -- 30 days
  created_at   timestamptz not null default now(),
  rotated_at   timestamptz,                     -- set when consumed/rotated (a second use = reuse)
  replaced_by  uuid references public.companion_refresh_tokens(id),
  revoked_at   timestamptz
);
create index if not exists companion_refresh_tokens_family_idx on public.companion_refresh_tokens (family_id);
create index if not exists companion_refresh_tokens_conn_idx on public.companion_refresh_tokens (connection_id);

-- ── Access tokens: opaque, hashed, short-lived (15-min) ──────────────────────
-- Per request: hash the bearer, look it up here, check expiry + revoked_at,
-- then re-validate the connection (membership / entitlement / extension id).
create table if not exists public.companion_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.companion_connections(id) on delete cascade,
  token_hash    text not null unique,          -- sha256 of the opaque access secret
  expires_at    timestamptz not null,          -- 15 minutes
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists companion_access_tokens_conn_idx on public.companion_access_tokens (connection_id);
create index if not exists companion_access_tokens_expiry_idx on public.companion_access_tokens (expires_at);

-- ── Authorization codes: single-use, hashed, short-lived, PKCE-bound ─────────
create table if not exists public.companion_auth_codes (
  id                    uuid primary key default gen_random_uuid(),
  code_hash             text not null unique,   -- sha256 of the single-use code
  user_id               uuid not null references auth.users(id) on delete cascade,
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  extension_id          text not null,          -- the extension the code was issued FOR
  scopes                text[] not null default '{}',
  code_challenge        text not null,          -- PKCE S256 challenge
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  state                 text not null,          -- CSRF/binding state echoed by the extension
  expires_at            timestamptz not null,   -- ~60s
  consumed_at           timestamptz,            -- single-use marker
  created_at            timestamptz not null default now()
);
create index if not exists companion_auth_codes_expiry_idx on public.companion_auth_codes (expires_at);

alter table public.companion_connections    enable row level security;
alter table public.companion_refresh_tokens enable row level security;
alter table public.companion_access_tokens   enable row level security;
alter table public.companion_auth_codes      enable row level security;
-- (No policies on purpose — server/service-role only. Deny-all to anon + authenticated.)

-- ── Theme preference (Milestone B/C) — the SINGLE server-authoritative pref ──
-- Constrained to the 5 shared canonical theme IDs; both CRM and Companion read
-- this. Default midnight (also the signed-out/not-connected safe default).
alter table public.profiles
  add column if not exists theme text not null default 'midnight'
  check (theme in ('midnight', 'obsidian', 'rose', 'evergreen', 'purple'));

comment on column public.profiles.theme is
  'Single server-authoritative UI theme preference (shared by CRM + Companion). One of the 5 canonical THEME_IDS; default/safe = midnight.';

-- ── Durable, distributed rate limiter (safeguard #2) ─────────────────────────
-- Fixed-window counter shared across all serverless instances (the in-memory
-- limiter stays as a fast first layer). Keys are non-secret combinations
-- (ip / user_id / extension_id / connection_id / refresh family_id) — NEVER a
-- raw token. One atomic upsert per hit.
create table if not exists public.companion_rate_limits (
  bucket_key    text   not null,
  window_bucket bigint not null,     -- floor(epoch / window_seconds)
  count         int    not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (bucket_key, window_bucket)
);
alter table public.companion_rate_limits enable row level security; -- server/service-role only

create or replace function public.companion_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, current_count int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket bigint := floor(extract(epoch from now()) / p_window_seconds)::bigint;
  v_count  int;
begin
  insert into public.companion_rate_limits (bucket_key, window_bucket, count, updated_at)
       values (p_key, v_bucket, 1, now())
  on conflict (bucket_key, window_bucket)
       do update set count = public.companion_rate_limits.count + 1, updated_at = now()
    returning count into v_count;
  return query select (v_count <= p_limit), v_count, to_timestamp((v_bucket + 1)::bigint * p_window_seconds);
end;
$$;
revoke all on function public.companion_rate_limit(text, int, int) from public;
grant execute on function public.companion_rate_limit(text, int, int) to service_role;

-- ── Atomic single-use authorization-code consume (safeguard #1) ──────────────
-- One conditional UPDATE consumes an unexpired, unused, PKCE-matching code
-- exactly once. The caller passes the Node-computed S256 challenge (never the
-- verifier), so PKCE is enforced IN the atomic update without SQL crypto. Two
-- concurrent calls: the row lock means only one sets consumed_at; the other
-- matches nothing.
create or replace function public.companion_consume_auth_code(
  p_code_hash          text,
  p_computed_challenge text,
  p_extension_id       text,
  p_state              text
)
returns table (user_id uuid, workspace_id uuid, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.companion_auth_codes c
     set consumed_at = now()
   where c.code_hash = p_code_hash
     and c.consumed_at is null
     and c.expires_at > now()
     and c.extension_id = p_extension_id
     and c.state = p_state
     and c.code_challenge = p_computed_challenge
  returning c.user_id, c.workspace_id, c.scopes;
end;
$$;
revoke all on function public.companion_consume_auth_code(text, text, text, text) from public;
grant execute on function public.companion_consume_auth_code(text, text, text, text) to service_role;

-- ── Atomic rotating-refresh with reuse detection (safeguard #1) ──────────────
-- Locks the presented refresh row FOR UPDATE. If it was already rotated (a
-- reuse / concurrent second use), revokes the ENTIRE family + the connection's
-- access tokens + the connection. Otherwise rotates: marks old consumed, mints
-- the new refresh (same family) + access rows. Two simultaneous requests with
-- the same token can never both rotate — the loser hits reuse detection.
create or replace function public.companion_rotate_refresh(
  p_old_hash            text,
  p_new_refresh_hash    text,
  p_new_refresh_expires timestamptz,
  p_new_access_hash     text,
  p_new_access_expires  timestamptz
)
returns table (status text, connection_id uuid, user_id uuid, workspace_id uuid, extension_id text, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old      public.companion_refresh_tokens%rowtype;
  v_conn     public.companion_connections%rowtype;
  v_new_id   uuid;
begin
  select * into v_old from public.companion_refresh_tokens r
    where r.token_hash = p_old_hash for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::text, null::text[]; return;
  end if;
  if v_old.revoked_at is not null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::text, null::text[]; return;
  end if;
  if v_old.expires_at <= now() then
    return query select 'expired'::text, null::uuid, null::uuid, null::uuid, null::text, null::text[]; return;
  end if;

  -- REUSE: already rotated → burn the whole family + access tokens + connection.
  -- (Table columns are fully qualified — connection_id/user_id/etc. are also
  -- RETURNS TABLE out-params, so a bare reference would be ambiguous.)
  if v_old.rotated_at is not null then
    update public.companion_refresh_tokens rt set revoked_at = now()
      where rt.family_id = v_old.family_id and rt.revoked_at is null;
    update public.companion_access_tokens act set revoked_at = now()
      where act.connection_id = v_old.connection_id and act.revoked_at is null;
    update public.companion_connections cn set revoked_at = now()
      where cn.id = v_old.connection_id and cn.revoked_at is null;
    return query select 'reuse_detected'::text, v_old.connection_id, null::uuid, null::uuid, null::text, null::text[]; return;
  end if;

  select * into v_conn from public.companion_connections where id = v_old.connection_id;
  if not found or v_conn.revoked_at is not null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::text, null::text[]; return;
  end if;

  -- Rotate (all within this function's single transaction).
  insert into public.companion_refresh_tokens (connection_id, family_id, token_hash, expires_at)
    values (v_old.connection_id, v_old.family_id, p_new_refresh_hash, p_new_refresh_expires)
    returning id into v_new_id;
  update public.companion_refresh_tokens set rotated_at = now(), replaced_by = v_new_id
    where id = v_old.id;
  insert into public.companion_access_tokens (connection_id, token_hash, expires_at)
    values (v_old.connection_id, p_new_access_hash, p_new_access_expires);
  update public.companion_connections set last_used_at = now() where id = v_old.connection_id;

  return query select 'rotated'::text, v_conn.id, v_conn.user_id, v_conn.workspace_id, v_conn.extension_id, v_conn.scopes;
end;
$$;
revoke all on function public.companion_rotate_refresh(text, text, timestamptz, text, timestamptz) from public;
grant execute on function public.companion_rotate_refresh(text, text, timestamptz, text, timestamptz) to service_role;
