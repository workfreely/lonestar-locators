-- INVITATIONS: carry the PROVIDER through, so a TikTok invite creates a TikTok connection.
--
-- social_destination_invitations already HAS a provider column, defaulting to 'instagram'. Neither
-- RPC ever read or wrote it: sa_create_destination_invitation took no provider, and
-- sa_consume_destination_invitation hardcoded the string 'instagram' in five places — the
-- account-taken check, the existing-connection lookup, the Vault secret name, its description, and
-- the INSERT. A TikTok invite would therefore have minted an INSTAGRAM connection row holding a
-- TikTok token: a silent, confusing failure rather than an error.
--
-- ── BACKWARD COMPATIBILITY IS THE POINT ─────────────────────────────────────────────────────
-- Both functions keep their existing signature and gain an OPTIONAL p_provider defaulting to
-- 'instagram'. Every current caller passes the same arguments it passes today and gets exactly
-- today's behaviour; the live Instagram authorize flow is not edited at all. Postgres resolves the
-- old 5- and 7-argument calls to these because the new parameter has a default.

begin;

create or replace function public.sa_create_destination_invitation(
  p_token_hash text, p_label text, p_expires_at timestamptz, p_agent_user_id uuid,
  p_provider text default 'instagram'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  -- Narrowed to what we can actually consume. An unknown provider would create an invitation that
  -- no callback could ever honour, which is worse than refusing it here.
  if p_provider not in ('instagram', 'tiktok') then
    raise exception 'unsupported provider: %', p_provider;
  end if;

  insert into public.social_destination_invitations
    (owner_user_id, provider, token_hash, label, expires_at, agent_user_id)
  values (auth.uid(), p_provider, p_token_hash, p_label, p_expires_at, p_agent_user_id)
  returning id into v_id;
  return v_id;
end $$;

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

  v_owner := r.owner_user_id;
  -- THE PROVIDER COMES FROM THE INVITATION, never from the caller. The callback that consumes an
  -- invite already knows which network it just completed OAuth with, but taking it from the row is
  -- what makes a TikTok invite impossible to redeem through the Instagram callback.
  v_provider := coalesce(r.provider, 'instagram');

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

-- ── REMOVE THE OLD OVERLOAD ─────────────────────────────────────────────────────────────────
-- Adding a defaulted parameter CREATES a second function rather than replacing the first, so for a
-- moment both existed and a 4-argument call still resolved to the provider-blind original — which
-- would have defaulted every TikTok invitation back to Instagram, the exact bug this migration is
-- here to fix. Dropping the 4-argument form leaves exactly one function; existing 4-argument
-- callers resolve to it through the default.
drop function if exists public.sa_create_destination_invitation(text, text, timestamptz, uuid);
