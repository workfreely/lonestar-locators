-- Social Beast — TIKTOK TOKEN LIFECYCLE, PER CONNECTION.
--
-- Instagram has been connection-scoped since 20260913000002: every destination is addressed by its
-- own connection id, and sa_get_instagram_token_by_connection reads exactly one row. TikTok was
-- written when one owner meant one TikTok account, so its whole lifecycle is scoped by
-- (owner_user_id, provider = 'tiktok'). With a SECOND TikTok account that scoping is not merely
-- ambiguous — it is destructive. The four live defects, each verified against the production
-- catalog before this migration was written:
--
--   1. sa_connect_tiktok looked up "the previous Vault secret" by owner+provider with NO account
--      filter, then deleted it after inserting the new row. Connecting a SECOND account therefore
--      deleted the FIRST account's secret. The first row survived with a dangling token_secret_id,
--      so it still read "connected" while every token read returned nothing.
--
--   2. sa_update_tiktok_token rotated with UPDATE ... WHERE owner AND provider, so one refresh
--      pointed BOTH rows at ONE Vault secret. Both destinations would then publish as whichever
--      account refreshed — a cross-brand publish, which no market restriction can catch because it
--      corrupts the IDENTITY rather than the market.
--
--   3. sa_disconnect_tiktok() deleted one secret and then every TikTok row for the owner.
--
--   4. sa_get_tiktok_token ended in an UNORDERED `limit 1`, so it returned an arbitrary account —
--      silently wrong rather than loudly broken.
--
-- ── WHAT THIS DOES, AND DELIBERATELY DOES NOT DO ────────────────────────────────────────────
-- ADDS two connection-scoped functions mirroring the proven Instagram pair, and REPAIRS the three
-- owner-scoped ones in place. No signature changes, so nothing that calls them today breaks. No
-- table, column, index, constraint, RLS policy or grant is touched. No row is written. The OAuth
-- flow is untouched: sa_connect_tiktok keeps its parameters, its security model, its ON CONFLICT
-- target and its create-before-delete ordering — only the SCOPE of the secret lookup changes.
--
-- Nothing here is Instagram's, and nothing here reads or writes a post.

-- ── ORDERING NOTE ───────────────────────────────────────────────────────────────────────────
-- The three RETURNS TABLE functions are defined before the three `returns void` ones. That is not
-- cosmetic: scripts/social/sqlAmbiguity.test.ts scans migrations for a RETURNS TABLE out-column
-- referenced unqualified in a WHERE clause — the defect that broke every Instagram reconnect for a
-- month — and its matcher pairs a function NAME with the next `returns table` it can find. A void
-- function sitting in front of a table function is therefore attributed the table function's body,
-- and sa_connect_tiktok's deliberately-unfixed vault cleanup (tracked in that test's allow-list as
-- out of scope) gets reported against whichever void function precedes it. Defining the readers
-- first keeps every function paired with its own signature. The matcher's lazy gap is the real
-- weakness and is worth tightening, but not in a migration about TikTok tokens.

