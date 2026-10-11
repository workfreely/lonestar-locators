-- CONSUME MUST VALIDATE THE PROVIDER TOO.
--
-- sa_create_destination_invitation refuses anything but instagram/tiktok, but sa_consume_ did not
-- re-check: it read whatever provider the ROW carried and minted a connection for it. Measured —
-- an invitation row written directly with provider='youtube' produced a youtube connection, a
-- destination no publish path can service.
--
-- Reaching that state needs service-role or admin access, so this is hardening rather than a live
-- hole. It is worth closing anyway for the reason every other check here exists: the create-time
-- validation is one guard, and a row that bypasses it should still not be consumable. Validation
-- belongs where the row is USED, not only where it is made.
begin;

create or replace function public.sa_consume_destination_invitation(
  p_token_hash text, p_external_account_id text, p_username text, p_account_type text,
  p_scopes text[], p_token text, p_expires_at timestamptz
) returns table (status text, connection_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  r            public.social_destination_invitations%rowtype;
  v_owner      uuid;
  v_existing   uuid;
  v_old_secret uuid;
  v_secret     uuid;
  v_conn       uuid;
  v_other      uuid;
  v_provider   text;
begin
  select * into r from public.social_destination_invitations
   where token_hash = p_token_hash for update;

  if not found then return query select 'invalid'::text, null::uuid; return; end if;
  if r.revoked_at is not null then return query select 'revoked'::text, null::uuid; return; end if;
  if r.used_at    is not null then return query select 'used'::text, null::uuid; return; end if;
  if r.expires_at <= now()    then return query select 'expired'::text, null::uuid; return; end if;
  if p_external_account_id is null or btrim(p_external_account_id) = '' then
    return query select 'no_account'::text, null::uuid; return;
  end if;

  v_owner    := r.owner_user_id;
  v_provider := coalesce(r.provider, 'instagram');

  -- THE SECOND GUARD. A returned status rather than a raised exception, so the public callback
  -- renders a normal refusal page instead of a 500.
  if v_provider not in ('instagram', 'tiktok') then
    return query select 'unsupported_provider'::text, null::uuid; return;
  end if;

  select sc.id into v_other
    from public.social_connections sc
   where sc.provider = v_provider
     and sc.external_account_id = p_external_account_id
     and sc.owner_user_id <> v_owner
   limit 1;
  if v_other is not null then return query select 'account_taken'::text, null::uuid; return; end if;

  select sc.id, sc.token_secret_id into v_existing, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_owner
     and sc.provider = v_provider
     and sc.external_account_id is not distinct from p_external_account_id;

  v_secret := vault.create_secret(
    p_token,
    'social:' || v_provider || ':' || v_owner::text || ':' || p_external_account_id || ':' ||
      extract(epoch from clock_timestamp())::bigint::text,
    initcap(v_provider) || ' access token (Beast Social destination)'
  );

  if v_existing is not null then
    update public.social_connections
       set username = p_username, account_type = p_account_type, status = 'connected',
           scopes = p_scopes, token_secret_id = v_secret, token_expires_at = p_expires_at,
           label = coalesce(label, r.label),
           agent_user_id = coalesce(agent_user_id, r.agent_user_id), updated_at = now()
     where id = v_existing;
    v_conn := v_existing;
  else
    insert into public.social_connections
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes,
       token_secret_id, token_expires_at, label, agent_user_id, updated_at)
    values
      (v_owner, v_provider, p_external_account_id, p_username, p_account_type, 'connected', p_scopes,
       v_secret, p_expires_at, r.label, r.agent_user_id, now())
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

commit;
