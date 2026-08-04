-- ============================================================================
-- Billing pre-launch (2/2): atomic, server-side trial grant on onboarding
-- ============================================================================
-- Replaces the best-effort client-side trial-start with a DB trigger, so the
-- 30-day free trial is granted in the SAME transaction that first persists
-- completed onboarding — no network round-trip that can fail or be skipped.
--
-- Properties:
--   • Atomic     — BEFORE UPDATE trigger sets the trial fields on the same row
--                  write that marks onboarding complete (one commit).
--   • Server-side— fires in the DB regardless of which client made the update;
--                  SECURITY DEFINER so it can write the service-role-only
--                  trial_usage ledger.
--   • Idempotent — only fires on the transition into completed onboarding and
--                  only when no trial/subscription already exists, so retries
--                  never reset or extend an existing trial.
--   • Abuse-safe — the trial_usage ledger (one trial per email, ever) is
--                  enforced here; a reused email gets no second trial and is
--                  routed to /billing to subscribe.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).
-- The /api/billing/start-trial route remains as a manual fallback and shares
-- the same ledger, so the two mechanisms can never double-grant.

create or replace function public.grant_trial_on_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_rows  int;
begin
  -- Only on the transition INTO completed onboarding, and only when there is no
  -- existing trial or subscription (idempotent — never resets/extends).
  if new.onboarding_completed is true
     and old.onboarding_completed is distinct from true
     and new.trial_started_at is null
     and new.subscription_status is null then

    select lower(u.email) into v_email from auth.users u where u.id = new.id;
    if v_email is null then
      return new; -- no email to ledger against; /billing fallback can grant later
    end if;

    -- Abuse ledger: one trial per email, ever. Insert-only.
    insert into public.trial_usage (email, user_id)
    values (v_email, new.id)
    on conflict (email) do nothing;
    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      -- 30-day trial (mirrors TRIAL_LENGTH_DAYS in lib/billing/trial.ts).
      new.trial_started_at    := now();
      new.trial_ends_at       := now() + interval '30 days';
      new.subscription_status := 'trialing';
    end if;
    -- else: this email already used its trial → no grant; the billing gate
    -- routes them to /billing to subscribe.
  end if;

  return new;
end $$;

drop trigger if exists trg_grant_trial_on_onboarding on public.profiles;
create trigger trg_grant_trial_on_onboarding
  before update on public.profiles
  for each row
  execute function public.grant_trial_on_onboarding();
