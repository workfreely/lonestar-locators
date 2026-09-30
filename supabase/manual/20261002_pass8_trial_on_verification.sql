-- ════════════════════════════════════════════════════════════════════════════
-- PASS 8 (SQL HALF) — the 30-day trial begins at LICENCE VERIFICATION
--
-- PREPARED FOR MANUAL APPLICATION. The migration ledger is out of sync, so
-- `supabase db push` would re-run 51 already-applied migrations against live
-- Property Intelligence data. Apply by hand in the Supabase SQL Editor for
-- project onwrrajmklxtnabekzcy, as one transaction, then run the verification
-- queries at the bottom. Rollback is at the very end.
--
-- LIFECYCLE CHANGE:
--   before:  signup → 30-day trial starts immediately → expires during review
--   after:   signup → onboarding → pending → VERIFIED TX → 30-day trial starts
--
-- THREE paths grant a trial today, not one. Neutralising only the signup trigger
-- would silently relocate the grant to onboarding completion rather than remove
-- it, because the other two fire there:
--   1. trg_grant_trial_on_signup       BEFORE INSERT on profiles   — step 1 here
--   2. trg_grant_trial_on_onboarding   BEFORE UPDATE on profiles   — step 2 here
--      (documented as "inert", and it IS today only because the signup trigger
--       always front-runs it. Remove step 1 alone and its own guard —
--       trial_started_at is null and subscription_status is null — becomes TRUE
--       for every new account at onboarding completion. It would become the
--       active granter.)
--   3. POST /api/billing/start-trial, awaited by OnboardingWizard.finish()
--      — TypeScript, neutralised in the app half AFTER this SQL is live.
--
-- RETURN SHAPE CHANGE. lb_verify_license returned a bare timestamptz. It now
-- returns jsonb: { verified_at, trial_granted, trial_ends_at }. The app needs
-- trial_granted to decide whether to send the trial-started email, and it must
-- come from the SAME transaction — re-querying afterwards cannot distinguish
-- "this Verify granted a trial" from "a trial already existed", which is exactly
-- the re-verification case that must NOT resend the email.
--
-- The ARGUMENT signature (p_user uuid) is deliberately unchanged, which is what
-- keeps existing callers safe across the deploy window — see the note above the
-- drop in step 3.
--
-- It deliberately does NOT: change trial LENGTH (30 days), touch Stripe, alter
-- pricing, rewrite any existing trial row, or clear any trial_usage ledger entry.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Stop granting at signup ──────────────────────────────────────────────
-- Neutralised in place rather than dropped: the trigger keeps its name and
-- attachment, so rollback is a single function body swap and nothing else in the
-- schema has to be re-created. A new profile now begins with
-- subscription_status = null and trial_started_at = null, which is exactly the
-- state the grant below requires.
create or replace function public.grant_trial_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- PASS 8: intentionally inert. The trial is granted by lb_verify_license when a
  -- real Texas licence is verified. Kept attached so the rollback at the bottom of
  -- this file restores the old behaviour by replacing this body alone.
  return new;
end $$;

-- ── 2. Stop granting at onboarding completion ───────────────────────────────
-- THE ONE THAT WOULD HAVE BITTEN. See the header: this is only dormant today
-- because signup always granted first. With step 1 inert, its guard would match
-- every newly onboarded account and it would grant the very trial this pass is
-- moving.
create or replace function public.grant_trial_on_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- PASS 8: intentionally inert, for the same reason as grant_trial_on_signup.
  return new;
end $$;

