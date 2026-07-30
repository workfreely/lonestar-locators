-- Locator Beast Companion (macOS Phone Sync) — backend contract.
--
-- Two tables:
--   device_tokens      — a paired Mac companion's revocable API token (hash only)
--   companion_messages — iMessage/SMS ingested by the companion; the server-side
--                        transcript source of truth (replaces reading the local
--                        ~/Library/Messages/chat.db, which only works on-device).
--
-- Identity is ALWAYS resolved server-side from the token (never trusted from the
-- request body) — same principle as resolve_smart_form / Critical #2.

-- ── Paired devices ──────────────────────────────────────────────────────────
create table if not exists public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id)   on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  device_name   text,
  token_hash    text not null unique,   -- sha256(raw token); the raw token is shown once, never stored
  token_prefix  text not null,          -- e.g. "lbk_ab12" for the Connected Devices list
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists device_tokens_workspace_idx on public.device_tokens(workspace_id);

alter table public.device_tokens enable row level security;

-- Members may view + revoke their own workspace's devices (Connected Devices UI).
-- Tokens are ISSUED server-side (service role), so there is no client insert policy.
create policy "members read device_tokens"
  on public.device_tokens for select
  using (public.is_active_workspace_member(workspace_id));

create policy "members revoke device_tokens"
  on public.device_tokens for update
  using (public.is_active_workspace_member(workspace_id))
  with check (public.is_active_workspace_member(workspace_id));

-- ── Ingested messages ───────────────────────────────────────────────────────
create table if not exists public.companion_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id)        on delete cascade,
  -- Attributed to a lead by normalized phone at ingest time; nullable when no
  -- lead matches (kept so a later-created lead can be back-attributed).
  lead_id       bigint references public.leads(id) on delete set null,
  guid          text not null,          -- message.guid from chat.db — idempotency key
  phone         text,                   -- normalized handle (E.164-ish)
  is_from_me    boolean not null default false,
  body          text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, guid)           -- idempotent re-delivery per workspace
);
create index if not exists companion_messages_lead_idx  on public.companion_messages(workspace_id, lead_id, sent_at);
create index if not exists companion_messages_phone_idx on public.companion_messages(workspace_id, phone);

alter table public.companion_messages enable row level security;

-- Members may read their workspace's messages (for the AI Assistant / transcript).
-- Writes are service-role only (the ingest endpoint) — no client insert policy.
create policy "members read companion_messages"
  on public.companion_messages for select
  using (public.is_active_workspace_member(workspace_id));

comment on table public.companion_messages is
  'iMessage/SMS ingested by the macOS Companion. Server-side transcript source (replaces on-device chat.db in production). Written service-role only via /api/companion/messages.';
