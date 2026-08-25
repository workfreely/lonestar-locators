-- ============================================================================
-- Trial architecture correction: grant the 30-day trial at SIGNUP, not at the
-- end of onboarding.
-- ============================================================================
-- PRODUCT RULE: every eligible new user starts a 30-day free trial on first
-- successful signup. There is no in-app "Start Free Trial" decision.
--
-- WHY THIS EXISTS. The trial was granted by trg_grant_trial_on_onboarding, a
-- BEFORE UPDATE trigger firing on the onboarding_completed false→true
-- transition — i.e. at the END of onboarding. Between signup and that moment a
-- fresh account had subscription_status = null and trial_started_at = null, so
-- getAccessState() returned DENY / no_subscription for the entire onboarding
-- session. Only the middleware's `if (!profile.onboarding_completed) return
-- null` bypass kept those users out of /billing, and every entitlement surface
-- WITHOUT that bypass (Academy, the Companion, /admin/billing) denied them.
-- That bypass was also a hole in the other direction: an account that never
-- finished onboarding had unlimited /admin access with no trial at all.
--
-- Granting at signup makes the entitlement real from the first authenticated
-- request, so the onboarding bypass stops being load-bearing.
--
-- ── One trial per person is PRESERVED, in two parts ────────────────────────
-- Email is checkable at signup; phone is NOT — profiles.phone_number is
-- collected later, in onboarding Step 1. So the single email-or-phone check
-- that used to happen once (at onboarding completion, when both were known)
-- necessarily splits in two:
--
--   1. AT SIGNUP  — dedupe on email, grant, and claim the email in the ledger.
--   2. WHEN A PHONE FIRST APPEARS — if that phone already consumed a trial
--      under a different account, REVOKE the signup trial; otherwise claim the
--      phone on this account's existing ledger row.
--
-- Net effect is identical to before: one trial per email, and one per phone.
-- The only difference is that a phone-based denial now happens a few minutes
-- later (when the number is typed) instead of at the end of onboarding.
-- ============================================================================

-- ── 1. Grant at signup ──────────────────────────────────────────────────────
create or replace function public.grant_trial_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  -- Defensive: never touch a row that somehow already carries billing state.
  if new.trial_started_at is not null or new.subscription_status is not null then
    return new;
  end if;

  -- handle_new_user() inserts this row inside the auth.users insert
  -- transaction, so the user row is visible here.
  select lower(trim(u.email)) into v_email from auth.users u where u.id = new.id;
  if v_email is null then
    return new; -- nothing to ledger against; the onboarding trigger still covers it
  end if;

  -- One trial per email, ever. Phone is claimed later (see part 2) because it
  -- does not exist yet at signup.
  begin
    insert into public.trial_usage (email, user_id) values (v_email, new.id);
  exception when unique_violation then
    return new; -- email already consumed a trial → no grant; billing gate applies
  end;

  new.trial_started_at    := now();
  new.trial_ends_at       := now() + interval '30 days';
  new.subscription_status := 'trialing';
  return new;
end $$;

drop trigger if exists trg_grant_trial_on_signup on public.profiles;
create trigger trg_grant_trial_on_signup
  before insert on public.profiles
  for each row
  execute function public.grant_trial_on_signup();

-- ── 2. Enforce the phone half once a phone becomes known ────────────────────
create or replace function public.enforce_trial_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_owner uuid;
begin
  v_phone := public.lb_normalize_phone(new.phone_number);
  if v_phone is null then
    return new;
  end if;

  select tu.user_id into v_owner
  from public.trial_usage tu
  where tu.phone = v_phone
  limit 1;

  if v_owner is not null and v_owner is distinct from new.id then
    -- This phone already consumed a trial under a different account. Revoke the
    -- signup trial — but ONLY while it is still an unpaid trial, so a paying
    -- customer can never be downgraded by typing a shared number.
    if new.subscription_status = 'trialing' then
      new.subscription_status := null;
      new.trial_ends_at       := now();  -- reads as trial_expired → routed to /billing
    end if;
    return new;
  end if;

  -- Free, or already ours → claim it on this account's ledger row.
  begin
    update public.trial_usage
       set phone = v_phone
     where user_id = new.id
       and phone is null;
  exception when unique_violation then
    null; -- lost a race; the row above already owns it
  end;

  return new;
end $$;

drop trigger if exists trg_enforce_trial_phone on public.profiles;
create trigger trg_enforce_trial_phone
  before update of phone_number on public.profiles
  for each row
  when (new.phone_number is distinct from old.phone_number)
  execute function public.enforce_trial_phone();

-- ── 3. grant_trial_on_onboarding stays, as an inert safety net ──────────────
-- It is guarded on `trial_started_at is null and subscription_status is null`,
-- which a signup-granted account never satisfies, so it no-ops. It is kept, not
-- dropped, so an account created before this migration (or one whose signup
-- grant was skipped for a missing email) is still covered on completion.
