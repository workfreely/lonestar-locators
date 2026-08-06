-- Milestone B — atomic authorization-code EXCHANGE (mandatory clarification).
--
-- Replaces the consume-only companion_consume_auth_code with a single function
-- that, in ONE transaction, consumes the code AND creates the connection + the
-- initial refresh token + the initial access token. There is no consume-then-
-- app-insert window: if any step fails, the whole thing rolls back and no code
-- is consumed and no token is issued.
--
-- The trusted server route MINTS the raw tokens and passes only their sha256
-- HASHES here — raw tokens never cross the DB boundary, and the DB stores hashes
-- only. SECURITY DEFINER + fixed search_path; service_role-only (revoked from
-- public → anon/authenticated cannot call it).

drop function if exists public.companion_consume_auth_code(text, text, text, text);

create or replace function public.companion_exchange_auth_code(
  p_code_hash          text,
  p_computed_challenge text,        -- Node-computed S256(verifier); PKCE enforced in the WHERE
  p_extension_id       text,
  p_state              text,
  p_refresh_hash       text,        -- sha256 of the server-minted refresh secret
  p_refresh_expires    timestamptz,
  p_access_hash        text,        -- sha256 of the server-minted access secret
  p_access_expires     timestamptz,
  p_label              text
)
returns table (status text, connection_id uuid, user_id uuid, workspace_id uuid, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_wsid   uuid;
  v_scopes text[];
  v_conn   uuid;
  v_family uuid;
begin
  -- Basic input validation (defense in depth; the route validates too).
  if p_code_hash is null or p_computed_challenge is null or p_extension_id is null
     or p_state is null or p_refresh_hash is null or p_access_hash is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::text[]; return;
  end if;

  -- Atomic single-use consume (+ PKCE / state / extension / expiry all in WHERE).
  update public.companion_auth_codes c
     set consumed_at = now()
   where c.code_hash = p_code_hash
     and c.consumed_at is null
     and c.expires_at > now()
     and c.extension_id = p_extension_id
     and c.state = p_state
     and c.code_challenge = p_computed_challenge
  returning c.user_id, c.workspace_id, c.scopes
    into v_uid, v_wsid, v_scopes;

  if v_uid is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid, null::text[]; return;
  end if;

  -- Same transaction: connection + initial refresh + initial access.
  insert into public.companion_connections (user_id, workspace_id, extension_id, scopes, label, last_used_at)
    values (v_uid, v_wsid, p_extension_id, v_scopes, p_label, now())
    returning id into v_conn;

  v_family := gen_random_uuid();
  insert into public.companion_refresh_tokens (connection_id, family_id, token_hash, expires_at)
    values (v_conn, v_family, p_refresh_hash, p_refresh_expires);
  insert into public.companion_access_tokens (connection_id, token_hash, expires_at)
    values (v_conn, p_access_hash, p_access_expires);

  return query select 'ok'::text, v_conn, v_uid, v_wsid, v_scopes;
end;
$$;

revoke all on function public.companion_exchange_auth_code(text, text, text, text, text, timestamptz, text, timestamptz, text) from public;
grant execute on function public.companion_exchange_auth_code(text, text, text, text, text, timestamptz, text, timestamptz, text) to service_role;
