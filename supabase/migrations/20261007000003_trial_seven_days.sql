-- Trial length 30 days -> 7 days.
--
-- THE GRANT LIVES IN lb_verify_license, NOT IN A SIGNUP TRIGGER. Pass 8
-- (supabase/manual/20261002_pass8_trial_on_verification.sql) moved it: the trial now begins at
-- LICENSE VERIFICATION, and the three older paths were neutralised. Verified against production
-- rather than inferred from the files:
--
--     grant_trial_on_signup       contains '30 days'?  NO   (neutralised)
--     grant_trial_on_onboarding   contains '30 days'?  NO   (neutralised)
--     lb_verify_license           contains '30 days'?  YES  <- the live grant
--
-- A migration patching grant_trial_on_signup would therefore have been a silent NO-OP: new
-- signups would have kept getting 30 days while every label said 7.
--
-- THE BODY BELOW WAS DUMPED FROM PRODUCTION (pg_get_functiondef), not copied from the Pass 8 file.
-- That file lives in supabase/manual/ and is not in the migrations ledger, so it is not a reliable
-- record of what is actually deployed. Exactly one line differs from the live definition: the
-- grant interval.
--
-- EXISTING TRIALS AND SUBSCRIPTIONS ARE UNTOUCHED. The interval is evaluated only when a trial is
-- granted, so no stored trial_ends_at is recomputed, and nothing here reads or writes
-- stripe_subscription_id or any Stripe object.

begin;

CREATE OR REPLACE FUNCTION public.lb_verify_license(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

        v_ends := now() + interval '7 days';
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
$function$;

grant execute on function public.lb_verify_license(uuid) to authenticated;

commit;
