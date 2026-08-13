-- ============================================================================
-- Beast Network — Phase 1 (2/3): Organization-Included entitlement source
-- ============================================================================
-- Adds a THIRD access source to the existing entitlement gate, without touching
-- Stripe or the paid/trial logic. A workspace owner now has CRM access when ANY
-- of these is true:
--   1) Paid subscription      (subscription_status = 'active')
--   2) Live trial             (subscription_status = 'trialing' AND not expired)
--   3) Organization Included  (an ACTIVE network_members row)   ← NEW
--
-- This is the DB half of the source of truth (it backs all CRM-table RLS via
-- lb_workspace_has_access, called with the workspace_id). The TS half lives in
-- lib/billing/access.ts (getAccessState) and is fed the same organization status.
-- Both must agree — that is why this migration and that file ship together.
--
-- IMPORTANT: complimentary members are NOT given a fake subscription_status.
-- 'active'/'trialing' remain Stripe-owned; org access is an independent OR-branch
-- resolved from network_members, so Stripe webhook reconciliation can never
-- clobber it and the paid/trial paths behave exactly as before.
--
-- DEPLOYMENT ORDER: apply AFTER 1/3 (network_members must exist). Additive/safe —
-- it only WIDENS access (adds an OR); no existing owner loses access.

create or replace function public.lb_workspace_has_access(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.profiles p on p.id = w.created_by
    where w.id = ws
      and (
        -- 1) Paid subscription
        p.subscription_status = 'active'
        -- 2) Live trial
        or (
          p.subscription_status = 'trialing'
          and p.trial_ends_at is not null
          and p.trial_ends_at > now()
        )
        -- 3) Organization Included — owner is an ACTIVE verified network member
        or exists (
          select 1
          from public.network_members nm
          where nm.user_id = w.created_by
            and nm.status = 'active'
        )
      )
  );
$$;

grant execute on function public.lb_workspace_has_access(uuid) to authenticated;
