-- APPLIED 23 Nov 2026 — Buffer as a publishing route for existing destinations.
--
-- Approved as "Step 1 only" and applied in one transaction with ON_ERROR_STOP=1, after a dry run of
-- this whole file with `commit` replaced by `rollback` proved every statement succeeded and left the
-- catalog untouched. Verified afterwards: both columns present, nullable, no default; the accounts
-- table with RLS on; both functions SECURITY DEFINER and service_role-only; all four existing
-- connections byte-identical to the pre-apply snapshot; both new columns NULL on every row.
--
-- The grants this file's own comments describe as service-role only were tightened to match in
-- 20261123000002_buffer_accounts_grant_hardening.sql — CREATE TABLE here inherited Supabase's
-- default privileges for anon and authenticated, which RLS neutralised but which this file never
-- revoked.
--
-- Apply this BEFORE arming SOCIAL_BUFFER_AUTOPUBLISH_ENABLED and before adding a cron entry for
-- /api/cron/social-buffer-publish. The worker reads the two columns and the RPC below; without
-- them it answers `inert: no Buffer-routed destination` and does nothing, which is why the code
-- is safe to deploy ahead of this file.
--
-- ── WHAT IT ADDS, AND WHAT IT DELIBERATELY DOES NOT TOUCH ───────────────────────────────────
--   1. social_buffer_accounts         — one row per BUFFER ACCOUNT, holding one Vault secret
--   2. social_connections.buffer_account_id / buffer_channel_id — the per-destination mapping
--   3. sa_set_buffer_api_key(...)     — store/rotate a key; the raw key is a BIND PARAMETER
--   4. sa_get_buffer_destination(...) — the single read the worker uses
--
-- It writes NO DATA. No connection is pointed at a Buffer account here, so applying this changes
-- the behaviour of nothing: every existing destination keeps publishing exactly as it does today,
-- because `buffer_account_id is null` means "not Buffer-routed" everywhere in the code. Pointing a
-- destination at Buffer is a separate, visible statement — see the companion file for Lisette.
--
-- ── WHY THE CREDENTIAL UNIT IS A BUFFER ACCOUNT ────────────────────────────────────────────
-- Not per owner: social_connections.owner_user_id is ALWAYS the platform admin, so Jay owns
-- Lisette's rows too (agent_user_id records whose brand a destination carries). Keying the key on
-- owner would hand Jay's key to Lisette's channels — the requested separation, inverted.
--
-- Not per connection: Jay's two TikTok destinations live in ONE Buffer account and share ONE key.
-- Storing it twice means rotating it twice, and a rotation that updates one row and misses the
-- other leaves a destination authenticating with a dead key.
--
-- So: one row per Buffer account, one Vault secret per row, N destinations per row. Separation is
-- then structural — Lisette's channels point at a different row holding a different secret, and no
-- code path can reach across.

begin;

