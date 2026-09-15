-- Meta Ads (Instagram & Facebook Ads) — Phase 1: CONNECT.
--
-- One row = one connected Meta advertising setup for a WORKSPACE (a locator/customer). This is a
-- SEPARATE table from social_connections (which is the Social Beast IG-organic connection): the
-- semantics differ (Business/Page/Ad Account/Instagram, multi-asset) and it is WORKSPACE-scoped, not
-- platform-admin-scoped. Access tokens are NEVER stored in plaintext — they live in Supabase VAULT
-- and the row keeps only *_token_secret_id pointers (same pattern as social_connections). This
-- checkpoint is connection-only: NO lead ingestion, NO insights sync, NO ads management.

create table if not exists public.meta_connections (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id           uuid not null,                 -- the member who connected (from auth.uid())
  provider                text not null default 'meta',
  owner_scope             text not null default 'locator', -- 'locator' | 'platform' (corporate, later)
  -- Discovered/selected assets (friendly + stable ids). No token material here.
  business_id             text,
  business_name           text,
  page_id                 text,
  page_name               text,
  ad_account_id           text,
  ad_account_name         text,
  instagram_account_id    text,
  instagram_username      text,
  -- Vault pointers (encrypted tokens) — NEVER plaintext tokens.
  user_token_secret_id    uuid,
  page_token_secret_id    uuid,
  system_user_token_secret_id uuid,                       -- nullable (durable server token, later)
  token_expires_at        timestamptz,
  scopes                  text[],
  connection_status       text not null default 'pending',-- pending | connected | expired | revoked | error
  discovered              jsonb,                          -- ambiguity options while status='pending' (asset ids/names only)
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (workspace_id, provider)
);

comment on column public.meta_connections.user_token_secret_id is
  'Supabase Vault secret id holding the ENCRYPTED Meta long-lived USER access token. Read only by the
   service-role meta_get_token function. Never a plaintext column, never returned to the browser.';

create index if not exists idx_meta_connections_workspace on public.meta_connections(workspace_id);
create index if not exists idx_meta_connections_owner on public.meta_connections(owner_user_id);

alter table public.meta_connections enable row level security;

-- Reads: active workspace members see their own workspace's connection; platform-scope rows are
-- readable only by platform admins. Writes go through the SECURITY DEFINER RPCs below (not direct).
drop policy if exists "workspace members read meta_connections" on public.meta_connections;
create policy "workspace members read meta_connections" on public.meta_connections
  for select
  using (
    (owner_scope <> 'platform' and public.is_active_workspace_member(workspace_id))
    or (owner_scope = 'platform' and public.is_platform_admin())
  );

