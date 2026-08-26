-- Server-owned account-deletion verification codes.
--
-- Replaces the previous gate, which called
--   updateUser({ email: user.email, nonce })
-- believing that re-setting the user's own email forces GoTrue to verify the
-- emailed nonce. It does not: setting the email to its current value is a
-- no-op, so no email change starts and no reauthentication is demanded. Any
-- code — or none — was accepted, and a throwaway account was destroyed by a
-- request carrying the literal code "000000".
--
-- supabase-js has no "verify a reauthentication nonce on its own" call: the
-- nonce is only checked alongside a password change, which Google-only
-- accounts cannot perform. So the code is ours end to end, which also makes it
-- behave identically for password and Google-only accounts.

-- ── HMAC key ────────────────────────────────────────────────────────────────
-- A 6-digit code has only 10^6 possibilities, so a bare digest would be
-- trivially reversible if the table ever leaked. The stored value is an HMAC
-- keyed from Vault, exactly like the trial fingerprints.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'lb_deletion_code_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'lb_deletion_code_key',
      'HMAC key for account-deletion verification codes'
    );
  end if;
end $$;

create table if not exists public.account_deletion_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  attempts    int  not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz
);

create index if not exists account_deletion_challenges_user_idx
  on public.account_deletion_challenges (user_id, created_at desc);

-- No policies are defined, so RLS denies every anon/authenticated read and
-- write outright. Only service_role (which bypasses RLS) and the SECURITY
-- DEFINER functions below can touch it — the plaintext code never leaves the
-- create call, and the hash is never readable by a client.
alter table public.account_deletion_challenges enable row level security;
revoke all on table public.account_deletion_challenges from anon, authenticated;

-- ── hash helper ─────────────────────────────────────────────────────────────
-- The challenge id is mixed in, so two rows holding the same 6-digit code have
-- different hashes and a stolen hash cannot be replayed against another row.
create or replace function public.lb_deletion_code_hash(p_challenge uuid, p_code text)
returns text
language plpgsql
stable
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'lb_deletion_code_key';
  if v_key is null then
    raise exception 'lb_deletion_code_hash: signing key missing';
  end if;
  return encode(extensions.hmac(p_challenge::text || ':' || p_code, v_key, 'sha256'), 'hex');
end $$;

-- ── issue a challenge ───────────────────────────────────────────────────────
-- p_user_id is supplied by the SERVER from the authenticated session, never by
-- the client: the route reads it from supabase.auth.getUser(). The function is
-- granted to service_role only, so a browser cannot reach it at all.
create or replace function public.lb_create_deletion_challenge(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_recent int;
  v_code   text;
  v_id     uuid;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  if p_user_id is null then
    raise exception 'lb_create_deletion_challenge: user id required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'lb_create_deletion_challenge: no such user';
  end if;

  -- Rate limit issuance: at most 3 codes per 15 minutes per account, so the
  -- endpoint cannot be used to spam someone's inbox.
  select count(*) into v_recent
    from public.account_deletion_challenges
   where user_id = p_user_id
     and created_at > now() - interval '15 minutes';
  if v_recent >= 3 then
    raise exception 'rate_limited';
  end if;

  -- Issuing a new code invalidates every earlier one, so an old message in the
  -- inbox can never be used.
  update public.account_deletion_challenges
     set consumed_at = now()
   where user_id = p_user_id
     and consumed_at is null;

  -- Cryptographically secure: gen_random_bytes, not random().
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  v_id := gen_random_uuid();

  insert into public.account_deletion_challenges (id, user_id, code_hash, expires_at)
  values (v_id, p_user_id, public.lb_deletion_code_hash(v_id, v_code), v_expires);

  -- The plaintext is returned exactly once, to be emailed. It is never stored.
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end $$;

-- ── verify a code ───────────────────────────────────────────────────────────
create or replace function public.lb_verify_deletion_code(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r public.account_deletion_challenges%rowtype;
begin
  if p_user_id is null or coalesce(p_code, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  -- Scoped to this user, so a code issued for another account can never match:
  -- the lookup itself is bound to p_user_id.
  select * into r
    from public.account_deletion_challenges
   where user_id = p_user_id
     and consumed_at is null
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_active_code');
  end if;
  if r.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if r.attempts >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  -- Count the attempt BEFORE comparing, so a wrong guess always costs one even
  -- if the caller disconnects.
  update public.account_deletion_challenges
     set attempts = attempts + 1
   where id = r.id;

  if public.lb_deletion_code_hash(r.id, p_code) <> r.code_hash then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Single use: consumed the moment it succeeds.
  update public.account_deletion_challenges
     set consumed_at = now()
   where id = r.id;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.lb_deletion_code_hash(uuid, text)      from public, anon, authenticated;
revoke all on function public.lb_create_deletion_challenge(uuid)     from public, anon, authenticated;
revoke all on function public.lb_verify_deletion_code(uuid, text)    from public, anon, authenticated;
grant execute on function public.lb_create_deletion_challenge(uuid)  to service_role;
grant execute on function public.lb_verify_deletion_code(uuid, text) to service_role;
