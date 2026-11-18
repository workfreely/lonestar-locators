-- INSTAGRAM TOKENS, SCOPED TO ONE CONNECTION — the counterpart TikTok already has.
--
-- ── THE BUG THIS PREVENTS, STATED PLAINLY ───────────────────────────────────────────────────
-- Instagram got a connection-scoped token READER (sa_get_instagram_token_by_connection) when
-- multi-account publishing landed. It never got the matching WRITER. The owner-scoped pair that
-- predates multi-account is still there, and with a second Instagram account they do this:
--
--   sa_update_instagram_token(p_owner, …)
--       update public.social_connections
--          set token_secret_id = <new>, token_expires_at = …
--        where owner_user_id = p_owner and provider = 'instagram';
--                                           ^^^ no account filter
--       → BOTH rows get the SAME secret. One account is now pointing at the other's credentials,
--         and the Vault secret the loser was using is deleted on the next line.
--
--   sa_get_instagram_token(p_owner)
--       … limit 1;        -- with no ORDER BY
--       → which account's token you get is whatever the planner feels like returning.
--
-- Nothing calls either one today: every live caller uses the _by_connection reader, and the
-- refresh helper that would have called the writer was never wired up. So this is latent — and
-- it stops being latent the day a second Instagram account is connected, which is imminent.
--
-- This is the SAME correction already made for TikTok in
-- 20261115000003_tiktok_connection_scoped_tokens.sql, in the same shape and for the same reason:
-- a write must never pick an account, and a read must never guess one.
--
-- ── WHAT THIS MIGRATION DOES ────────────────────────────────────────────────────────────────
--   1. adds sa_update_instagram_token_by_connection(uuid, text, timestamptz) — locks the row,
--      writes BY ID, supersedes only that connection's own Vault secret
--   2. makes sa_update_instagram_token RAISE when the owner has more than one Instagram
--      connection, instead of overwriting every one of them
--   3. makes sa_get_instagram_token return NOTHING when the owner has more than one, and be
--      deterministic when they have exactly one
--
-- It touches NO DATA. Three function definitions; not one row of social_connections, vault, or
-- anything else is read or written by running it.

-- ── 1. THE CONNECTION-SCOPED WRITER ─────────────────────────────────────────────────────────
create or replace function public.sa_update_instagram_token_by_connection(
  p_connection_id uuid,
  p_token         text,
  p_expires_at    timestamptz
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old_secret uuid;
  v_secret     uuid;
  v_owner      uuid;
begin
  -- LOCK FIRST. Two overlapping refreshes of the same destination must serialise, or each
  -- orphans the other's secret and one of them wins the row with a secret the other deleted.
  select sc.token_secret_id, sc.owner_user_id
    into v_old_secret, v_owner
    from public.social_connections sc
   where sc.id = p_connection_id and sc.provider = 'instagram'
   for update;

  if not found then
    raise exception 'sa_update_instagram_token_by_connection: no instagram connection %', p_connection_id;
  end if;

  -- Microseconds in the name, like the Instagram connect path: two refreshes inside the same
  -- second must not collide on the Vault uniqueness constraint.
  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || coalesce(v_owner::text, 'unknown') || ':' || p_connection_id::text
      || ':refresh:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'Instagram refreshed access token (Social Beast)'
  );

  -- BY ID. Not by owner, not by provider — the whole point of the function.
  --
  -- The SET list is deliberately short: token_secret_id, token_expires_at, updated_at. A refresh
  -- renews a credential and nothing else, so scopes, posting_paused, posts_per_day,
  -- stagger_offset_minutes, market_restriction, label, agent_user_id, username and
  -- external_account_id are all absent and therefore all preserved. `status` is absent too: a
  -- refresh is not a reconnection and must not quietly clear an error somebody needs to see.
  update public.social_connections
     set token_secret_id  = v_secret,
         token_expires_at = p_expires_at,
         updated_at       = now()
   where id = p_connection_id;

  -- Only the secret THIS connection was using. Swallowed, as elsewhere: a leaked secret row is
  -- worse than a failed refresh, but a failed delete must not roll back a renewed token.
  if v_old_secret is not null and v_old_secret <> v_secret then
    begin
      delete from vault.secrets where id = v_old_secret;
    exception when others then null;
    end;
  end if;
end $$;

revoke all on function public.sa_update_instagram_token_by_connection(uuid, text, timestamptz) from public;
revoke all on function public.sa_update_instagram_token_by_connection(uuid, text, timestamptz) from anon;
revoke all on function public.sa_update_instagram_token_by_connection(uuid, text, timestamptz) from authenticated;
grant execute on function public.sa_update_instagram_token_by_connection(uuid, text, timestamptz) to service_role;

-- ── 2. THE OWNER-SCOPED WRITER REFUSES RATHER THAN GUESSING ─────────────────────────────────
-- Kept, not dropped: dropping it would be a silent breakage for any caller we have not found,
-- and an exception naming the replacement is more useful than "function does not exist".
create or replace function public.sa_update_instagram_token(
  p_owner      uuid,
  p_token      text,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n          integer;
  v_conn       uuid;
  v_old_secret uuid;
  v_secret     uuid;
begin
  select count(*) into v_n
    from public.social_connections sc
   where sc.owner_user_id = p_owner and sc.provider = 'instagram';

  if v_n = 0 then
    raise exception 'sa_update_instagram_token: no connection';
  end if;

  -- A WRITE MUST NEVER PICK. With two accounts there is no owner-level answer to "which token",
  -- and the previous body answered it by updating both.
  if v_n > 1 then
    raise exception 'sa_update_instagram_token: % instagram connections for this owner — use sa_update_instagram_token_by_connection(connection_id, token, expires_at)', v_n;
  end if;

  select sc.id, sc.token_secret_id into v_conn, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = p_owner and sc.provider = 'instagram'
   for update;

  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || p_owner::text || ':refresh:' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'Instagram refreshed token'
  );

  -- BY ID even in the single-account case, so the statement cannot widen if the count ever lies.
  update public.social_connections
     set token_secret_id  = v_secret,
         token_expires_at = p_expires_at,
         updated_at       = now()
   where id = v_conn;

  if v_old_secret is not null and v_old_secret <> v_secret then
    begin
      delete from vault.secrets where id = v_old_secret;
    exception when others then null;
    end;
  end if;
end $$;

-- ── 3. THE OWNER-SCOPED READER RETURNS NOTHING WHEN IT CANNOT KNOW ──────────────────────────
-- Returning an arbitrary account's token is worse than returning none: the caller cannot tell
-- that it got the wrong one, and it would publish or read comments as the other account.
create or replace function public.sa_get_instagram_token(p_owner uuid)
returns table(token text, token_expires_at timestamptz, external_account_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  select count(*) into v_n
    from public.social_connections sc
   where sc.owner_user_id = p_owner and sc.provider = 'instagram';

  if v_n > 1 then
    return;
  end if;

  return query
    select ds.decrypted_secret, sc.token_expires_at, sc.external_account_id
      from public.social_connections sc
      join vault.decrypted_secrets ds on ds.id = sc.token_secret_id
     where sc.owner_user_id = p_owner and sc.provider = 'instagram'
     -- Deterministic even with one row, so the single-account case cannot depend on plan order.
     order by sc.created_at
     limit 1;
end $$;
