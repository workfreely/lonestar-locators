-- ============================================================================
-- Account Deletion (1/2): HMAC trial fingerprints
-- ============================================================================
-- Deleting an account must not delete the anti-abuse trial ledger, or
-- "delete, sign up again" becomes an unlimited free-trial machine. But keeping
-- a raw email and phone forever for someone who asked to be forgotten is more
-- personal data than the purpose needs.
--
-- Fingerprints solve both: equality matching is all the check ever does, and a
-- keyed hash preserves that exactly while the plaintext goes away.
--
-- HMAC, not a plain salted hash: the input space (an email address) is
-- enumerable, so anyone holding the table could confirm a guess against a bare
-- SHA-256. Without the key an HMAC is not verifiable.
--
-- The key lives in Supabase Vault and is readable ONLY inside SECURITY DEFINER
-- functions. It is never in app code, an env var, or argv.
--
-- ORDERING NOTE — enforcement must never lapse. This migration adds the
-- fingerprint columns, backfills them, and adds their unique constraints while
-- the ORIGINAL email/phone columns and their unique constraints remain live and
-- authoritative. Both are enforced simultaneously. Dropping the plaintext is a
-- LATER migration, only after the new path is verified in production.
-- ============================================================================

-- ── 1. The key ──────────────────────────────────────────────────────────────
-- create_secret is idempotent for our purposes: we only create when absent, so
-- re-running never rotates the key (which would orphan every existing
-- fingerprint and silently re-grant trials to prior users).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'lb_trial_fingerprint_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'lb_trial_fingerprint_key',
      'HMAC key for trial_usage email/phone fingerprints. Rotating it invalidates every existing fingerprint and re-grants trials to prior users. Do not rotate.'
    );
  end if;
end $$;

-- ── 2. Fingerprint helper ───────────────────────────────────────────────────
-- `kind` is prefixed into the HMAC input so a 10-digit phone string can never
-- collide with an email fingerprint.
create or replace function public.lb_trial_fp(p_kind text, p_value text)
returns text
language plpgsql
stable
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_key text;
  v_norm text;
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  v_norm := case p_kind
              when 'email' then lower(btrim(p_value))
              when 'phone' then public.lb_normalize_phone(p_value)
              else null
            end;
  if v_norm is null then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'lb_trial_fingerprint_key';

  if v_key is null then
    -- Fail loudly. Returning null here would silently disable dedupe.
    raise exception 'lb_trial_fp: fingerprint key missing from vault';
  end if;

  return encode(extensions.hmac(p_kind || ':' || v_norm, v_key, 'sha256'), 'hex');
end $$;

revoke all on function public.lb_trial_fp(text, text) from public, anon, authenticated;

-- ── 3. Columns + backfill, while plaintext stays authoritative ──────────────
alter table public.trial_usage add column if not exists email_fp text;
alter table public.trial_usage add column if not exists phone_fp text;

update public.trial_usage
   set email_fp = public.lb_trial_fp('email', email),
       phone_fp = public.lb_trial_fp('phone', phone)
 where email_fp is null or (phone is not null and phone_fp is null);

-- Mirrors the existing constraints exactly: email unique, phone unique when present.
create unique index if not exists trial_usage_email_fp_key on public.trial_usage (email_fp);
create unique index if not exists trial_usage_phone_fp_key on public.trial_usage (phone_fp) where phone_fp is not null;

-- ── 4. Keep fingerprints in step with plaintext automatically ───────────────
-- Belt and braces during the transition: any writer that still sets only the
-- plaintext columns gets correct fingerprints anyway.
create or replace function public.lb_trial_usage_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.email_fp := public.lb_trial_fp('email', new.email);
  new.phone_fp := public.lb_trial_fp('phone', new.phone);
  return new;
end $$;

revoke all on function public.lb_trial_usage_fingerprint() from public, anon, authenticated;

drop trigger if exists trg_trial_usage_fingerprint on public.trial_usage;
create trigger trg_trial_usage_fingerprint
  before insert or update of email, phone on public.trial_usage
  for each row execute function public.lb_trial_usage_fingerprint();

-- ── 5. Replace the app's direct plaintext query ─────────────────────────────
-- /api/billing/start-trial currently filters trial_usage by plaintext email and
-- phone over PostgREST. That cannot survive the plaintext columns going away
-- without putting the HMAC key in the app, so the lookup moves in here and the
-- key stays in exactly one place.
create or replace function public.lb_trial_already_used(p_email text, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.trial_usage tu
    where tu.email_fp = public.lb_trial_fp('email', p_email)
       or (public.lb_trial_fp('phone', p_phone) is not null
           and tu.phone_fp = public.lb_trial_fp('phone', p_phone))
  );
$$;

revoke all on function public.lb_trial_already_used(text, text) from public, anon;
grant execute on function public.lb_trial_already_used(text, text) to service_role;
