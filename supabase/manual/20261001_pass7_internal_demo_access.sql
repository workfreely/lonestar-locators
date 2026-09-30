-- ════════════════════════════════════════════════════════════════════════════
-- PASS 7 (SQL HALF) — launch licence eligibility + the internal demo exemption
--
-- PREPARED FOR MANUAL APPLICATION. The migration ledger is out of sync, so
-- `supabase db push` would re-run 51 already-applied migrations against live
-- Property Intelligence data. Apply this by hand in the Supabase SQL Editor for
-- project onwrrajmklxtnabekzcy, as one transaction, then run the verification
-- queries at the bottom. Rollback is at the very end.
--
-- THE RULE this installs, on the WORKSPACE OWNER's profile:
--
--     access  =  ( verified TX licence  OR  internal_demo_access )
--                AND ( existing billing entitlement, unchanged )
--
-- The two halves are ANDed deliberately: billing never bypasses the licence, and
-- the licence never bypasses billing. The demo flag substitutes ONLY for the
-- licence half — Sarah's account still has to satisfy billing like anyone else.
--
-- Four things, in an order that matters (see step 2):
--   1. one nullable-free boolean column, default false
--   2. the ONE-TIME grant for the internal demo account — BEFORE the new trigger
--   3. the existing guard trigger extended so users cannot self-grant the flag
--   4. an owner-only RPC to grant/revoke it, then the access function itself
--
-- It deliberately does NOT: change trial timing, touch Stripe, alter
-- subscription fields, change the service-area RPC, or add an admin bypass to
-- lb_workspace_has_access (see the note in step 5).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Schema ───────────────────────────────────────────────────────────────
-- NOT a second demo flag. profiles.demo_mode already exists but is true on three
-- unrelated accounts and means "show the demo workspace fixtures" — it is not an
-- access grant and must never become one. This column has exactly one meaning.
--
-- NOT NULL DEFAULT false so the predicate never has to reason about null, and so
-- every existing and future row is denied by default.
alter table public.profiles
  add column if not exists internal_demo_access boolean not null default false;

comment on column public.profiles.internal_demo_access is
  'Owner-granted internal demo/training exemption from the Texas licence launch gate. '
  'Substitutes for a verified TX licence ONLY — billing entitlement still applies. '
  'Owner-set only: lb_guard_verified_license blocks user writes; grant via '
  'lb_set_internal_demo_access. Never inferred from email, name, billing or demo_mode.';

-- ── 2. The one-time grant ───────────────────────────────────────────────────
-- ORDER IS LOAD-BEARING. This runs BEFORE step 3 replaces the trigger, because
-- the new trigger blocks every non-admin write to this column — and a SQL Editor
-- session has no auth.uid(), so is_platform_admin() is FALSE there. Run after
-- step 3 and this statement would raise internal_demo_access_readonly.
--
-- Granted by PRIMARY KEY, never by email or name: the requirement is that demo
-- access is explicit and never inferred from a heuristic.
--   23ebb70e-2567-4c87-aacd-f58d3594dc09 = Sarah Mitchell, the permanent internal
--   demo/training account. Her licence stays PENDING — this is precisely so a
--   demo persona never carries a false "verified real estate licence" stamp.
--
-- The `is distinct from true` guard makes the file re-runnable: on a second run
-- the row already matches, no UPDATE fires, and the now-live trigger is never
-- provoked. To RE-grant after a manual revoke, use lb_set_internal_demo_access
-- as the owner rather than re-running this file.
update public.profiles
   set internal_demo_access = true
 where id = '23ebb70e-2567-4c87-aacd-f58d3594dc09'
   and internal_demo_access is distinct from true;

