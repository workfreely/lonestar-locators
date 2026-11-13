-- Social Beast — AN INVITATION CAN ONLY EVER ADD A DESTINATION.
--
-- One function replaced. No column, no index, no trigger, no backfill, no hardcoded account id,
-- and nothing on social_connections. Signature and return type are unchanged, so this is a true
-- `create or replace` — there is no window in which the function is missing.
--
-- ── WHAT IT STOPS ───────────────────────────────────────────────────────────────────────────
-- sa_consume_destination_invitation used to look an existing destination up by
-- (owner_user_id, provider, external_account_id) and, when it found one, UPDATE it. Measured in a
-- disposable copy of production, completing an invitation while signed in as the already-connected
-- account did all of this:
--
--     token_secret_id      rotated to a new Vault secret
--     the OLD Vault secret DELETED
--     scopes               2 -> 1, losing instagram_business_manage_comments
--     username / account_type / status   overwritten
--
-- The lost scope is the sharp edge: instagram_business_manage_comments is in
-- INSTAGRAM_ADMIN_SCOPES only, never in the INSTAGRAM_SCOPES the invitation flow writes, so an
-- invitation completed on a comment-managing account silently disables its auto-replies. The
-- admin reconnect path refuses exactly this (resolveGrantedScopes rejects a write that would drop
-- a held scope); the invitation path had no equivalent.
--
-- Posting settings already survived — posting_paused, posts_per_day, stagger_offset_minutes,
-- label and agent_user_id are not in that UPDATE list — so they are not what this is about.
--
-- ── THE CHANGE: THE INVITATION PATH BECOMES INSERT-ONLY ─────────────────────────────────────
-- The UPDATE branch is deleted outright. An invitation now either creates a NEW destination or
-- refuses; it can no longer modify an existing one, and — because v_old_secret is gone with it —
-- it can no longer delete a Vault secret at all. That is a property of the function's text, not
-- of a condition that could be reasoned around.
--
-- ── WHY NO ACCOUNT IS NAMED HERE ────────────────────────────────────────────────────────────
-- The rule is "an invitation never touches a connection that already exists", which protects every
-- account the moment it is connected, including one whose Instagram id nobody knows yet. Pinning
-- specific ids would protect exactly the accounts listed, leave every other one exposed, and would
-- have to be edited whenever an account is added — a maintenance burden that buys nothing the rule
-- does not already give.
--
-- ── INTENTIONAL RECONNECT IS A DIFFERENT DOOR, AND IT IS UNTOUCHED ──────────────────────────
-- sa_connect_instagram, reached from /api/admin/social-autopilot/accounts/instagram/connect, is
-- platform-admin and session-bound and is where a deliberate reconnect belongs. It keeps its
-- update-in-place behaviour, keeps omitting the posting settings from that update, and keeps the
-- resolveGrantedScopes refusal. This migration does not mention it.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────────────────────
-- The lookup below is advisory; social_connections_owner_provider_account_key is the authority.
-- Two overlapping consumes for the same new account both pass the lookup, and the loser used to
-- raise an unhandled unique_violation, which the callback could only render as a generic "please
-- retry". The secret creation and the insert now sit inside one exception block, so the loser
-- rolls that subtransaction back — no row, NO ORPHANED VAULT SECRET — and returns the same honest
-- 'already_connected' the sequential case returns.

create or replace function public.sa_consume_destination_invitation(
  p_token_hash text, p_external_account_id text, p_username text, p_account_type text,
  p_scopes text[], p_token text, p_expires_at timestamptz
) returns table(status text, connection_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r          public.social_destination_invitations%rowtype;
  v_owner    uuid;
  v_secret   uuid;
  v_conn     uuid;
  v_other    uuid;
  v_existing uuid;
  v_provider text;
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

  -- Already connected to a DIFFERENT owner. Unchanged.
  select sc.id into v_other
    from public.social_connections sc
   where sc.provider = v_provider
     and sc.external_account_id = p_external_account_id
     and sc.owner_user_id <> v_owner
   limit 1;
  if v_other is not null then return query select 'account_taken'::text, null::uuid; return; end if;

  -- ── THE NEW REFUSAL ───────────────────────────────────────────────────────────────────────
  -- Already connected to THIS owner. Identity is the immutable external_account_id Meta returned,
  -- never the username — the handle is a label and can be changed by its owner at any time.
  -- This sits above every write: nothing below has run, so the connection, its Vault secret, its
  -- scopes, its posting settings and its auto-reply configuration are all exactly as they were,
  -- used_at is still null, and the recipient can switch accounts and reopen the same link.
  select sc.id into v_existing
    from public.social_connections sc
   where sc.owner_user_id = v_owner
     and sc.provider = v_provider
     and sc.external_account_id = p_external_account_id;
  if v_existing is not null then
    return query select 'already_connected'::text, null::uuid; return;
  end if;

  -- Secret and row together in one exception block: see CONCURRENCY above. A unique_violation
  -- rolls this subtransaction back, so the secret created a line earlier goes with it.
  begin
    v_secret := vault.create_secret(
      p_token,
      'social:' || v_provider || ':' || v_owner::text || ':' || p_external_account_id || ':' ||
        extract(epoch from clock_timestamp())::bigint::text,
      initcap(v_provider) || ' access token (Beast Social destination)'
    );

    insert into public.social_connections
      (owner_user_id, provider, external_account_id, username, account_type, status, scopes,
       token_secret_id, token_expires_at, label, agent_user_id, updated_at)
    values
      (v_owner, v_provider, p_external_account_id, p_username, p_account_type, 'connected', p_scopes,
       v_secret, p_expires_at, r.label, r.agent_user_id, now())
    returning id into v_conn;
  exception when unique_violation then
    return query select 'already_connected'::text, null::uuid; return;
  end;

  update public.social_destination_invitations
     set used_at = now(), consumed_connection_id = v_conn
   where id = r.id;

  return query select 'connected'::text, v_conn;
end $function$;
