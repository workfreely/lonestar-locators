-- Social Beast → TikTok connection (Sandbox, connection-only). Reuses the existing
-- provider-agnostic public.social_connections table (provider = 'tiktok') and the same
-- Vault-pointer pattern as Instagram: the OAuth tokens are NEVER stored in a plaintext
-- column. TikTok returns BOTH an access token (24h) and a refresh token (365d), so the
-- Vault secret holds a small JSON BUNDLE {access_token, refresh_token, refresh_expires_at}
-- and the row keeps only token_secret_id (the Vault pointer) + token_expires_at (the access
-- token expiry, for cheap "expired?" checks). Platform-admin only via the existing RLS
-- policy + is_platform_admin(), owner-scoped. NO publishing here.
--
-- One additive column (generic, provider-agnostic): avatar_url — the connected account's
-- profile image, displayed on the Accounts page. Nullable; no default; ignored by all
-- existing code paths. Idempotent so re-applying this migration is safe.
alter table public.social_connections add column if not exists avatar_url text;

-- ── Connect: encrypt the TikTok token bundle into Vault + upsert the row ─────────────────
-- The bundle arrives as an RPC BIND PARAMETER (never inlined SQL → stays out of statement
-- logs); it goes straight to Vault and only the ciphertext + pointer persist. Runs as the
-- authenticated admin (callback route); platform-admin enforced inside. Returns NON-SECRET
-- identity fields only.
--
-- p_avatar_url is the profile image already fetched via user.info.basic during the connect
-- flow (NO extra TikTok API call). The signature gained a trailing param, so we drop the
-- prior 5-arg definition first (CREATE OR REPLACE cannot change a function's arg list).
drop function if exists public.sa_connect_tiktok(text, text, text[], text, timestamptz);
create or replace function public.sa_connect_tiktok(
  p_open_id      text,        -- TikTok open_id (the stable per-app user id)
  p_username     text,        -- display_name / handle for the UI (identity, non-secret)
  p_scopes       text[],
  p_token_bundle text,        -- JSON: {"access_token","refresh_token","refresh_expires_at"}
  p_expires_at   timestamptz, -- access token expiry (now + expires_in)
  p_avatar_url   text default null  -- profile image (already fetched; no extra API call)
) returns table (id uuid, username text, status text, external_account_id text, token_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
-- external_account_id is both a RETURNS TABLE OUT column and a table column; without
-- this directive the ON CONFLICT (…, external_account_id) target is ambiguous (42702).
-- use_column resolves the bare name to the table column. Every other OUT-name reference
-- here is already table-qualified (sc.*) or in an unambiguous INSERT/SET context.
#variable_conflict use_column
declare
  v_uid        uuid := auth.uid();
  v_secret     uuid;
  v_old_secret uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_connect_tiktok: not a platform admin';
  end if;
  if v_uid is null then
    raise exception 'sa_connect_tiktok: no session';
  end if;

  select sc.token_secret_id into v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid and sc.provider = 'tiktok';

  v_secret := vault.create_secret(
    p_token_bundle,
    'social:tiktok:' || v_uid::text || ':' || coalesce(p_open_id, ''),
    'TikTok OAuth token bundle (Social Beast) — access + refresh'
  );

  insert into public.social_connections
    (owner_user_id, provider, external_account_id, username, avatar_url, account_type, status, scopes, token_secret_id, token_expires_at, updated_at)
  values
    (v_uid, 'tiktok', p_open_id, p_username, p_avatar_url, null, 'connected', p_scopes, v_secret, p_expires_at, now())
  -- Conflict target must match the live UNIQUE constraint on social_connections,
  -- which is (owner_user_id, provider, external_account_id) — the table is
  -- multi-account. open_id is the stable per-app external id, so reconnecting the
  -- SAME TikTok account upserts in place. (A 2-col target raises 42P10.)
  on conflict (owner_user_id, provider, external_account_id) do update
    set username            = excluded.username,
        avatar_url          = excluded.avatar_url,
        status              = 'connected',
        scopes              = excluded.scopes,
        token_secret_id     = excluded.token_secret_id,
        token_expires_at    = excluded.token_expires_at,
        updated_at          = now();

  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  return query
    select sc.id, sc.username, sc.status, sc.external_account_id, sc.token_expires_at
      from public.social_connections sc
     where sc.owner_user_id = v_uid and sc.provider = 'tiktok';
end $$;

grant execute on function public.sa_connect_tiktok(text, text, text[], text, timestamptz, text) to authenticated;

-- ── Disconnect: delete the Vault secret + the row (admin-scoped) ─────────────
create or replace function public.sa_disconnect_tiktok()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_secret uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_disconnect_tiktok: not a platform admin';
  end if;
  select sc.token_secret_id into v_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid and sc.provider = 'tiktok';
  if v_secret is not null then
    begin delete from vault.secrets where id = v_secret; exception when others then null; end;
  end if;
  delete from public.social_connections where owner_user_id = v_uid and provider = 'tiktok';
end $$;

grant execute on function public.sa_disconnect_tiktok() to authenticated;

-- ── Token-lifecycle FOUNDATION (server-side only; NOT granted to authenticated) ──
-- Let a future, server-only refresh/publish job read + rotate the TikTok token bundle via
-- the service role. NOT callable from a browser session, so the token never reaches the
-- client. No route/cron wires these in this connection-only checkpoint.
create or replace function public.sa_get_tiktok_token(p_owner uuid)
returns table (token_bundle text, token_expires_at timestamptz, external_account_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select ds.decrypted_secret, sc.token_expires_at, sc.external_account_id
      from public.social_connections sc
      join vault.decrypted_secrets ds on ds.id = sc.token_secret_id
     where sc.owner_user_id = p_owner and sc.provider = 'tiktok'
     limit 1;
end $$;

revoke all on function public.sa_get_tiktok_token(uuid) from public, anon, authenticated;
grant execute on function public.sa_get_tiktok_token(uuid) to service_role;

create or replace function public.sa_update_tiktok_token(p_owner uuid, p_token_bundle text, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret     uuid;
  v_old_secret uuid;
begin
  select sc.token_secret_id into v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = p_owner and sc.provider = 'tiktok';
  if v_old_secret is null then
    raise exception 'sa_update_tiktok_token: no connection';
  end if;
  v_secret := vault.create_secret(p_token_bundle, 'social:tiktok:' || p_owner::text || ':refresh:' || extract(epoch from now())::bigint::text, 'TikTok refreshed token bundle');
  update public.social_connections
     set token_secret_id = v_secret, token_expires_at = p_expires_at, status = 'connected', updated_at = now()
   where owner_user_id = p_owner and provider = 'tiktok';
  begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
end $$;

revoke all on function public.sa_update_tiktok_token(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sa_update_tiktok_token(uuid, text, timestamptz) to service_role;
