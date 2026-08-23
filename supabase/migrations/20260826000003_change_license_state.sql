-- ── Changing your license state after verification ──────────────────────────
--
-- An agent works in ONE state. When they move, their markets and Smart Lead Form
-- follow — and so must their license: a Texas licence says nothing about their
-- right to practise in Arizona. Today that move is impossible for a verified
-- user, because lb_guard_verified_license (correctly) freezes both the licence
-- number and the verification stamp against any non-admin write.
--
-- WHY THE TRIGGER MUST LEARN ABOUT THIS, RATHER THAN BE BYPASSED
-- A SECURITY DEFINER function does NOT skip triggers — the guard fires for its
-- UPDATE exactly as it would for a direct one. So the guard is taught to
-- recognise one specific, self-evidently safe transition instead of being
-- weakened or worked around with a session flag.
--
-- THE PERMITTED TRANSITION — all four conditions, together:
--   1. license_state actually changes, AND
--   2. license_verified_at is being set to NULL   (cleared, never set), AND
--   3. license_number is being set to NULL        (cleared, never set), AND
--   4. the row belongs to the caller
--
-- This can only ever REMOVE trust. There is no combination of inputs that lets a
-- user mark themselves verified — condition 2 requires NULL — so the escalation
-- the original guard exists to prevent remains impossible. Every other update
-- path keeps the previous protections byte for byte.

create or replace function public.lb_guard_verified_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The platform owner is the one who verifies, and may correct a mistake.
  if public.is_platform_admin() then
    return new;
  end if;

  -- Relicensing in a new state: clears the licence AND its verification together.
  -- Verification can only be dropped here, never granted.
  if new.license_state is distinct from old.license_state
     and new.license_verified_at is null
     and new.license_number is null
     and auth.uid() = old.id
  then
    return new;
  end if;

  if old.license_verified_at is not null then
    -- Frozen: neither the number nor the verification stamp may be touched. Other
    -- profile columns in the same UPDATE are unaffected.
    if new.license_number is distinct from old.license_number then
      raise exception 'license_verified_locked' using errcode = '42501';
    end if;
    if new.license_verified_at is distinct from old.license_verified_at then
      raise exception 'license_verification_readonly' using errcode = '42501';
    end if;
  else
    -- Not yet verified: the number stays editable, but a user must never be able to
    -- mark their OWN license verified.
    if new.license_verified_at is distinct from old.license_verified_at then
      raise exception 'license_verification_readonly' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ── The caller-scoped action ────────────────────────────────────────────────
-- Deliberately takes no user id: the row is always auth.uid(), so there is no
-- parameter through which one caller could reach another's profile.
create or replace function public.lb_change_license_state(p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_current text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Same set the license_state CHECK constraint enforces (20260826000000).
  if p_state is null or p_state not in ('AZ','CO','FL','GA','IL','TN','TX') then
    raise exception 'invalid_license_state' using errcode = '22023';
  end if;

  select license_state into v_current from public.profiles where id = v_uid;

  -- No-op when nothing changes, so this can never be used to quietly strip a
  -- verification while staying in the same state.
  if v_current is not distinct from p_state then
    return;
  end if;

  update public.profiles
     set license_state       = p_state,
         license_number      = null,
         license_verified_at = null,
         updated_at          = now()
   where id = v_uid;
end;
$$;

grant execute on function public.lb_change_license_state(text) to authenticated;

comment on function public.lb_change_license_state(text) is
  'Moves the CALLER''s profile to a new license state, clearing the license number '
  'and verification stamp in the same update. Never grants verification; only the '
  'owner-only lb_verify_license can do that.';