-- ── Connect / upsert: encrypt token(s) into Vault + upsert the row (returns NON-SECRET fields) ──
-- Raw tokens arrive as BIND PARAMETERS (kept out of statement logs), go straight to Vault; only the
-- ciphertext pointers persist. Enforces workspace membership (or platform-admin for platform scope).
create or replace function public.meta_connect(
  p_workspace_id          uuid,
  p_owner_scope           text,
  p_status                text,
  p_scopes                text[],
  p_business_id           text,
  p_business_name         text,
  p_page_id               text,
  p_page_name             text,
  p_ad_account_id         text,
  p_ad_account_name       text,
  p_instagram_account_id  text,
  p_instagram_username    text,
  p_user_token            text,
  p_page_token            text,
  p_token_expires_at      timestamptz,
  p_discovered            jsonb
) returns table (
  id uuid, owner_scope text, connection_status text, business_name text, page_name text,
  ad_account_id text, ad_account_name text, instagram_username text, token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_scope        text := coalesce(p_owner_scope, 'locator');
  v_user_secret  uuid;
  v_page_secret  uuid;
  v_old_user     uuid;
  v_old_page     uuid;
begin
  if v_uid is null then
    raise exception 'meta_connect: no session';
  end if;
  if v_scope = 'platform' then
    if not public.is_platform_admin() then
      raise exception 'meta_connect: not a platform admin';
    end if;
  elsif not public.is_active_workspace_member(p_workspace_id) then
    raise exception 'meta_connect: not a workspace member';
  end if;

  select mc.user_token_secret_id, mc.page_token_secret_id into v_old_user, v_old_page
    from public.meta_connections mc
   where mc.workspace_id = p_workspace_id and mc.provider = 'meta';

  if p_user_token is not null then
    v_user_secret := vault.create_secret(p_user_token,
      'meta:user:' || p_workspace_id::text || ':' || extract(epoch from now())::bigint::text,
      'Meta long-lived user access token');
  end if;
  if p_page_token is not null then
    v_page_secret := vault.create_secret(p_page_token,
      'meta:page:' || p_workspace_id::text || ':' || coalesce(p_page_id, ''),
      'Meta Page access token');
  end if;

  insert into public.meta_connections
    (workspace_id, owner_user_id, provider, owner_scope, business_id, business_name, page_id, page_name,
     ad_account_id, ad_account_name, instagram_account_id, instagram_username,
     user_token_secret_id, page_token_secret_id, token_expires_at, scopes, connection_status, discovered, updated_at)
  values
    (p_workspace_id, v_uid, 'meta', v_scope, p_business_id, p_business_name, p_page_id, p_page_name,
     p_ad_account_id, p_ad_account_name, p_instagram_account_id, p_instagram_username,
     v_user_secret, v_page_secret, p_token_expires_at, p_scopes, coalesce(p_status, 'connected'), p_discovered, now())
  on conflict (workspace_id, provider) do update
    set owner_user_id        = v_uid,
        owner_scope          = v_scope,
        business_id          = excluded.business_id,
        business_name        = excluded.business_name,
        page_id              = excluded.page_id,
        page_name            = excluded.page_name,
        ad_account_id        = excluded.ad_account_id,
        ad_account_name      = excluded.ad_account_name,
        instagram_account_id = excluded.instagram_account_id,
        instagram_username   = excluded.instagram_username,
        user_token_secret_id = coalesce(excluded.user_token_secret_id, public.meta_connections.user_token_secret_id),
        page_token_secret_id = coalesce(excluded.page_token_secret_id, public.meta_connections.page_token_secret_id),
        token_expires_at     = excluded.token_expires_at,
        scopes               = excluded.scopes,
        connection_status    = excluded.connection_status,
        discovered           = excluded.discovered,
        updated_at           = now();

  -- Rotate out replaced secrets.
  if p_user_token is not null and v_old_user is not null and v_old_user <> v_user_secret then
    begin delete from vault.secrets where id = v_old_user; exception when others then null; end;
  end if;
  if p_page_token is not null and v_old_page is not null and v_old_page <> v_page_secret then
    begin delete from vault.secrets where id = v_old_page; exception when others then null; end;
  end if;

  return query
    select mc.id, mc.owner_scope, mc.connection_status, mc.business_name, mc.page_name,
           mc.ad_account_id, mc.ad_account_name, mc.instagram_username, mc.token_expires_at
      from public.meta_connections mc
     where mc.workspace_id = p_workspace_id and mc.provider = 'meta';
end $$;

grant execute on function public.meta_connect(uuid, text, text, text[], text, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) to authenticated;

-- ── Confirm assets (ambiguity resolution): set the chosen assets + flip to connected ──
-- The chosen ids must already be present in the pending row's `discovered` options (tenant-safe:
-- the user can only pick assets Meta returned for THEIR grant). Workspace-membership enforced.
create or replace function public.meta_confirm_assets(
  p_workspace_id         uuid,
  p_page_id              text,
  p_page_name            text,
  p_ad_account_id        text,
  p_ad_account_name      text,
  p_instagram_account_id text,
  p_instagram_username   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_workspace_member(p_workspace_id) then
    raise exception 'meta_confirm_assets: not a workspace member';
  end if;
  update public.meta_connections
     set page_id = p_page_id, page_name = p_page_name,
         ad_account_id = p_ad_account_id, ad_account_name = p_ad_account_name,
         instagram_account_id = p_instagram_account_id, instagram_username = p_instagram_username,
         connection_status = 'connected', discovered = null, updated_at = now()
   where workspace_id = p_workspace_id and provider = 'meta';
end $$;

grant execute on function public.meta_confirm_assets(uuid, text, text, text, text, text, text) to authenticated;

-- ── Disconnect: delete Vault secrets + the row (workspace-scoped) ──
create or replace function public.meta_disconnect(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_page uuid; v_sys uuid;
begin
  if not public.is_active_workspace_member(p_workspace_id) then
    raise exception 'meta_disconnect: not a workspace member';
  end if;
  select user_token_secret_id, page_token_secret_id, system_user_token_secret_id
    into v_user, v_page, v_sys
    from public.meta_connections where workspace_id = p_workspace_id and provider = 'meta';
  if v_user is not null then begin delete from vault.secrets where id = v_user; exception when others then null; end; end if;
  if v_page is not null then begin delete from vault.secrets where id = v_page; exception when others then null; end; end if;
  if v_sys  is not null then begin delete from vault.secrets where id = v_sys;  exception when others then null; end; end if;
  delete from public.meta_connections where workspace_id = p_workspace_id and provider = 'meta';
end $$;

grant execute on function public.meta_disconnect(uuid) to authenticated;

-- ── Token read (FOUNDATION; server-side only; NOT granted to authenticated) ──
-- Lets a FUTURE server-only job (lead ingestion / insights sync, later phases) read a token via the
-- service role. Not callable from a browser session, so tokens never reach the client. No route wires
-- it in this connection-only checkpoint.
create or replace function public.meta_get_token(p_workspace_id uuid, p_which text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_secret uuid; v_token text;
begin
  select case p_which
           when 'page' then page_token_secret_id
           when 'system' then system_user_token_secret_id
           else user_token_secret_id
         end
    into v_secret
    from public.meta_connections where workspace_id = p_workspace_id and provider = 'meta';
  if v_secret is null then return null; end if;
  select ds.decrypted_secret into v_token from vault.decrypted_secrets ds where ds.id = v_secret limit 1;
  return v_token;
end $$;

revoke all on function public.meta_get_token(uuid, text) from public, anon, authenticated;
grant execute on function public.meta_get_token(uuid, text) to service_role;
