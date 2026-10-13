-- Instagram RECONNECT — second-precision Vault secret names can still collide.
--
-- NOT YET APPLIED. Prepared alongside the comment-scope authorization change, because the
-- reconnect it protects is the next thing that will happen to this account.
--
-- ── THE RESIDUAL DEFECT ─────────────────────────────────────────────────────────────────────
-- sa_connect_instagram builds its Vault secret name as:
--
--     'social:instagram:' || v_uid || ':' || coalesce(p_external_account_id, '') || ':' ||
--       extract(epoch from clock_timestamp())::bigint::text
--
-- The trailing component is whole SECONDS. vault.secrets.name carries a UNIQUE index
-- (secrets_name_idx), and vault.create_secret is called BEFORE the previous secret is deleted, so
-- two connects of the same account within the same second raise
--
--     23505  duplicate key value violates unique constraint "secrets_name_idx"
--
-- which propagates out of the RPC, trips the callback's `if (error)` branch, and shows the user
-- "Connected but couldn't save the connection" — with the tokens already exchanged. This is exactly
-- the TikTok failure fixed in 20261013000001, one order of magnitude less likely: it needs two
-- callbacks inside one second rather than any reconnect at all. A double-clicked Connect button, a
-- retried redirect, or a browser that follows the callback twice is enough.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────────────────────
-- Microsecond precision, the same shape the TikTok fix uses and the same shape
-- sa_update_instagram_token already uses when it rotates a refreshed token. Nothing else about the
-- function changes: the same UPDATE-when-the-account-already-exists branch, so the connection row's
-- id, posting_paused, posts_per_day, label and every foreign key that points at it are preserved.
--
-- The old secret is still deleted only AFTER a successful write, and the whole function is still one
-- transaction — so a failure anywhere leaves the existing connection and its token untouched.

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