-- ── 3. Guard trigger ────────────────────────────────────────────────────────
-- Replaces the Pass 4 body. ONE change: internal_demo_access joins the set of
-- owner-only columns. Everything else is byte-for-byte the live function.
--
-- The new check sits immediately after the admin early-return and BEFORE the
-- relicensing branch. That position is deliberate — the relicensing branch
-- RETURNS EARLY, so a user could otherwise smuggle `internal_demo_access = true`
-- into the same UPDATE that changes their licence state and have it accepted.
create or replace function public.lb_guard_verified_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The platform owner verifies/rejects, and may correct a mistake.
  if public.is_platform_admin() then
    return new;
  end if;

  -- Owner-granted access exemption. Checked FIRST, before any branch that
  -- returns early, so no other path can carry this flag through.
  if new.internal_demo_access is distinct from old.internal_demo_access then
    raise exception 'internal_demo_access_readonly' using errcode = '42501';
  end if;

  -- Relicensing in a new state: clears the licence AND its verification together.
  -- Verification can only be dropped here, never granted. A fresh start also drops
  -- any stale rejection, so the agent lands cleanly in "unsubmitted".
  if new.license_state is distinct from old.license_state
     and new.license_verified_at is null
     and new.license_number is null
     and auth.uid() = old.id
  then
    new.license_rejected_at      := null;
    new.license_rejection_reason := null;
    return new;
  end if;

  -- Rejection is owner-granted, exactly like verification: a user may neither set
  -- nor clear it. Checked against the SUBMITTED values, before the auto-clear
  -- below, so a genuine correction still works.
  if new.license_rejected_at is distinct from old.license_rejected_at
     or new.license_rejection_reason is distinct from old.license_rejection_reason
  then
    raise exception 'license_rejection_readonly' using errcode = '42501';
  end if;

  if old.license_verified_at is not null then
    -- Frozen while verified: the number, the ISSUING STATE, and the stamp itself.
    -- Other profile columns in the same UPDATE are unaffected.
    if new.license_number is distinct from old.license_number then
      raise exception 'license_verified_locked' using errcode = '42501';
    end if;
    if new.license_state is distinct from old.license_state then
      raise exception 'license_verified_locked' using errcode = '42501';
    end if;
    if new.license_verified_at is distinct from old.license_verified_at then
      raise exception 'license_verification_readonly' using errcode = '42501';
    end if;
  else
    -- Not yet verified: number and state stay editable, but a user must never be
    -- able to mark their OWN licence verified.
    if new.license_verified_at is distinct from old.license_verified_at then
      raise exception 'license_verification_readonly' using errcode = '42501';
    end if;
    -- Correcting the number after a rejection returns the account to Pending. The
    -- TRIGGER owns this, which is why the client never touches these columns.
    if new.license_number is distinct from old.license_number then
      new.license_rejected_at      := null;
      new.license_rejection_reason := null;
    end if;
  end if;

  return new;
end;
$$;

