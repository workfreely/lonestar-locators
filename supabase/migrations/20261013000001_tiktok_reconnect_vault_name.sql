-- TikTok RECONNECT — the Vault secret name must be unique per connect, not per account.
--
-- THE DEFECT. sa_connect_tiktok built the Vault secret name deterministically from the
-- account identity:
--
--     'social:tiktok:' || v_uid || ':' || coalesce(p_open_id, '')
--
-- and called vault.create_secret BEFORE deleting the previous secret. vault.secrets.name
-- carries a UNIQUE index (secrets_name_idx), so the FIRST connect succeeded and every
-- RECONNECT of the same account raised 23505 duplicate key value violates unique
-- constraint "secrets_name_idx". The exception propagated out of the RPC, the OAuth
-- callback's `if (error)` branch fired, and the user was redirected to ?error=store —
-- "Connected but couldn't save the connection." The tokens had been exchanged
-- successfully; only the persistence step failed, every single time, for ever.
--
-- Reproduced against production before fixing: calling vault.create_secret with the
-- existing name raised exactly 23505 / secrets_name_idx.
--
-- THE FIX, and why this shape. Append a high-resolution timestamp so each connect mints a
-- distinct name. This is the SAME pattern sa_update_tiktok_token already uses in the
-- original migration (':refresh:' || epoch) — evidence the author knew names must be
-- unique and simply missed it on the connect path. clock_timestamp() rather than now(),
-- so two calls inside one transaction still differ, with microsecond precision (US) so
-- two reconnects in the same second cannot collide either.
--
-- The CREATE-then-DELETE ordering is deliberately preserved: the new secret is written
-- before the old one is removed, so a failure part-way through can never leave the
-- connection without a usable token. The delete of the previous secret already runs
-- afterwards and is unchanged, so names do not accumulate.
--
-- NOTHING ELSE CHANGES. Same signature, same security model (security definer +
-- is_platform_admin + auth.uid()), same ON CONFLICT target — which was verified against
-- the live constraint social_connections_owner_provider_account_key
-- (owner_user_id, provider, external_account_id), so reconnecting the SAME TikTok account
-- still UPSERTS the existing row in place and cannot create a duplicate. No table, column,
-- index, constraint or grant is touched. Instagram is untouched. Reversible by re-applying
-- the previous definition from 20260921000000_tiktok_connection.sql.

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
