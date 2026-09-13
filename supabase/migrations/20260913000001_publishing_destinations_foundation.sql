-- Beast Social — Publishing Destinations FOUNDATION (schema only; no publishing worker, no
-- invite/OAuth flow yet). One Beast Social OWNER may now hold MULTIPLE Instagram connections, one
-- per external Instagram account ("destination"). Every destination keeps its own
-- external_account_id, username, status, and Vault token (token_secret_id). The owner-scoped RLS
-- (is_platform_admin() AND owner_user_id = auth.uid()) is UNCHANGED, so destination owners never
-- gain any Beast Social access — their Instagram is only referenced server-side.

-- 1. Uniqueness: was one Instagram per owner; now one per (owner, external account). This lets the
--    admin add additional Instagram destinations while the existing connection is preserved.
alter table public.social_connections drop constraint if exists social_connections_owner_user_id_provider_key;
alter table public.social_connections
  add constraint social_connections_owner_provider_account_key unique (owner_user_id, provider, external_account_id);

-- 2. Destination metadata (foundation for a friendly label, active/paused publishing, cadence, and
--    a future stagger offset). Defaults keep every existing row unchanged in behavior.
alter table public.social_connections
  add column if not exists label text,
  add column if not exists posting_paused boolean not null default false,
  add column if not exists posts_per_day integer,
  add column if not exists stagger_offset_minutes integer not null default 0;

-- 3. Stable destination reference on each post. Nullable; ON DELETE SET NULL so removing a
--    destination never deletes posts or their history. Source media stays shared via
--    social_content — posts only REFERENCE a source and a destination, never duplicate the video.
alter table public.social_posts
  add column if not exists connection_id uuid references public.social_connections(id) on delete set null;
create index if not exists social_posts_connection_id_idx on public.social_posts(connection_id);

-- 4. Backfill: existing Instagram posts point at their owner's existing Instagram connection.
update public.social_posts p
   set connection_id = c.id
  from public.social_connections c
 where p.connection_id is null
   and p.platform = 'instagram'
   and c.owner_user_id = p.owner_user_id
   and c.provider = 'instagram';

-- 5. sa_connect_instagram now keys on the external account, so re-connecting an existing account
--    UPDATES it (rotating its Vault token) and connecting a NEW account INSERTS a new destination —
--    instead of the old single-per-provider upsert. Still platform-admin only; token stays in Vault
--    and is never returned. Old secret is deleted only after the new one is stored.
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

  -- Match the destination by external account id (null-safe), so the same account updates in place.
  select sc.id, sc.token_secret_id into v_existing, v_old_secret
    from public.social_connections sc
   where sc.owner_user_id = v_uid and sc.provider = 'instagram'
     and sc.external_account_id is not distinct from p_external_account_id;

  v_secret := vault.create_secret(
    p_token,
    'social:instagram:' || v_uid::text || ':' || coalesce(p_external_account_id, ''),
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
