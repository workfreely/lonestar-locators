-- Social Beast — AN ADMIN-CONNECTED DESTINATION BELONGS TO THE ADMIN WHO CONNECTED IT.
--
-- ONE COLUMN, IN ONE INSERT, IN EACH OF TWO FUNCTIONS. Everything else in sa_connect_instagram
-- and sa_connect_tiktok is byte-identical to the definitions production runs today, which is
-- where both bodies were read from.
--
-- Both platforms had the same gap and get the same one-column fix, so Instagram and TikTok cannot
-- drift apart on who a new destination belongs to.
--
-- ── WHAT WAS MISSING ────────────────────────────────────────────────────────────────────────
-- The invitation flow records an agent (sa_consume_destination_invitation writes r.agent_user_id),
-- so an invited destination appears under that agent. Neither admin Connect flow recorded one, so
-- a destination connected through either arrived with agent_user_id NULL and landed in the
-- selector's Unassigned bucket rather than under the admin who connected it. The live TikTok row
-- is exactly that: agent_user_id NULL. The live @realestatepro_tx row carries agent_user_id = its
-- owner, so the convention already exists; these two inserts simply did not follow it.
--
-- auth.uid() is both the owner and, for this flow, the agent by definition: this is the path for
-- connecting AN ACCOUNT YOU OWN. There is nobody else it could belong to.
--
-- ── WHY THIS CANNOT TOUCH AN EXISTING CONNECTION ────────────────────────────────────────────
-- Only the INSERT changes in each. A connection that already exists takes the UPDATE branch
-- (Instagram) or the ON CONFLICT DO UPDATE branch (TikTok), and neither is changed — it still omits agent_user_id, posting_paused, posts_per_day,
-- stagger_offset_minutes and label, so a reconnect still cannot reset any of them. An existing
-- row's agent is therefore left exactly as it is, set or null.
--
-- posting_paused is deliberately still absent from the insert: the column default is true, so a
-- new destination arrives PAUSED. Naming it here would be a second place for that rule to live.

CREATE OR REPLACE FUNCTION public.sa_connect_instagram(p_external_account_id text, p_username text, p_account_type text, p_scopes text[], p_token text, p_expires_at timestamp with time zone)
 RETURNS TABLE(id uuid, username text, account_type text, status text, external_account_id text, token_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes, token_secret_id, token_expires_at, agent_user_id, updated_at)
    values
      (v_uid, 'instagram', p_external_account_id, p_username, p_account_type, 'connected', p_scopes, v_secret, p_expires_at, v_uid, now());
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

-- ── TIKTOK ─────────────────────────────────────────────────────────────────────────────────
-- The ON CONFLICT branch below is untouched and still omits agent_user_id, posting_paused,
-- posts_per_day, stagger_offset_minutes, label and market_restriction, so re-authorizing an
-- existing TikTok account still resets none of them.

CREATE OR REPLACE FUNCTION public.sa_connect_tiktok(p_open_id text, p_username text, p_scopes text[], p_token_bundle text, p_expires_at timestamp with time zone, p_avatar_url text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, username text, status text, external_account_id text, token_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (owner_user_id, provider, external_account_id, username, avatar_url, account_type, status, scopes, token_secret_id, token_expires_at, agent_user_id, updated_at)
  values
    (v_uid, 'tiktok', p_open_id, p_username, p_avatar_url, null, 'connected', p_scopes, v_secret, p_expires_at, v_uid, now())
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
end $function$;