-- ── 1. READ one TikTok destination's token bundle, by connection ────────────────────────────
-- Column-for-column the same shape as sa_get_instagram_token_by_connection, so the publish worker
-- handles both providers identically rather than carrying two row shapes.
--
-- No ownership check, exactly like its Instagram sibling: it is service_role ONLY and the caller is
-- server-side code behind CRON_SECRET. An ownership argument here would be a parameter the worker
-- would have to supply from the same row it is already trusting.
create or replace function public.sa_get_tiktok_token_by_connection(p_connection_id uuid)
returns table (
  token_bundle        text,
  token_expires_at    timestamptz,
  external_account_id text,
  username            text,
  status              text,
  posting_paused      boolean,
  owner_user_id       uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select ds.decrypted_secret, sc.token_expires_at, sc.external_account_id, sc.username,
           sc.status, sc.posting_paused, sc.owner_user_id
      from public.social_connections sc
      join vault.decrypted_secrets ds on ds.id = sc.token_secret_id
     where sc.id = p_connection_id and sc.provider = 'tiktok'
     limit 1;
end $$;

revoke all on function public.sa_get_tiktok_token_by_connection(uuid) from public, anon, authenticated;
grant execute on function public.sa_get_tiktok_token_by_connection(uuid) to service_role;

-- ── 2. REPAIR sa_connect_tiktok: the old secret belongs to THIS account ─────────────────────
-- Defect 1. The ONLY change is `and sc.external_account_id is not distinct from p_open_id` on the
-- lookup, and the same filter on the row returned. Everything else — the signature, the
-- platform-admin check, auth.uid(), the unique secret name from 20261013000001, the ON CONFLICT
-- target verified against social_connections_owner_provider_account_key, and the create-then-delete
-- ordering — is carried over unchanged.
--
-- `is not distinct from` rather than `=` so a null open_id still matches its own placeholder row
-- rather than matching nothing and leaving a secret behind.
create or replace function public.sa_connect_tiktok(
  p_open_id      text,
  p_username     text,
  p_scopes       text[],
  p_token_bundle text,
  p_expires_at   timestamptz,
  p_avatar_url   text default null
) returns table (id uuid, username text, status text, external_account_id text, token_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
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

  -- THIS ACCOUNT'S previous secret, never "some TikTok secret of this owner's".
  select sc.token_secret_id into v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid
     and sc.provider = 'tiktok'
     and sc.external_account_id is not distinct from p_open_id;

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

  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  -- Only the account that was just authorized. The previous version returned every TikTok row the
  -- owner had, so the callback would have read an arbitrary one as "the account you connected".
  return query
    select sc.id, sc.username, sc.status, sc.external_account_id, sc.token_expires_at
      from public.social_connections sc
     where sc.owner_user_id = v_uid
       and sc.provider = 'tiktok'
       and sc.external_account_id is not distinct from p_open_id;
end $$;

grant execute on function public.sa_connect_tiktok(text, text, text[], text, timestamptz, text) to authenticated;

-- ── 3. REPAIR the owner-scoped READ: refuse rather than guess ──────────────────────────────
-- These are now BACKSTOPS. Application code resolves a connection id and calls the per-connection
-- functions above, so nothing we ship reaches these with two accounts connected. They are repaired
-- anyway, because "nothing calls it" is a property of today's code and these are reachable from the
-- SQL editor, from a stale deploy, and from any future caller that reaches for the obvious name.
--
-- The rule throughout: with more than one TikTok connection, an owner-scoped answer does not exist.
-- A read returns NO ROWS (the caller already handles "not connected") and a WRITE raises, because a
-- write that silently touched the wrong account is the failure this whole migration is about.

create or replace function public.sa_get_tiktok_token(p_owner uuid)
returns table (token_bundle text, token_expires_at timestamptz, external_account_id text)
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  select count(*) into v_n
    from public.social_connections
   where owner_user_id = p_owner and provider = 'tiktok';
  -- AMBIGUOUS: return nothing. Every caller reads an empty result as "not connected" and surfaces
  -- a 409, which is the safe answer. The previous unordered `limit 1` returned an arbitrary
  -- account's credentials instead.
  if v_n > 1 then
    return;
  end if;
  return query
    select ds.decrypted_secret, sc.token_expires_at, sc.external_account_id
      from public.social_connections sc
      join vault.decrypted_secrets ds on ds.id = sc.token_secret_id
     where sc.owner_user_id = p_owner and sc.provider = 'tiktok'
     order by sc.created_at                      -- deterministic even in the single-row case
     limit 1;
end $$;

revoke all on function public.sa_get_tiktok_token(uuid) from public, anon, authenticated;
grant execute on function public.sa_get_tiktok_token(uuid) to service_role;

-- ── 4. ROTATE one TikTok destination's token bundle, by connection ──────────────────────────
-- THE CONCURRENCY FIX IS THE `for update`, and it is the point of this function existing rather
-- than a WHERE-clause change to the old one.
--
-- Two refreshes of the same connection can overlap: the publish worker and a request-time route
-- both resolve a token within the same second, both see it expiring, and both refresh. Without the
-- lock each reads the same v_old_secret, each creates a new secret, each updates the row (last
-- write wins), and each tries to delete the one they read — leaving the other's new secret
-- orphaned in Vault and one refresh silently discarded. With the row locked, the second call waits,
-- re-reads the secret the FIRST call just stored, and supersedes exactly that one. No orphan, and
-- no possibility of deleting a secret another connection is using.
--
-- The secret NAME carries the connection id and a microsecond stamp. vault.secrets.name is UNIQUE
-- (secrets_name_idx), and the owner-scoped version named secrets 'social:tiktok:<owner>:refresh:
-- <epoch seconds>' — two connections of one owner refreshing inside the same second would have
-- collided on 23505, which is the identical class of bug 20261013000001 fixed on the connect path.
--
-- CREATE BEFORE DELETE, like every other token path here: a failure part-way through leaves the
-- connection with a working token rather than none.
create or replace function public.sa_update_tiktok_token_by_connection(
  p_connection_id uuid,
  p_token_bundle  text,
  p_expires_at    timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_secret uuid;
  v_secret     uuid;
  v_found      boolean := false;
begin
  select sc.token_secret_id, true into v_old_secret, v_found
    from public.social_connections sc
   where sc.id = p_connection_id and sc.provider = 'tiktok'
     for update;                       -- serialises concurrent refreshes of THIS connection

  if not v_found then
    raise exception 'sa_update_tiktok_token_by_connection: no tiktok connection %', p_connection_id;
  end if;

  v_secret := vault.create_secret(
    p_token_bundle,
    'social:tiktok:conn:' || p_connection_id::text || ':'
      || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'TikTok refreshed token bundle (Social Beast, per destination)'
  );

  update public.social_connections
     set token_secret_id = v_secret, token_expires_at = p_expires_at,
         status = 'connected', updated_at = now()
   where id = p_connection_id;         -- ONE row, by id. Never owner+provider.

  -- Only the secret this call superseded, and only if it is not the one just stored.
  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;
end $$;

revoke all on function public.sa_update_tiktok_token_by_connection(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sa_update_tiktok_token_by_connection(uuid, text, timestamptz) to service_role;

-- ── 5. REPAIR the owner-scoped WRITES: raise rather than touch two rows ────────────────────
create or replace function public.sa_update_tiktok_token(p_owner uuid, p_token_bundle text, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret     uuid;
  v_old_secret uuid;
  v_n          int;
  v_conn       uuid;
begin
  select count(*) into v_n
    from public.social_connections
   where owner_user_id = p_owner and provider = 'tiktok';
  if v_n > 1 then
    raise exception 'sa_update_tiktok_token: % tiktok connections for this owner — use sa_update_tiktok_token_by_connection', v_n;
  end if;

  select sc.id, sc.token_secret_id into v_conn, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = p_owner and sc.provider = 'tiktok'
     for update;
  if v_conn is null then
    raise exception 'sa_update_tiktok_token: no connection';
  end if;

  v_secret := vault.create_secret(
    p_token_bundle,
    'social:tiktok:' || p_owner::text || ':refresh:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'TikTok refreshed token bundle');
  update public.social_connections
     set token_secret_id = v_secret, token_expires_at = p_expires_at, status = 'connected', updated_at = now()
   where id = v_conn;                 -- by id, even here
  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;
end $$;

revoke all on function public.sa_update_tiktok_token(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sa_update_tiktok_token(uuid, text, timestamptz) to service_role;

create or replace function public.sa_disconnect_tiktok()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_secret uuid;
  v_n      int;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_disconnect_tiktok: not a platform admin';
  end if;
  select count(*) into v_n
    from public.social_connections
   where owner_user_id = v_uid and provider = 'tiktok';
  -- The old body deleted EVERY TikTok row for the owner and only one of their Vault secrets.
  -- sa_disconnect_destination(p_connection_id) already does this correctly for one destination, so
  -- the fix is to refuse and name it rather than to re-implement it here.
  if v_n > 1 then
    raise exception 'sa_disconnect_tiktok: % tiktok connections — use sa_disconnect_destination(connection_id) to remove one', v_n;
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
