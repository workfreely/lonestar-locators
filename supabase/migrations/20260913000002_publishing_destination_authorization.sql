-- Beast Social — Publishing Destination AUTHORIZATION + MANAGEMENT.
--
-- Builds on 20260913000001 (multi-destination foundation). Adds:
--   1. A global partial-unique index so any one Instagram account belongs to at most ONE
--      Beast Social owner (prevents a destination being claimed under two owners).
--   2. social_destination_invitations — single-use, hashed, short-lived, revocable, owner-bound
--      invitation records. The RAW token NEVER touches the database (only its SHA-256 hash is
--      stored). RLS is owner-scoped so a recipient (who has no session at all) can never read it.
--   3. Connection-ID-scoped management RPCs (pause / resume / disconnect / relabel / cadence),
--      each verifying the connection belongs to the authenticated platform-admin owner, so one
--      destination can never affect another. Disconnect revokes ONLY that destination's Vault token.
--   4. Public (service-role) validate + consume RPCs for the unauthenticated recipient OAuth
--      flow: they take the invitation owner from the invite ROW (never auth.uid()), create the
--      destination under that owner, and atomically consume the invite so it cannot be replayed.
--
-- RLS on social_connections / social_content / social_posts is UNCHANGED. No publishing worker.

-- ── 1. Global uniqueness of a real external account across owners ────────────────────────────
-- The foundation set unique (owner_user_id, provider, external_account_id). This ADD-ON says a
-- given (provider, external_account_id) may exist only once overall — so a single Instagram
-- account cannot be authorized as a destination under two different owners. Partial (only when
-- external_account_id is present) so placeholder/null rows are unaffected. Production currently
-- has exactly one Instagram row and no duplicates, so this applies cleanly.
create unique index if not exists social_connections_provider_account_global_key
  on public.social_connections (provider, external_account_id)
  where external_account_id is not null;

-- ── 2. Invitation records (hashed secret; owner-bound; single-use; revocable; short-lived) ───
create table if not exists public.social_destination_invitations (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null,                    -- the Beast Social admin who created it
  provider              text not null default 'instagram',
  token_hash            text not null unique,             -- SHA-256 hex of the secret; RAW token never stored
  label                 text,                             -- friendly label pre-assigned to the destination
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,             -- short-lived
  used_at               timestamptz,                      -- set once, atomically, on successful authorization
  revoked_at            timestamptz,                      -- set if the admin revokes before use
  consumed_connection_id uuid references public.social_connections(id) on delete set null
);

comment on table public.social_destination_invitations is
  'Single-use Instagram destination-authorization invitations. Stores ONLY the SHA-256 hash of the
   secret token (never the raw token, never the recipient identity). Owner-scoped RLS. Consumed
   atomically by sa_consume_destination_invitation (service-role) during the recipient OAuth
   callback; the created destination lives under owner_user_id. Recipients get NO Supabase session.';

create index if not exists social_destination_invitations_owner_idx
  on public.social_destination_invitations (owner_user_id);

alter table public.social_destination_invitations enable row level security;

-- Owner-scoped: only the platform-admin who created an invitation can read/manage it. The
-- recipient never uses RLS (no session) — the public flow goes through service-role RPCs below.
drop policy if exists "platform admin owns destination invitations" on public.social_destination_invitations;
create policy "platform admin owns destination invitations" on public.social_destination_invitations
  for all
  using (public.is_platform_admin() and owner_user_id = auth.uid())
  with check (public.is_platform_admin() and owner_user_id = auth.uid());

