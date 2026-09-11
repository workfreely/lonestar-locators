-- Social Autopilot → social_connections (Instagram connection foundation, connection-only).
--
-- One row = one connected external account for a platform admin. Provider-agnostic so
-- TikTok/YouTube can reuse it later. The OAuth access token is NEVER stored in a plaintext
-- column: it lives in Supabase VAULT and the row keeps only token_secret_id (a Vault
-- pointer) — the same pattern as client_recommendation_shares. Platform-admin only via RLS
-- + is_platform_admin(), owner-scoped. NO publishing here.

create table if not exists public.social_connections (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null,
  provider            text not null,               -- 'instagram' (tiktok/youtube later)
  external_account_id text,                         -- Instagram-scoped user id
  username            text,
  account_type        text,                         -- BUSINESS / MEDIA_CREATOR / etc.
  status              text not null default 'connected',  -- connected | error
  scopes              text[],
  token_secret_id     uuid,                         -- Vault secret id (encrypted token) — NEVER the token
  token_expires_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (owner_user_id, provider)
);

comment on column public.social_connections.token_secret_id is
  'Supabase Vault secret id holding the ENCRYPTED OAuth access token. Read only by the
   service-role sa_get/update_instagram_token functions (server-side, for future refresh/
   publish). Never a plaintext token column, never returned to the browser, never logged.';

alter table public.social_connections enable row level security;

drop policy if exists "platform admin owns social_connections" on public.social_connections;
create policy "platform admin owns social_connections" on public.social_connections
  for all
  using (public.is_platform_admin() and owner_user_id = auth.uid())
  with check (public.is_platform_admin() and owner_user_id = auth.uid());

-- ── Connect: encrypt the token into Vault + upsert the row (returns NON-SECRET fields) ──
-- The raw token arrives as an RPC BIND PARAMETER (never inlined SQL, so it stays out of
-- statement logs); it goes straight to Vault and only the ciphertext + pointer persist.
-- Runs as the authenticated admin (callback route); platform-admin enforced inside.
create or replace function public.sa_connect_instagram(
  p_external_account_id text,
  p_username            text,
  p_account_type        text,
  p_scopes              text[],
  p_token               text,
  p_expires_at          timestamptz
) returns table (id uuid, username text, account_type text, status text, external_account_id text, token_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_secret     uuid;
  v_old_secret uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'sa_connect_instagram: not a platform admin';
  end if;
  if v_uid is null then
    raise exception 'sa_connect_instagram: no session';
  end if;

  select sc.token_secret_id into v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid and sc.provider = 'instagram';

  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || v_uid::text || ':' || coalesce(p_external_account_id, ''),
    'Instagram long-lived access token (Social Autopilot)'
  );

  insert into public.social_connections
    (owner_user_id, provider, external_account_id, username, account_type, status, scopes, token_secret_id, token_expires_at, updated_at)
  values
    (v_uid, 'instagram', p_external_account_id, p_username, p_account_type, 'connected', p_scopes, v_secret, p_expires_at, now())
  on conflict (owner_user_id, provider) do update
    set external_account_id = excluded.external_account_id,
        username            = excluded.username,
        account_type        = excluded.account_type,
        status              = 'connected',
        scopes              = excluded.scopes,
        token_secret_id     = excluded.token_secret_id,
        token_expires_at    = excluded.token_expires_at,
        updated_at          = now();

  if v_old_secret is not null and v_old_secret <> v_secret then
    begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
  end if;

  return query
    select sc.id, sc.username, sc.account_type, sc.status, sc.external_account_id, sc.token_expires_at
      from public.social_connections sc
     where sc.owner_user_id = v_uid and sc.provider = 'instagram';
end $$;

grant execute on function public.sa_connect_instagram(text, text, text, text[], text, timestamptz) to authenticated;

-- ── Disconnect: delete the Vault secret + the row (admin-scoped) ─────────────
create or replace function public.sa_disconnect_instagram()
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
    raise exception 'sa_disconnect_instagram: not a platform admin';
  end if;
  select sc.token_secret_id into v_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid and sc.provider = 'instagram';
  if v_secret is not null then
    begin delete from vault.secrets where id = v_secret; exception when others then null; end;
  end if;
  delete from public.social_connections where owner_user_id = v_uid and provider = 'instagram';
end $$;

grant execute on function public.sa_disconnect_instagram() to authenticated;

-- ── Token-lifecycle FOUNDATION (server-side only; NOT granted to authenticated) ──
-- These let a FUTURE, server-only refresh/publish job read + rotate the token via the
-- service role (lib/supabase/admin). They are NOT callable from a browser session, so the
-- token never reaches the client. No route/cron wires them in this connection-only
-- checkpoint — they exist so unattended refresh can be added without a schema change.
create or replace function public.sa_get_instagram_token(p_owner uuid)
returns table (token text, token_expires_at timestamptz, external_account_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select ds.decrypted_secret, sc.token_expires_at, sc.external_account_id
      from public.social_connections sc
      join vault.decrypted_secrets ds on ds.id = sc.token_secret_id
     where sc.owner_user_id = p_owner and sc.provider = 'instagram'
     limit 1;
end $$;

revoke all on function public.sa_get_instagram_token(uuid) from public, anon, authenticated;
grant execute on function public.sa_get_instagram_token(uuid) to service_role;

create or replace function public.sa_update_instagram_token(p_owner uuid, p_token text, p_expires_at timestamptz)
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
   where sc.owner_user_id = p_owner and sc.provider = 'instagram';
  if v_old_secret is null then
    raise exception 'sa_update_instagram_token: no connection';
  end if;
  v_secret := vault.create_secret(p_token, 'social:instagram:' || p_owner::text || ':refresh:' || extract(epoch from now())::bigint::text, 'Instagram refreshed token');
  update public.social_connections
     set token_secret_id = v_secret, token_expires_at = p_expires_at, status = 'connected', updated_at = now()
   where owner_user_id = p_owner and provider = 'instagram';
  begin delete from vault.secrets where id = v_old_secret; exception when others then null; end;
end $$;

revoke all on function public.sa_update_instagram_token(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sa_update_instagram_token(uuid, text, timestamptz) to service_role;
