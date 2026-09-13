-- Beast Social — HOTFIX: Vault secret-name uniqueness on token rotation.
--
-- vault.secrets enforces a UNIQUE index on `name`. Both sa_connect_instagram (admin re-connect)
-- and sa_consume_destination_invitation (recipient re-authorization) created the new secret with a
-- DETERMINISTIC name (social:instagram:<owner>:<external>) BEFORE deleting the old one — so
-- re-authorizing / re-connecting the SAME account collided on the name and failed. This would have
-- broken an @realestatepro_tx reconnect. Fix: give the new secret a unique clock suffix (same
-- pattern sa_update_instagram_token already uses), keeping "create new, then delete old" so a
-- failed create never loses the working token. Function signatures/behavior are otherwise
-- unchanged. Idempotent create-or-replace (no-op on a fresh DB that already has the fixed bodies).

-- ── Foundation admin connect: unique Vault name on re-connect ────────────────────────────────
create or replace function public.sa_connect_instagram(
  p_external_account_id text, p_username text, p_account_type text, p_scopes text[], p_token text, p_expires_at timestamp with time zone)
 returns table(id uuid, username text, account_type text, status text, external_account_id text, token_expires_at timestamp with time zone)
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

  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || v_uid::text || ':' || coalesce(p_external_account_id, '') || ':' || extract(epoch from clock_timestamp())::bigint::text,
    'Instagram long-lived access token (Beast Social)'
  );

  if v_existing is not null then
    update public.social_connections
       set external_account_id = p_external_account_id,
           username            = p_username,
           account_type        = p_account_type,
           status              = 'connected',
           scopes              = p_scopes,
           token_secret_id     = v_secret,
           token_expires_at    = p_expires_at,
           updated_at          = now()
     where id = v_existing;
  else
    insert into public.social_connections
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes, token_secret_id, token_expires_at, updated_at)
    values
      (v_uid, 'instagram', p_external_account_id, p_username, p_account_type, 'connected', p_scopes, v_secret, p_expires_at, now());
  end if;

  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  return query
    select sc.id, sc.username, sc.account_type, sc.status, sc.external_account_id, sc.token_expires_at
      from public.social_connections sc
     where sc.owner_user_id = v_uid and sc.provider = 'instagram'
       and sc.external_account_id is not distinct from p_external_account_id;
end $function$;

-- ── Recipient consume: unique Vault name on re-authorization ─────────────────────────────────
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
    return query select 'used'::text, null::uuid; return;
  end if;
  if r.expires_at <= now() then
    return query select 'expired'::text, null::uuid; return;
  end if;
  if p_external_account_id is null or btrim(p_external_account_id) = '' then
    return query select 'no_account'::text, null::uuid; return;
  end if;

  v_owner := r.owner_user_id;

  select sc.id into v_other
    from public.social_connections sc
   where sc.provider = 'instagram'
     and sc.external_account_id = p_external_account_id
     and sc.owner_user_id <> v_owner
   limit 1;
  if v_other is not null then
    return query select 'account_taken'::text, null::uuid; return;
  end if;

  select sc.id, sc.token_secret_id into v_existing, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_owner
     and sc.provider = 'instagram'
     and sc.external_account_id is not distinct from p_external_account_id;

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

  update public.social_destination_invitations
     set used_at = now(), consumed_connection_id = v_conn
   where id = r.id;

  return query select 'connected'::text, v_conn;
end $$;

revoke all on function public.sa_consume_destination_invitation(text, text, text, text, text[], text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sa_consume_destination_invitation(text, text, text, text, text[], text, timestamptz)
  to service_role;