-- ── 4. Owner action ─────────────────────────────────────────────────────────
-- Grant/revoke without hand-writing UPDATEs against the profiles table. Mirrors
-- lb_verify_license exactly: same owner guard as the first statement, same error
-- vocabulary. Returns the resulting value so a caller can confirm the outcome.
create or replace function public.lb_set_internal_demo_access(p_user uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'enabled_required' using errcode = '22023';
  end if;

  update public.profiles
     set internal_demo_access = p_enabled
   where id = p_user
  returning internal_demo_access into v_enabled;

  -- null means NO ROW matched. false is a legitimate result, so this cannot be a
  -- truthiness check.
  if v_enabled is null then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  return v_enabled;
end;
$$;
grant execute on function public.lb_set_internal_demo_access(uuid, boolean) to authenticated;

-- ── 5. The access mirror ────────────────────────────────────────────────────
-- Replaces 20260809000001. The three billing sources are UNCHANGED, character for
-- character; the licence condition is added as a SEPARATE conjunct so the two can
-- never substitute for one another.
--
-- Evaluated against the workspace OWNER (w.created_by), exactly as the billing
-- half already is — entitlement in this product belongs to the workspace owner,
-- not to whoever is reading.
--
-- NO ADMIN BYPASS HERE, on purpose. is_platform_admin() tests the CALLER, while
-- everything else here tests the OWNER; mixing the two would let a platform admin
-- read every workspace's leads through the RLS policies that call this function.
-- The owner does not need it: the verification panel is a SECURITY DEFINER RPC
-- (lb_list_licenses) that does not consult this function at all, so operating
-- verification never depends on it.
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
      -- LICENCE ELIGIBILITY (Pass 7). Must hold on its own — billing cannot
      -- substitute for it.
      and (
        -- The launch rule: a verified licence AND a Texas one. Both required, which
        -- is what the Pass 4 licence-state freeze exists to make trustworthy.
        (p.license_verified_at is not null and p.license_state = 'TX')
        -- The only exemption: an explicit, owner-granted internal demo account.
        -- Never inferred from email, name, billing or demo_mode.
        or p.internal_demo_access
      )
      -- BILLING ENTITLEMENT (unchanged from 20260809000001). Must ALSO hold — a
      -- verified licence cannot substitute for it either.
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

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying.
-- ════════════════════════════════════════════════════════════════════════════
-- a) the column exists, is NOT NULL, defaults false
--    select column_name, is_nullable, column_default
--      from information_schema.columns
--     where table_schema='public' and table_name='profiles'
--       and column_name='internal_demo_access';
--
-- b) EXACTLY ONE account holds the exemption (expect 1)
--    select count(*) from public.profiles where internal_demo_access;
--
-- c) it is the intended account, and its licence was NOT touched
--    (expect internal_demo_access = true, license_verified_at = null)
--    select internal_demo_access, license_verified_at, license_state
--      from public.profiles where id = '23ebb70e-2567-4c87-aacd-f58d3594dc09';
--
-- d) the owner still passes on a REAL verified TX licence, not the exemption
--    (expect internal_demo_access = false, license_verified_at not null, TX)
--    select internal_demo_access, license_verified_at, license_state
--      from public.profiles where license_verified_at is not null;
--
-- e) who gains/loses workspace access under the new rule
--    select p.internal_demo_access,
--           (p.license_verified_at is not null and p.license_state='TX') as licence_ok,
--           count(*) as workspaces,
--           bool_or(public.lb_workspace_has_access(w.id)) as any_access
--      from public.workspaces w
--      join public.profiles p on p.id = w.created_by
--     group by 1,2;
--
-- f) the RPC is owner-only (as a NON-admin this must raise not_authorized)
--    select public.lb_set_internal_demo_access(
--             '23ebb70e-2567-4c87-aacd-f58d3594dc09', true);
--
-- g) the flag is user-readonly. As a NON-admin signed-in user this must raise
--    internal_demo_access_readonly:
--    update public.profiles set internal_demo_access = true where id = auth.uid();

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the exact pre-Pass-7 behaviour.
-- Run top to bottom. The access function is restored FIRST so nothing is
-- evaluating the column by the time it is dropped.
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--
-- -- 5. access function back to 20260809000001 (billing only, no licence condition)
-- create or replace function public.lb_workspace_has_access(ws uuid)
-- returns boolean language sql stable security definer set search_path = public as $$
--   select exists (
--     select 1
--     from public.workspaces w
--     join public.profiles p on p.id = w.created_by
--     where w.id = ws
--       and (
--         p.subscription_status = 'active'
--         or (
--           p.subscription_status = 'trialing'
--           and p.trial_ends_at is not null
--           and p.trial_ends_at > now()
--         )
--         or exists (
--           select 1 from public.network_members nm
--            where nm.user_id = w.created_by and nm.status = 'active'
--         )
--       )
--   );
-- $$;
-- grant execute on function public.lb_workspace_has_access(uuid) to authenticated;
--
-- -- 4. drop the owner action
-- drop function if exists public.lb_set_internal_demo_access(uuid, boolean);
--
-- -- 3. guard trigger back to the Pass 4 body (no internal_demo_access check)
-- create or replace function public.lb_guard_verified_license()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   if public.is_platform_admin() then return new; end if;
--   if new.license_state is distinct from old.license_state
--      and new.license_verified_at is null
--      and new.license_number is null
--      and auth.uid() = old.id
--   then
--     new.license_rejected_at      := null;
--     new.license_rejection_reason := null;
--     return new;
--   end if;
--   if new.license_rejected_at is distinct from old.license_rejected_at
--      or new.license_rejection_reason is distinct from old.license_rejection_reason
--   then
--     raise exception 'license_rejection_readonly' using errcode = '42501';
--   end if;
--   if old.license_verified_at is not null then
--     if new.license_number is distinct from old.license_number then
--       raise exception 'license_verified_locked' using errcode = '42501';
--     end if;
--     if new.license_state is distinct from old.license_state then
--       raise exception 'license_verified_locked' using errcode = '42501';
--     end if;
--     if new.license_verified_at is distinct from old.license_verified_at then
--       raise exception 'license_verification_readonly' using errcode = '42501';
--     end if;
--   else
--     if new.license_verified_at is distinct from old.license_verified_at then
--       raise exception 'license_verification_readonly' using errcode = '42501';
--     end if;
--     if new.license_number is distinct from old.license_number then
--       new.license_rejected_at      := null;
--       new.license_rejection_reason := null;
--     end if;
--   end if;
--   return new;
-- end; $$;
--
-- -- 1. schema (dropping the column discards the demo grant)
-- alter table public.profiles drop column if exists internal_demo_access;
--
-- commit;
