-- Universal license verification — the owner-facing half.
--
-- Verification itself already works and is untouched: profiles.license_verified_at
-- stays the single source of truth, and lb_verify_license / lb_unverify_license stay
-- the only writers. What was missing is REACH — the only listing that existed,
-- lb_list_network_members, selects `from network_members join profiles`, so a user who
-- never joined the referral network could not appear in it at all and therefore could
-- never be verified. This migration adds a listing sourced from profiles instead.
--
-- Referral membership is deliberately NOT joined here. A regular paid or trial user
-- must never surface anywhere that implies a referral tier, and the cheapest way to
-- guarantee that is for this query to have no access to network_members at all.

-- ── License state ───────────────────────────────────────────────────────────
-- Which state issued the license. Stored explicitly rather than inferred from
-- service_areas: an agent may work markets in a state they are not licensed in, and a
-- guess is not something to print next to a verification badge.
alter table public.profiles
  add column if not exists license_state text;

comment on column public.profiles.license_state is
  'Issuing state for license_number (2-letter). Frozen alongside the number once license_verified_at is set.';

-- Constrained to the states Locator Beast supports, matching lib/markets/catalog.ts.
-- A CHECK rather than UI-only validation because the value is shown beside a
-- verification badge and drives which state lookup link the owner is sent to; adding an
-- eighth state is a one-line migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_license_state_supported'
  ) then
    alter table public.profiles
      add constraint profiles_license_state_supported
      check (license_state is null or license_state in ('AZ','CO','FL','GA','IL','TN','TX'));
  end if;
end $$;

-- ── Freeze the state with the number ────────────────────────────────────────
-- Same trigger, one more frozen column. Without this a verified agent could switch
-- their state and the row would show a license verified against one state's registry
-- while displaying another — the badge would be quietly wrong.
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

  if old.license_verified_at is not null then
    -- Frozen: neither the number, the issuing state, nor the verification stamp may be
    -- touched. Other profile columns in the same UPDATE are unaffected.
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
    -- Not yet verified: number and state stay editable, but a user must never be able
    -- to mark their OWN license verified.
    if new.license_verified_at is distinct from old.license_verified_at then
      raise exception 'license_verification_readonly' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ── Owner-only listing ──────────────────────────────────────────────────────
-- Every Locator Beast user, network member or not. Returns ONLY what the review row
-- renders: no email, no subscription state, no network tier, no service areas. Keeping
-- the projection this narrow is what stops the page from drifting into a general user
-- admin surface, and means an accidental client-side leak exposes nothing sensitive.
--
-- Users with no license number are included on purpose — the owner needs to see who
-- still owes one. lb_verify_license already refuses those rows (license_number_missing),
-- so the UI simply offers no action for them.
create or replace function public.lb_list_licenses()
returns table (
  user_id             uuid,
  display_name        text,
  photo_url           text,
  license_state       text,
  license_number      text,
  license_verified_at timestamptz,
  signed_up_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      coalesce(
        nullif(trim(p.preferred_name), ''),
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        'Agent'
      ),
      p.profile_photo_url,
      p.license_state,
      p.license_number,
      p.license_verified_at,
      p.created_at
    from public.profiles p
    -- Unverified first (false sorts before true), then newest signup.
    order by (p.license_verified_at is not null), p.created_at desc;
end;
$$;
grant execute on function public.lb_list_licenses() to authenticated;
