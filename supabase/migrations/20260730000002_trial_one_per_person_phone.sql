-- ============================================================================
-- Billing pre-launch: one free trial per PERSON (email OR phone)
-- ============================================================================
-- Extends the trial_usage abuse ledger to also dedupe on phone number, so the
-- same person can't get a second free trial with a different email. Email
-- remains the primary key of identity; phone is an additional match "when
-- available" (many accounts won't have a usable phone, and that's fine).
--
-- Kept deliberately simple/reliable (no device fingerprinting / IP blocking):
--   • email is normalized to lower(trim()).
--   • phone is normalized to its last 10 digits (US-centric, good enough for
--     matching); null when there aren't enough digits.
--   • a trial is denied if EITHER the email OR the normalized phone already
--     appears in the ledger.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).
-- Additive/safe — existing single-column (email) ledger rows keep working.

alter table public.trial_usage add column if not exists phone text;

-- One trial per phone (when present). Partial unique so many null phones are fine.
create unique index if not exists trial_usage_phone_key
  on public.trial_usage (phone)
  where phone is not null;

-- Shared phone normalizer (also used by the app's start-trial fallback via its
-- own JS mirror). Last 10 digits, or null if fewer than 10.
create or replace function public.lb_normalize_phone(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '')
$$;

-- Replace the onboarding trial-grant trigger to dedupe on email OR phone.
create or replace function public.grant_trial_on_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_phone  text;
  v_exists boolean;
begin
  -- Only on the transition INTO completed onboarding, and only when there is no
  -- existing trial or subscription (idempotent — never resets/extends).
  if new.onboarding_completed is true
     and old.onboarding_completed is distinct from true
     and new.trial_started_at is null
     and new.subscription_status is null then

    select lower(trim(u.email)) into v_email from auth.users u where u.id = new.id;
    if v_email is null then
      return new; -- no email to ledger against; /billing fallback can grant later
    end if;

    v_phone := public.lb_normalize_phone(new.phone_number);

    -- One trial per person: same email OR same phone (when available).
    select exists (
      select 1 from public.trial_usage tu
      where tu.email = v_email
         or (v_phone is not null and tu.phone = v_phone)
    ) into v_exists;

    if v_exists then
      return new; -- already used → no grant; the billing gate routes to /billing
    end if;

    -- Insert-only ledger. The unique constraints (email, phone) also protect
    -- against a race — if a concurrent insert wins, treat it as already used.
    begin
      insert into public.trial_usage (email, phone, user_id)
      values (v_email, v_phone, new.id);
    exception when unique_violation then
      return new;
    end;

    -- 30-day trial (mirrors TRIAL_LENGTH_DAYS in lib/billing/trial.ts).
    new.trial_started_at    := now();
    new.trial_ends_at       := now() + interval '30 days';
    new.subscription_status := 'trialing';
  end if;

  return new;
end $$;