-- ── 1. THE BUFFER ACCOUNTS ─────────────────────────────────────────────────────────────────
create table if not exists public.social_buffer_accounts (
  id              uuid primary key default gen_random_uuid(),

  -- The platform admin who administers this Buffer account inside Social Beast. NOT "whose Buffer
  -- account it is" in the human sense: Lisette's Buffer account is administered here by Jay, and
  -- `label` is what records that it is hers.
  owner_user_id   uuid not null,

  -- Human name, shown in run reports and error messages. Safe to log. Never the key.
  label           text not null,

  -- Buffer's own organization id, so a channel mapping can be checked against the right account
  -- rather than assumed. Nullable: it is a convenience, not a key.
  organization_id text,

  -- The Vault secret holding the API key. NEVER a plaintext column, never returned to the browser,
  -- never logged. Read only by sa_get_buffer_destination below, which is service_role-only.
  key_secret_id   uuid,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.social_buffer_accounts.key_secret_id is
  'Supabase Vault secret id holding the ENCRYPTED Buffer API key. Read only by the service-role
   sa_get_buffer_destination function (server-side, for publishing). Never a plaintext token
   column, never returned to the browser, never logged.';

-- One label per owner, so "Lisette" cannot come to mean two different Buffer accounts.
create unique index if not exists social_buffer_accounts_owner_label_key
  on public.social_buffer_accounts (owner_user_id, lower(btrim(label)));

alter table public.social_buffer_accounts enable row level security;
-- SERVICE-ROLE ONLY, with no policies at all — the same stance social_autopilot_rules takes, and
-- for a stronger reason: this table points at a credential. The browser has no need to read it,
-- and an admin screen that wants to list Buffer accounts should go through a SECURITY DEFINER RPC
-- that returns the label and the channel counts, never the secret pointer.

-- ── 2. THE PER-DESTINATION MAPPING ─────────────────────────────────────────────────────────
-- BOTH COLUMNS OR NEITHER is the rule the code enforces (bufferRoutingFor): a row with an account
-- but no channel names an account with nothing to post to, and a row with a channel but no account
-- names a channel with no credential. Either alone reads as "not Buffer-routed", so the native
-- worker keeps the row and reports the real problem in language the operator already knows.
alter table public.social_connections
  add column if not exists buffer_account_id uuid references public.social_buffer_accounts(id) on delete restrict,
  add column if not exists buffer_channel_id text;

comment on column public.social_connections.buffer_channel_id is
  'Buffer''s own channel id for this destination. Together with buffer_account_id this makes the
   destination Buffer-routed: social-buffer-publish claims it and the native Instagram/TikTok
   workers skip it. Null (either column) means publish natively, exactly as before.';

-- ON DELETE RESTRICT, not CASCADE and not SET NULL, deliberately. Deleting a Buffer account that
-- destinations still point at must FAIL rather than silently re-route live accounts back to native
-- publishing — which, for a destination with no OAuth token of ours, means silently stopping it.

-- A Buffer channel backs exactly one destination. Without this, two rows could publish to the same
-- Buffer channel and one approved video would go out twice under two different market restrictions.
create unique index if not exists social_connections_buffer_channel_key
  on public.social_connections (buffer_channel_id)
  where buffer_channel_id is not null;

-- The worker's inert-check and its three queries all filter on these two columns.
create index if not exists social_connections_buffer_routed_idx
  on public.social_connections (buffer_account_id)
  where buffer_account_id is not null and buffer_channel_id is not null;

-- ── 3. STORE OR ROTATE A KEY ───────────────────────────────────────────────────────────────
-- The raw key arrives as a BIND PARAMETER (never inlined SQL, so it stays out of statement logs);
-- it goes straight to Vault and only the ciphertext plus a pointer persist. The same shape
-- sa_connect_instagram uses for an OAuth token.
--
-- Returns the account id and NOT the key. There is no function anywhere that returns a key to an
-- authenticated (non-service-role) caller.
--
-- ── WHY THE OWNER IS A PARAMETER AND NOT auth.uid() ─────────────────────────────────────────
-- An earlier draft of this function read `auth.uid()` and called `is_platform_admin()`, while
-- being granted to service_role ALONE. Those two decisions contradict each other and the function
-- could never have run: the service role has no session, so auth.uid() is NULL, so every call
-- would have raised 'no session' — and `authenticated`, the only role with a session, is revoked.
-- The key could not have been stored by anybody. Caught before it was applied.
--
-- The resolution follows the convention the rest of this schema already uses. A function granted
-- to `authenticated` reads auth.uid() and checks is_platform_admin() (sa_connect_instagram); a
-- function granted to service_role takes its identity explicitly and checks nothing, because the
-- service role IS the trusted caller (sa_update_instagram_token_by_connection has no such check).
-- This one belongs in the second group: the key is stored by an operator-run server-side script,
-- not by a browser session.
--
-- The platform-admin check is nevertheless KEPT, against the explicit parameter rather than the
-- session, because it is doing real work here: it is what stops a Buffer account — and therefore a
-- publishing credential — being created under a user id that has no business owning one. Verified
-- against platform_admins directly, since is_platform_admin() itself reads auth.uid().
create or replace function public.sa_set_buffer_api_key(
  p_owner_user_id uuid,
  p_account_id uuid,
  p_label      text,
  p_key        text,
  p_organization_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := p_owner_user_id;
  v_id         uuid := p_account_id;
  v_old_secret uuid;
  v_secret     uuid;
begin
  if v_uid is null then
    raise exception 'sa_set_buffer_api_key: p_owner_user_id is required';
  end if;
  if not exists (select 1 from public.platform_admins a where a.user_id = v_uid) then
    raise exception 'sa_set_buffer_api_key: % is not a platform admin', v_uid;
  end if;
  if coalesce(btrim(p_key), '') = '' then
    raise exception 'sa_set_buffer_api_key: empty key';
  end if;

  -- LOCK FIRST when rotating. Two overlapping rotations of the same account must serialise, or
  -- each orphans the other's secret and one of them wins the row with a secret the other deleted.
  -- The same hazard sa_update_instagram_token_by_connection documents.
  if v_id is not null then
    select a.key_secret_id into v_old_secret
      from public.social_buffer_accounts a
     where a.id = v_id and a.owner_user_id = v_uid
     for update;
    if not found then
      raise exception 'sa_set_buffer_api_key: no buffer account % for this owner', v_id;
    end if;
  end if;

  -- Microseconds in the name, like the Instagram connect path: two writes inside the same second
  -- must not collide on the Vault name uniqueness constraint.
  v_secret := vault.create_secret(
    btrim(p_key),
    'social:buffer:' || v_uid::text || ':' || coalesce(v_id::text, btrim(p_label)) || ':' ||
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'Buffer API key (Social Beast publishing route)'
  );

  if v_id is null then
    insert into public.social_buffer_accounts (owner_user_id, label, organization_id, key_secret_id)
    values (v_uid, btrim(p_label), nullif(btrim(coalesce(p_organization_id, '')), ''), v_secret)
    returning id into v_id;
  else
    update public.social_buffer_accounts
       set label           = coalesce(nullif(btrim(p_label), ''), label),
           organization_id = coalesce(nullif(btrim(coalesce(p_organization_id, '')), ''), organization_id),
           key_secret_id   = v_secret,
           updated_at      = now()
     where id = v_id;
  end if;

  -- Supersede the old secret only after the row points at the new one.
  if v_old_secret is not null then
    perform vault.delete_secret(v_old_secret);
  end if;

  return v_id;
end $$;

revoke all on function public.sa_set_buffer_api_key(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.sa_set_buffer_api_key(uuid, uuid, text, text, text) to service_role;

-- ── 4. THE ONE READ THE WORKER USES ────────────────────────────────────────────────────────
-- ROUTE-SCOPED BY CONSTRUCTION: the joins require both buffer_account_id and buffer_channel_id, so
-- a natively-published destination returns NO ROW even to a caller that asks for it by id. The
-- guard lives in the database, not only in the worker — the same stance
-- sa_get_instagram_token_by_connection takes by filtering on provider.
--
-- It returns the market restriction and the pause flag alongside the key so the worker reads ONE
-- row for all of them. Two reads could disagree about a row that changed in between, and the
-- restriction and the credential disagreeing is precisely the failure that would publish one
-- brand's video to another brand's audience.
create or replace function public.sa_get_buffer_destination(p_connection_id uuid)
returns table (
  api_key              text,
  buffer_channel_id    text,
  buffer_account_id    uuid,
  buffer_account_label text,
  provider             text,
  username             text,
  posting_paused       boolean,
  market_restriction   text[],
  owner_user_id        uuid,
  agent_user_id        uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select ds.decrypted_secret, sc.buffer_channel_id, ba.id, ba.label,
           sc.provider, sc.username, sc.posting_paused, sc.market_restriction,
           sc.owner_user_id, sc.agent_user_id
      from public.social_connections sc
      join public.social_buffer_accounts ba on ba.id = sc.buffer_account_id
      join vault.decrypted_secrets ds on ds.id = ba.key_secret_id
     where sc.id = p_connection_id
       and sc.buffer_channel_id is not null
     limit 1;
end $$;

revoke all on function public.sa_get_buffer_destination(uuid) from public, anon, authenticated;
grant execute on function public.sa_get_buffer_destination(uuid) to service_role;

commit;

-- ── VERIFY (read-only, run after) ──────────────────────────────────────────────────────────
-- 1. The columns exist and NOTHING is Buffer-routed yet:
--      select count(*) filter (where buffer_account_id is not null) as routed,
--             count(*)                                            as total
--        from public.social_connections;
--      -- expect: routed = 0, total = 4
--
-- 2. The route-scoping holds — an existing native destination resolves to nothing:
--      select count(*) from public.sa_get_buffer_destination(
--        (select id from public.social_connections where username = 'locatorbeast'));
--      -- expect: 0
--
-- 3. Neither function is reachable without the service role:
--      select has_function_privilege('authenticated', 'public.sa_get_buffer_destination(uuid)', 'execute');
--      -- expect: false