-- ── 3. Grant at verification, in the SAME transaction ───────────────────────
-- Replaces the Pass 4 body. The verification half is byte-for-byte unchanged;
-- the trial activation and the structured return are new.
--
-- One transaction on purpose: the caller cannot observe a verified licence
-- without its trial, so middleware can never bounce a freshly-verified user to
-- /billing because the grant had not committed yet, and the email decision is
-- made from the same committed facts. A failure anywhere rolls back BOTH.
--
-- WHY THE DROP, AND WHY IT IS SAFE.
-- Postgres refuses `create or replace` when the return type changes, so the
-- function must be dropped and recreated — the same pattern Pass 4 used for
-- lb_list_licenses. Two things make this safe across the SQL→app deploy window:
--
--   1. The ARGUMENT signature (p_user uuid) is identical, so PostgREST resolves
--      supabase.rpc("lb_verify_license", { p_user }) exactly as before. Only the
--      RESPONSE BODY changes, from a bare scalar to a JSON object.
--   2. Both production callers discard the payload —
--        app/admin/license-verification/_components/LicensePanel.tsx  (line 55)
--        app/admin/network/_components/ApprovalsPanel.tsx             (line 29)
--      each destructures `const { error } = await supabase.rpc(...)`. Neither
--      reads the return value, so the currently-deployed app keeps working
--      unchanged the moment this lands, and keeps working if the app deploy is
--      delayed or rolled back.
--
-- The drop and create are in ONE transaction, so no concurrent statement can
-- ever see the function missing.
--
-- WHY jsonb RATHER THAN `returns table`.
-- A table return would make trial_ends_at an OUT parameter, i.e. a plpgsql
-- variable whose name collides with profiles.trial_ends_at inside this very
-- function. That resolves correctly today only because an UPDATE SET target is
-- parsed as a column — a subtlety this function should not depend on. jsonb has
-- no OUT parameters, so the collision cannot exist, and the client reads one
-- object instead of a single-row array.
drop function if exists public.lb_verify_license(uuid);
create or replace function public.lb_verify_license(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at      timestamptz;
  v_state   text;
  v_sub     text;
  v_started timestamptz;
  v_email   text;
  v_phone   text;
  -- Never null. `false` is the answer for every path that does not grant, so the
  -- caller never has to interpret an absent value.
  v_granted boolean := false;
  v_ends    timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.profiles
     set license_verified_at      = coalesce(license_verified_at, now()),
         license_rejected_at      = null,
         license_rejection_reason = null
   where id = p_user
     and nullif(trim(coalesce(license_number, '')), '') is not null
  returning license_verified_at, license_state, subscription_status, trial_started_at
       into v_at, v_state, v_sub, v_started;

  if v_at is null then
    raise exception 'license_number_missing' using errcode = '22023';
  end if;

  -- ── PASS 8: trial activation ──────────────────────────────────────────────
  -- Every condition must hold. Any one failing means the licence is still
  -- verified, no trial is granted, and trial_granted comes back false —
  -- verification is never blocked by trial ineligibility.
  --
  --   v_state = 'TX'      the Texas launch trial, matching the Pass 7 gate. A
  --                       verified out-of-state licence gets no trial.
  --   v_started is null   a trial was never granted. Re-verifying is therefore
  --                       idempotent: it can neither restart nor extend one, and
  --                       reports trial_granted = false so no email is resent.
  --   v_sub is null       no billing history at all. This is the tightest of the
  --                       guards and the one protecting real customers: 'active'
  --                       stays paid and is never downgraded to 'trialing';
  --                       'canceled' / 'past_due' / 'trialing' all mean this
  --                       person has been through billing already.
  --
  -- internal_demo_access is deliberately ABSENT. It is a licence-GATE exemption,
  -- not evidence of verification, and must never mint a real trial or an email.
  if v_state = 'TX'
     and v_started is null
     and v_sub is null
  then
    select lower(trim(u.email)) into v_email from auth.users u where u.id = p_user;
    select public.lb_normalize_phone(p.phone_number) into v_phone
      from public.profiles p where p.id = p_user;

    -- The EXISTING anti-abuse ledger, unchanged and still authoritative. No
    -- second ledger, no bypass. Checking here is strictly better than the old
    -- signup check could manage: by verification time the phone number is known,
    -- so both halves of "one trial per person" are tested at once instead of
    -- email now and phone later.
    if v_email is not null and not public.lb_trial_already_used(v_email, v_phone) then
      begin
        insert into public.trial_usage (email, phone, user_id)
        values (v_email, v_phone, p_user);

        v_ends := now() + interval '30 days';
        update public.profiles
           set trial_started_at    = now(),
               trial_ends_at       = v_ends,
               subscription_status = 'trialing'
         where id = p_user;

        -- Set LAST, so any failure above leaves it false and the email is not sent.
        v_granted := true;
      exception when unique_violation then
        -- Lost a race, or this person already consumed a trial under another
        -- account. No grant, no email. The licence stays verified; billing routes
        -- them to /billing to subscribe.
        v_granted := false;
        v_ends    := null;
      end;
    end if;
  end if;

  -- trial_ends_at is returned ONLY for a trial this call actually granted, so the
  -- caller can never mistake an existing trial's date for a new one.
  return jsonb_build_object(
    'verified_at',   v_at,
    'trial_granted', v_granted,
    'trial_ends_at', v_ends
  );
end;
$$;
grant execute on function public.lb_verify_license(uuid) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying.
-- ════════════════════════════════════════════════════════════════════════════
-- a) both signup-era granters are inert (expect 'return new;' and no 'interval')
--    select proname,
--           prosrc ilike '%interval%' as still_grants
--      from pg_proc
--     where proname in ('grant_trial_on_signup','grant_trial_on_onboarding');
--
-- b) the verification RPC now carries the grant AND returns jsonb (expect true, jsonb)
--    select prosrc ilike '%trial_usage%' and prosrc ilike '%30 days%' as grants,
--           pg_get_function_result(oid) as returns
--      from pg_proc where proname = 'lb_verify_license';
--
-- c) NOTHING was rewritten — every existing profile keeps the trial dates it had
--    (expect 5 rows, all trial_started_at unchanged from before this migration)
--    select id, subscription_status, trial_started_at, trial_ends_at
--      from public.profiles order by created_at;
--
-- d) the anti-abuse ledger is untouched (expect 5 rows, same created_at values)
--    select user_id, created_at, email is not null as has_email,
--           phone is not null as has_phone
--      from public.trial_usage order by created_at;
--
-- e) every existing account is already IN the ledger, so none of them can be
--    granted a second trial by a future Verify (expect 0)
--    select count(*) from public.profiles p
--     where not exists (select 1 from public.trial_usage tu where tu.user_id = p.id);

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the exact pre-Pass-8 behaviour.
-- Three function bodies, no schema change, so this is a clean revert. Any trial
-- granted by verification while Pass 8 was live STAYS granted (rolling back the
-- code must not confiscate access someone is already using); its ledger row also
-- stays, which is correct — that trial really was consumed.
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--
-- -- 3. lb_verify_license back to the Pass 4 body (verification only, no trial).
-- --    The drop is required again: jsonb -> timestamptz is a return-type change.
-- drop function if exists public.lb_verify_license(uuid);
-- create or replace function public.lb_verify_license(p_user uuid)
-- returns timestamptz language plpgsql security definer set search_path = public as $$
-- declare v_at timestamptz;
-- begin
--   if not public.is_platform_admin() then
--     raise exception 'not_authorized' using errcode = '42501';
--   end if;
--   update public.profiles
--      set license_verified_at      = coalesce(license_verified_at, now()),
--          license_rejected_at      = null,
--          license_rejection_reason = null
--    where id = p_user
--      and nullif(trim(coalesce(license_number, '')), '') is not null
--   returning license_verified_at into v_at;
--   if v_at is null then
--     raise exception 'license_number_missing' using errcode = '22023';
--   end if;
--   return v_at;
-- end; $$;
-- grant execute on function public.lb_verify_license(uuid) to authenticated;
--
-- -- 2. grant_trial_on_onboarding back to 20260730000001
-- create or replace function public.grant_trial_on_onboarding()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- declare v_email text; v_rows int;
-- begin
--   if new.onboarding_completed is true
--      and old.onboarding_completed is distinct from true
--      and new.trial_started_at is null
--      and new.subscription_status is null then
--     select lower(u.email) into v_email from auth.users u where u.id = new.id;
--     if v_email is null then return new; end if;
--     insert into public.trial_usage (email, user_id) values (v_email, new.id)
--       on conflict (email) do nothing;
--     get diagnostics v_rows = row_count;
--     if v_rows > 0 then
--       new.trial_started_at    := now();
--       new.trial_ends_at       := now() + interval '30 days';
--       new.subscription_status := 'trialing';
--     end if;
--   end if;
--   return new;
-- end $$;
--
-- -- 1. grant_trial_on_signup back to 20260829000000
-- create or replace function public.grant_trial_on_signup()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- declare v_email text;
-- begin
--   if new.trial_started_at is not null or new.subscription_status is not null then
--     return new;
--   end if;
--   select lower(trim(u.email)) into v_email from auth.users u where u.id = new.id;
--   if v_email is null then return new; end if;
--   begin
--     insert into public.trial_usage (email, user_id) values (v_email, new.id);
--   exception when unique_violation then
--     return new;
--   end;
--   new.trial_started_at    := now();
--   new.trial_ends_at       := now() + interval '30 days';
--   new.subscription_status := 'trialing';
--   return new;
-- end $$;
--
-- commit;
