-- Phase 1 of the 90-day retention window: start and clear the CLOCK only.
--
-- The product promises a canceled subscriber that their workspace is kept for
-- 90 days and restored on resubscribe. The restore half was already true — a
-- cancellation changed nothing but subscription_status, so data survived
-- indefinitely. What did not exist was any record of WHEN cancellation
-- happened, so the window could never be measured, and no future cleanup could
-- know what had expired.
--
-- This migration adds that timestamp and nothing else. Deliberately NOT here:
-- automatic deletion, Smart Form slug release, retention cron jobs, and any
-- change to auth users or to the access gate. Access behaviour is untouched —
-- getAccessState still reads only subscription_status and trial_ends_at.

alter table public.profiles
  add column if not exists canceled_at timestamptz;

comment on column public.profiles.canceled_at is
  'When the subscription most recently became canceled; null while active, '
  'trialing, or never canceled. Retention expiry is DERIVED as '
  'canceled_at + interval ''90 days'' rather than stored, so the two can never '
  'drift apart. Maintained by trg_sync_canceled_at.';

-- Maintained by a trigger rather than in the Stripe webhook handler on purpose.
-- subscription_status is written from several paths (reconcileCustomerSubscription,
-- the defensive write in handleSubscriptionDeleted, checkout, and manual admin
-- fixes). A trigger keeps the clock correct for every one of them, including
-- paths added later, instead of relying on each writer to remember.
create or replace function public.lb_sync_canceled_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Only react to an actual status CHANGE. Stripe redelivers events, and
  -- `before update of` fires whenever the column appears in the UPDATE list even
  -- if the value is identical, so without this a duplicate "canceled" delivery
  -- would keep moving the clock forward and silently extend the window.
  if new.subscription_status is distinct from old.subscription_status then
    if new.subscription_status = 'canceled' then
      -- coalesce, not now(): re-entering canceled from an intermediate state
      -- (e.g. canceled -> past_due -> canceled) must not restart the window.
      -- A genuine new cancellation always follows a return to active/trialing,
      -- which clears the column below, so a fresh clock starts correctly.
      new.canceled_at := coalesce(old.canceled_at, now());
    elsif new.subscription_status in ('active', 'trialing') then
      -- Resubscribing (or a trial starting) ends the retention window outright.
      new.canceled_at := null;
    end if;
    -- Every other status (past_due, incomplete, unpaid, …) deliberately leaves
    -- canceled_at as-is: those are billing problems, not the end of the window,
    -- and clearing on them would lose a running clock.
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_canceled_at on public.profiles;
create trigger trg_sync_canceled_at
  before update of subscription_status on public.profiles
  for each row
  execute function public.lb_sync_canceled_at();

-- No backfill. Nobody has canceled yet (production is 4 trialing + 1 null), and
-- inventing a cancellation date for a row we have no evidence about would put a
-- fabricated expiry on a real account.