-- ── 2a. Create an invitation (platform-admin only; owner = caller) ───────────────────────────
-- The route generates a cryptographically strong token, hashes it (SHA-256), and passes ONLY the
-- hash here. Returns the new invitation id (non-secret) for building the admin's copyable link.
create or replace function public.sa_create_destination_invitation(
  p_token_hash text,
  p_label      text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_create_destination_invitation: not a platform admin';
  end if;
  if v_uid is null then
    raise exception 'sa_create_destination_invitation: no session';
  end if;
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'sa_create_destination_invitation: bad token hash';
  end if;

  insert into public.social_destination_invitations (owner_user_id, provider, token_hash, label, expires_at)
  values (v_uid, 'instagram', p_token_hash, nullif(btrim(p_label), ''), coalesce(p_expires_at, now() + interval '7 days'))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.sa_create_destination_invitation(text, text, timestamptz) from public, anon;
grant execute on function public.sa_create_destination_invitation(text, text, timestamptz) to authenticated;

-- ── 2b. Revoke an invitation before use (platform-admin, owner-scoped) ───────────────────────
create or replace function public.sa_revoke_destination_invitation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hit int;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_revoke_destination_invitation: not a platform admin';
  end if;
  update public.social_destination_invitations
     set revoked_at = now()
   where id = p_id
     and owner_user_id = v_uid       -- ownership enforced
     and used_at is null             -- can't revoke an already-consumed invite
     and revoked_at is null;
  get diagnostics v_hit = row_count;
  return v_hit > 0;
end $$;

revoke all on function public.sa_revoke_destination_invitation(uuid) from public, anon;
grant execute on function public.sa_revoke_destination_invitation(uuid) to authenticated;

-- ── 2c. Validate an invitation by token hash WITHOUT consuming (public flow, service-role) ───
-- Returns a coarse status + the label only. NEVER returns the owner id, token, or any Vault data.
create or replace function public.sa_validate_destination_invitation(p_token_hash text)
returns table (status text, label text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.social_destination_invitations%rowtype;
begin
  select * into r from public.social_destination_invitations where token_hash = p_token_hash;
  if not found then
    return query select 'invalid'::text, null::text; return;
  end if;
  if r.revoked_at is not null then
    return query select 'revoked'::text, r.label; return;
  end if;
  if r.used_at is not null then
    return query select 'used'::text, r.label; return;
  end if;
  if r.expires_at <= now() then
    return query select 'expired'::text, r.label; return;
  end if;
  return query select 'valid'::text, r.label;
end $$;

revoke all on function public.sa_validate_destination_invitation(text) from public, anon, authenticated;
grant execute on function public.sa_validate_destination_invitation(text) to service_role;

-- ── 2d. Consume an invitation ATOMICALLY and create/update the destination (public flow) ─────
-- Runs as service-role during the recipient OAuth callback (there is NO user session). The owner
-- comes ENTIRELY from the invite row (never auth.uid()). Locks the invite row FOR UPDATE and
-- re-checks valid/unexpired/unused/unrevoked inside the same transaction, so a replayed callback
-- cannot create a second connection. Stores the token in Vault; the raw token is a bind param and
-- is never logged/returned. Returns only safe status fields.
create or replace function public.sa_consume_destination_invitation(
  p_token_hash         text,
  p_external_account_id text,
  p_username           text,
  p_account_type       text,
  p_scopes             text[],
  p_token              text,
  p_expires_at         timestamptz
) returns table (status text, connection_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  r            public.social_destination_invitations%rowtype;
  v_owner      uuid;
  v_existing   uuid;
  v_old_secret uuid;
  v_secret     uuid;
  v_conn       uuid;
  v_other      uuid;
begin
  -- Lock the invite so concurrent/replayed callbacks serialize on it.
  select * into r
    from public.social_destination_invitations
   where token_hash = p_token_hash
     for update;

  if not found then
    return query select 'invalid'::text, null::uuid; return;
  end if;
  if r.revoked_at is not null then
    return query select 'revoked'::text, null::uuid; return;
  end if;
  if r.used_at is not null then
    return query select 'used'::text, null::uuid; return;   -- replay / already consumed
  end if;
  if r.expires_at <= now() then
    return query select 'expired'::text, null::uuid; return;
  end if;
  if p_external_account_id is null or btrim(p_external_account_id) = '' then
    return query select 'no_account'::text, null::uuid; return;
  end if;

  v_owner := r.owner_user_id;

  -- Global-uniqueness guard: if this Instagram account is already a destination under a DIFFERENT
  -- owner, refuse (matches the partial-unique index; surfaced as a clean status, not a raw error).
  select sc.id into v_other
    from public.social_connections sc
   where sc.provider = 'instagram'
     and sc.external_account_id = p_external_account_id
     and sc.owner_user_id <> v_owner
   limit 1;
  if v_other is not null then
    return query select 'account_taken'::text, null::uuid; return;
  end if;

  -- Does the invite owner already hold this destination? Then re-authorize (rotate token) in place.
  select sc.id, sc.token_secret_id into v_existing, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_owner
     and sc.provider = 'instagram'
     and sc.external_account_id is not distinct from p_external_account_id;

  -- Vault enforces a UNIQUE secret name, and the old secret is deleted only AFTER the new one is
  -- created (so a failed create never loses the working token). A deterministic name would collide
  -- on re-authorization, so the name carries a clock suffix to stay unique across rotations.
  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || v_owner::text || ':' || p_external_account_id || ':' || extract(epoch from clock_timestamp())::bigint::text,
    'Instagram long-lived access token (Beast Social destination)'
  );

  if v_existing is not null then
    update public.social_connections
       set username         = p_username,
           account_type     = p_account_type,
           status           = 'connected',
           scopes           = p_scopes,
           token_secret_id  = v_secret,
           token_expires_at = p_expires_at,
           label            = coalesce(label, r.label),
           updated_at       = now()
     where id = v_existing;
    v_conn := v_existing;
  else
    insert into public.social_connections
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes,
       token_secret_id, token_expires_at, label, updated_at)
    values
      (v_owner, 'instagram', p_external_account_id, p_username, p_account_type, 'connected', p_scopes,
       v_secret, p_expires_at, r.label, now())
    returning id into v_conn;
  end if;

  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  -- Consume: single-use. Because we hold the row lock and checked used_at is null above, this is
  -- the ONE successful consumption; any replay hits the used_at guard and gets 'used'.
  update public.social_destination_invitations
     set used_at = now(), consumed_connection_id = v_conn
   where id = r.id;

  return query select 'connected'::text, v_conn;
end $$;

revoke all on function public.sa_consume_destination_invitation(text, text, text, text, text[], text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sa_consume_destination_invitation(text, text, text, text, text[], text, timestamptz)
  to service_role;

-- ── 3. Connection-ID-scoped management (platform-admin, ownership-verified) ──────────────────
-- Every function verifies the target connection belongs to the caller, so operating on one
-- destination can NEVER affect another. Replaces the (owner, provider) assumption of
-- sa_disconnect_instagram() for the multi-destination world.

-- Shared guard helper: raises unless the caller is a platform admin who owns p_connection_id.
create or replace function public._sa_require_owned_connection(p_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin';
  end if;
  if v_uid is null then
    raise exception 'no session';
  end if;
  select owner_user_id into v_owner from public.social_connections where id = p_connection_id;
  if v_owner is null then
    raise exception 'connection not found';
  end if;
  if v_owner <> v_uid then
    raise exception 'not the owner of this connection';
  end if;
  return v_uid;
end $$;
revoke all on function public._sa_require_owned_connection(uuid) from public, anon, authenticated;
-- (Not granted to authenticated — only called internally by the SECURITY DEFINER functions below.)

create or replace function public.sa_pause_destination(p_connection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._sa_require_owned_connection(p_connection_id);
begin
  update public.social_connections set posting_paused = true, updated_at = now()
   where id = p_connection_id and owner_user_id = v_uid;
end $$;
grant execute on function public.sa_pause_destination(uuid) to authenticated;

create or replace function public.sa_resume_destination(p_connection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._sa_require_owned_connection(p_connection_id);
begin
  update public.social_connections set posting_paused = false, updated_at = now()
   where id = p_connection_id and owner_user_id = v_uid;
end $$;
grant execute on function public.sa_resume_destination(uuid) to authenticated;

create or replace function public.sa_update_destination_label(p_connection_id uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._sa_require_owned_connection(p_connection_id);
begin
  update public.social_connections set label = nullif(btrim(p_label), ''), updated_at = now()
   where id = p_connection_id and owner_user_id = v_uid;
end $$;
grant execute on function public.sa_update_destination_label(uuid, text) to authenticated;

create or replace function public.sa_update_destination_cadence(
  p_connection_id uuid, p_posts_per_day integer, p_stagger_offset_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._sa_require_owned_connection(p_connection_id);
begin
  update public.social_connections
     set posts_per_day = case when p_posts_per_day is null then posts_per_day
                              when p_posts_per_day between 0 and 48 then p_posts_per_day
                              else posts_per_day end,
         stagger_offset_minutes = case when p_stagger_offset_minutes is null then stagger_offset_minutes
                                       when p_stagger_offset_minutes between 0 and 1440 then p_stagger_offset_minutes
                                       else stagger_offset_minutes end,
         updated_at = now()
   where id = p_connection_id and owner_user_id = v_uid;
end $$;
grant execute on function public.sa_update_destination_cadence(uuid, integer, integer) to authenticated;

-- Disconnect ONE destination by id: revoke ONLY that destination's Vault secret, then delete only
-- that row. Never touches any other destination. Ownership verified.
create or replace function public.sa_disconnect_destination(p_connection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := public._sa_require_owned_connection(p_connection_id);
  v_secret uuid;
begin
  select token_secret_id into v_secret
    from public.social_connections
   where id = p_connection_id and owner_user_id = v_uid;
  if v_secret is not null then
    begin delete from vault.secrets where id = v_secret; exception when others then null; end;
  end if;
  delete from public.social_connections where id = p_connection_id and owner_user_id = v_uid;
end $$;
grant execute on function public.sa_disconnect_destination(uuid) to authenticated;
