-- Beast Social — associate a Publishing Destination with an existing Locator Beast agent (profile).
--
-- "+ Add Publishing Destination" now searches EXISTING Locator Beast users (profiles) and remembers
-- which agent an invitation/destination is for. The destination OWNER is still the platform admin
-- (owner_user_id = the creator) — agent_user_id is only a display/association reference. profiles
-- RLS is own-profile-only, so admin agent search/resolution goes through is_platform_admin()-gated
-- SECURITY DEFINER RPCs; profiles RLS is NOT weakened. The final connected Instagram username still
-- comes ONLY from the OAuth-authorized account (sa_consume sets it from the OAuth profile).

-- 1. Remember the selected agent on the invitation and (after authorization) on the connection.
--    Nullable + ON DELETE SET NULL so removing a profile never breaks a destination/invitation.
alter table public.social_destination_invitations
  add column if not exists agent_user_id uuid references public.profiles(id) on delete set null;
alter table public.social_connections
  add column if not exists agent_user_id uuid references public.profiles(id) on delete set null;

-- 2. Admin-only agent search (typeahead). SECURITY DEFINER so the platform admin can look up other
--    agents without weakening profiles' own-profile-only RLS. Returns SAFE identity fields only.
create or replace function public.sa_search_agents(p_query text)
returns table (id uuid, first_name text, last_name text, preferred_name text, profile_photo_url text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  q text := '%' || btrim(coalesce(p_query, '')) || '%';
begin
  if not public.is_platform_admin() then
    raise exception 'sa_search_agents: not a platform admin';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.preferred_name, p.profile_photo_url, p.email
      from public.profiles p
     where btrim(coalesce(p_query, '')) = ''
        or p.first_name     ilike q
        or p.last_name      ilike q
        or p.preferred_name ilike q
        or p.full_name      ilike q
        or p.email          ilike q
     order by coalesce(p.first_name, p.preferred_name, p.full_name, p.email), p.last_name
     limit 10;
end $$;
revoke all on function public.sa_search_agents(text) from public, anon;
grant execute on function public.sa_search_agents(text) to authenticated;

-- 3. Admin-only resolver: display fields for a set of agent ids (to render destinations/invites).
create or replace function public.sa_agents_by_ids(p_ids uuid[])
returns table (id uuid, first_name text, last_name text, preferred_name text, profile_photo_url text, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'sa_agents_by_ids: not a platform admin';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.preferred_name, p.profile_photo_url, p.email
      from public.profiles p
     where p.id = any(coalesce(p_ids, '{}'::uuid[]));
end $$;
revoke all on function public.sa_agents_by_ids(uuid[]) from public, anon;
grant execute on function public.sa_agents_by_ids(uuid[]) to authenticated;

-- 4. Invitation create now stores the selected agent. Signature changes (adds p_agent_user_id), so
--    drop the old 3-arg version and create the 4-arg one. Owner binding + hashing unchanged.
drop function if exists public.sa_create_destination_invitation(text, text, timestamptz);
create or replace function public.sa_create_destination_invitation(
  p_token_hash    text,
  p_label         text,
  p_expires_at    timestamptz,
  p_agent_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_create_destination_invitation: not a platform admin';
  end if;
  if v_uid is null then
    raise exception 'sa_create_destination_invitation: no session';
  end if;
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'sa_create_destination_invitation: bad token hash';
  end if;

  insert into public.social_destination_invitations (owner_user_id, provider, token_hash, label, expires_at, agent_user_id)
  values (v_uid, 'instagram', p_token_hash, nullif(btrim(p_label), ''), coalesce(p_expires_at, now() + interval '7 days'), p_agent_user_id)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.sa_create_destination_invitation(text, text, timestamptz, uuid) from public, anon;
grant execute on function public.sa_create_destination_invitation(text, text, timestamptz, uuid) to authenticated;

-- 5. Consume copies the invitation's agent_user_id onto the created/updated connection. Everything
--    else (owner from invite row, atomic single-use, Vault, account_taken, clock-suffixed secret
--    name) is unchanged. The Instagram username still comes only from the OAuth profile (p_username).
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
           agent_user_id    = coalesce(agent_user_id, r.agent_user_id),
           updated_at       = now()
     where id = v_existing;
    v_conn := v_existing;
  else
    insert into public.social_connections
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes,
       token_secret_id, token_expires_at, label, agent_user_id, updated_at)
    values
      (v_owner, 'instagram', p_external_account_id, p_username, p_account_type, 'connected', p_scopes,
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
revoke all on function public.sa_consume_destination_invitation(text, text, text, text, text[], text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sa_consume_destination_invitation(text, text, text, text, text[], text, timestamptz)
  to service_role;
