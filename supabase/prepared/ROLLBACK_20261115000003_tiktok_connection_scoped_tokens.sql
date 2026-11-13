-- ROLLBACK 20261115000003_tiktok_connection_scoped_tokens.
--
-- ⚠ THIS RESTORES THE DEFECTS THE MIGRATION FIXED. Read this before running it.
--
-- The release repaired four functions whose scoping is (owner_user_id, provider = 'tiktok'). That
-- scoping is harmless with ONE TikTok account and destructive with two:
--
--   sa_connect_tiktok       deletes the OTHER account's Vault secret when a second account is
--                           authorized, leaving a row that still reads "connected" over a dangling
--                           token_secret_id
--   sa_update_tiktok_token  points BOTH rows at ONE secret on the next refresh, so both
--                           destinations publish as whichever account refreshed
--   sa_disconnect_tiktok    deletes EVERY TikTok row for the owner and revokes one secret
--   sa_get_tiktok_token     returns an arbitrary account via an unordered `limit 1`
--
-- ── DO NOT RUN THIS IF A SECOND TIKTOK ACCOUNT IS CONNECTED ─────────────────────────────────
-- Check first, and stop if this returns more than one row:
--
--   select id, username, created_at from public.social_connections where provider = 'tiktok';
--
-- With two rows connected, rolling back re-arms the secret deletion on the next reconnect and the
-- both-rows rewrite on the next refresh — within 24 hours, because TikTok access tokens are
-- 24-hour. If you must roll the code back with two accounts connected, DISCONNECT one first
-- (through sa_disconnect_destination, which is connection-scoped and is NOT part of this release)
-- and leave a single account, or leave these functions in place: they are strictly safer than
-- their predecessors even with the new code gone.
--
-- ── ORDER: ROLL THE CODE BACK FIRST ─────────────────────────────────────────────────────────
-- The deployed code calls sa_get_tiktok_token_by_connection and
-- sa_update_tiktok_token_by_connection. Drop them while that code is live and every TikTok token
-- read returns null: the worker leaves posts scheduled and the manual panel returns 409. Inert, not
-- wrong — nothing publishes to the wrong account — but TikTok publishing stops. So redeploy the
-- previous build, THEN run this.
--
-- Nothing below touches a token, a Vault secret, a connection row, Instagram, or any destination
-- RPC outside the four this release repaired. No data is written.

-- ── 1. Drop the two connection-scoped functions this release added ──────────────────────────
drop function if exists public.sa_get_tiktok_token_by_connection(uuid);
drop function if exists public.sa_update_tiktok_token_by_connection(uuid, text, timestamptz);

-- ── 2. Restore sa_connect_tiktok as 20261013000001 left it ──────────────────────────────────
-- NOTE: its old-secret lookup is owner+provider with NO account filter. That is the defect.

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

  -- UNIQUE PER CONNECT. The trailing clock_timestamp() stamp is the fix: the previous
  -- name was identity-only, so every reconnect collided with secrets_name_idx.
  v_secret := vault.create_secret(
    p_token_bundle,
    'social:tiktok:' || v_uid::text || ':' || coalesce(p_open_id, '')
      || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'TikTok OAuth token bundle (Social Beast) — access + refresh'
  );

  insert into public.social_connections
    (owner_user_id, provider, external_account_id, username, avatar_url, account_type, status, scopes, token_secret_id, token_expires_at, updated_at)
  values
    (v_uid, 'tiktok', p_open_id, p_username, p_avatar_url, null, 'connected', p_scopes, v_secret, p_expires_at, now())
  on conflict (owner_user_id, provider, external_account_id) do update
    set username            = excluded.username,
        avatar_url          = excluded.avatar_url,
        status              = 'connected',
        scopes              = excluded.scopes,
        token_secret_id     = excluded.token_secret_id,
        token_expires_at    = excluded.token_expires_at,
        updated_at          = now();

  -- Unchanged: the superseded secret is removed only after the new one is safely stored.
  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  return query
    select sc.id, sc.username, sc.status, sc.external_account_id, sc.token_expires_at
      from public.social_connections sc
     where sc.owner_user_id = v_uid and sc.provider = 'tiktok';
end $$;

grant execute on function public.sa_connect_tiktok(text, text, text[], text, timestamptz, text) to authenticated;

-- ── 3. Restore the three owner-scoped functions as 20260921000000 left them ─────────────────
-- NOTE: no ambiguity guards. The read picks arbitrarily; the write and the disconnect touch every
-- TikTok row the owner has.

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

-- ── VERIFY THE ROLLBACK ─────────────────────────────────────────────────────────────────────
-- Re-run 20261115000003_tiktok_connection_scoped_tokens.verify.sql. Row 1 must report
-- "NOT YET APPLIED", rows 2-7 must FAIL (that is the pre-apply state restored), and rows 8-9 must
-- still PASS — every TikTok connection still points at a live Vault secret, and Instagram's token
-- path is untouched. Row 8 failing after a rollback means a secret was lost; the connection must be
-- re-authorized.
