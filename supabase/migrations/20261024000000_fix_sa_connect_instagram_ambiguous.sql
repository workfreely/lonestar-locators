-- PREPARED, NOT APPLIED. Fixes the production error:
--     [instagram/callback] sa_connect_instagram failed: column reference "id" is ambiguous
--
-- ── THE OFFENDING STATEMENT ─────────────────────────────────────────────────────────────────
-- The function RETURNS TABLE (id uuid, …), so `id` is an in-scope PL/pgSQL OUT variable for the
-- whole body. This UPDATE then could not tell that variable from social_connections.id:
--
--     update public.social_connections
--        set …
--      where id = v_existing;     -- ← ambiguous
--
-- PostgreSQL's default plpgsql.variable_conflict is `error`, so it refuses rather than guessing.
-- The exception propagated out of the RPC, the callback's `if (error)` branch fired, and the user
-- was redirected to ?error=store with NOTHING written — which is why every reconnect since has
-- left the connection untouched.
--
-- ── WHY IT WORKED ONCE AND NEVER AGAIN ──────────────────────────────────────────────────────
-- The original definition (20260911000006) used `insert … on conflict … do update`, which has no
-- `where id` at all. 20260913000001 replaced that with an explicit UPDATE branch and introduced
-- the unqualified reference; 20260913000003 and 20261015000000 both carried it forward unchanged.
-- So the FIRST connect succeeded and every reconnect after 13 Sep has failed. The connection's
-- 14 Sep updated_at came from sa_update_instagram_token (the refresh path), not from a reconnect.
--
-- ── THIS IS A KNOWN SHAPE IN THIS CODEBASE ──────────────────────────────────────────────────
-- 20260910000000_fix_lb_create_client_share_ambiguous fixed the identical defect in
-- lb_create_client_share, with the identical remedy: alias the table in that one statement and
-- change nothing else. This follows that precedent exactly.
--
-- ── WHAT THIS REPLACES ──────────────────────────────────────────────────────────────────────
-- The whole function, with 20261015000000's definition plus ONE qualified reference. The vault
-- cleanup's identical ambiguity is deliberately left alone: its handler swallows it, so it cannot
-- fail the function, and it is tracked as separate work. It is
-- written as a complete body ON PURPOSE: the live definition cannot be read from here (pg_catalog
-- is not exposed through PostgREST), and all three candidate versions share this defect, so
-- replacing the whole thing lands on a known-good state whichever one is live. If production was
-- on an older version, this also brings 20261015000000's microsecond secret name along with it.
--
-- ── WHAT IT DOES NOT TOUCH ──────────────────────────────────────────────────────────────────
-- No table, column, index, policy or row. `create or replace function` swaps the body only. The
-- connection id, token, scopes, posting_paused, posts_per_day, stagger_offset_minutes, label and
-- agent_user_id are all untouched — and the UPDATE's SET list still deliberately omits the last
-- five, so a reconnect cannot reset them.
--
-- ROLLBACK: re-run supabase/migrations/20261015000000_instagram_reconnect_vault_name.sql, which is
-- the current repository definition. That restores the previous behaviour exactly — including the
-- bug, so roll back only if this correction itself misbehaves.
--
-- REHEARSAL BEFORE APPLYING:
--     begin; \i supabase/migrations/20261024000000_fix_sa_connect_instagram_ambiguous.sql; rollback;
-- then the same again in one transaction, to prove it is re-runnable.

create or replace function public.sa_connect_instagram(
  p_external_account_id text,
  p_username            text,
  p_account_type        text,
  p_scopes              text[],
  p_token               text,
  p_expires_at          timestamptz
)
returns table (
  id uuid, username text, account_type text, status text,
  external_account_id text, token_expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_secret     uuid;
  v_existing   uuid;
  v_old_secret uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_connect_instagram: not a platform admin';
  end if;
  if v_uid is null then
    raise exception 'sa_connect_instagram: no session';
  end if;

  select sc.id, sc.token_secret_id into v_existing, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid and sc.provider = 'instagram'
     and sc.external_account_id is not distinct from p_external_account_id;

  -- THE ONLY CHANGE: microseconds, not whole seconds.
  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || v_uid::text || ':' || coalesce(p_external_account_id, '') || ':' ||
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
    'Instagram long-lived access token (Beast Social)'
  );

  if v_existing is not null then
    -- UPDATE, not delete-and-insert: the row id is what social_posts, social_commenters and
    -- social_comments reference, and posting_paused / posts_per_day / stagger_offset_minutes /
    -- label / agent_user_id are deliberately absent from this list so a reconnect cannot reset them.
    -- ALIASED. `sc.id` can only be the column; bare `id` was the OUT parameter too.
    update public.social_connections sc
       set external_account_id = p_external_account_id,
           username            = p_username,
           account_type        = p_account_type,
           status              = 'connected',
           scopes              = p_scopes,
           token_secret_id     = v_secret,
           token_expires_at    = p_expires_at,
           updated_at          = now()
     where sc.id = v_existing;
  else
    insert into public.social_connections
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes, token_secret_id, token_expires_at, updated_at)
    values
      (v_uid, 'instagram', p_external_account_id, p_username, p_account_type, 'connected', p_scopes, v_secret, p_expires_at, now());
  end if;

  if v_old_secret is not null and v_old_secret <> v_secret then
    -- LEFT EXACTLY AS IT IS, DELIBERATELY. This carries the same ambiguity, but its own handler
    -- swallows the error, so it cannot fail the function — the only consequence is that the
    -- superseded secret is never deleted. Out of scope for this correction and tracked separately,
    -- so this migration changes ONE statement and nothing else.
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  return query
    select sc.id, sc.username, sc.account_type, sc.status, sc.external_account_id, sc.token_expires_at
      from public.social_connections sc
     where sc.owner_user_id = v_uid and sc.provider = 'instagram'
       and sc.external_account_id is not distinct from p_external_account_id;
end $function$;
