-- ════════════════════════════════════════════════════════════════════════════
-- PASS 4 — licence verification status + the licence-state freeze security fix
--
-- PREPARED FOR MANUAL APPLICATION. The migration ledger is out of sync (51
-- migrations applied but absent from the remote ledger), so `supabase db push`
-- would attempt to re-run them against live Property Intelligence data. Apply
-- this file by hand in the Supabase SQL Editor, as one transaction, then run the
-- verification queries at the bottom. Rollback is at the very end.
--
-- It does FOUR things:
--   1. adds two nullable columns so a rejection can be represented at all
--   2. makes verified and rejected mutually exclusive, so no contradictory row
--      can ever persist
--   3. RESTORES the licence-STATE freeze that 20260826000003 dropped (security)
--   4. teaches the owner RPCs to verify / reject, and the admin listing to show it
--
-- It deliberately does NOT: start or stop a trial, touch lb_workspace_has_access,
-- touch middleware, or change the service-area RPC. Those are later passes.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Schema ───────────────────────────────────────────────────────────────
-- Two nullable columns, NOT a license_verification_status string. A status column
-- would become a second source of truth that could disagree with
-- license_verified_at, which is the signal the access gate will read and the one
-- field a user cannot forge. Keeping the timestamp authoritative means no existing
-- read changes meaning.
alter table public.profiles
  add column if not exists license_rejected_at      timestamptz,
  add column if not exists license_rejection_reason text;

comment on column public.profiles.license_rejected_at is
  'When the platform owner rejected this licence (needs correction). Mutually exclusive with license_verified_at. Owner-set only — lb_guard_verified_license blocks user writes.';
comment on column public.profiles.license_rejection_reason is
  'Short owner-written reason shown to the agent so they know what to fix. Cleared automatically when they correct the licence number.';

-- Contradictory state cannot persist. This is the precedence rule, enforced rather
-- than merely documented: a row can be verified OR rejected, never both.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_license_status_exclusive') then
    alter table public.profiles
      add constraint profiles_license_status_exclusive
      check (license_verified_at is null or license_rejected_at is null);
  end if;
end $$;

-- ── 2. Guard trigger ────────────────────────────────────────────────────────
-- Replaces 20260826000003. Two changes, everything else byte-for-byte:
--
--   (a) SECURITY FIX — the verified licence STATE is frozen again. 20260826000000
--       froze it; 20260826000003 replaced this function to add the relicensing
--       branch and did not carry that check forward. Under the current function a
--       verified user can UPDATE profiles SET license_state='TX' alone: the number
--       is unchanged, the stamp is unchanged, and the relicensing branch does not
--       apply because it requires both to be cleared. So a verified Illinois
--       licence can be flipped to Texas while KEEPING its verification — which
--       would let a non-Texas licence satisfy the Texas launch gate.
--
--   (b) the rejection columns are owner-only, exactly like the verification stamp,
--       and the trigger itself clears a rejection when the agent corrects their
--       number (so the client never writes those columns at all).
--
-- The relicensing branch is untouched and still returns early, so the legitimate
-- state-change path keeps working.
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

-- ── 3. Owner actions ────────────────────────────────────────────────────────
-- Verify now also clears any prior rejection, so the two can never both be set.
create or replace function public.lb_verify_license(p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
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
  returning license_verified_at into v_at;

  if v_at is null then
    raise exception 'license_number_missing' using errcode = '22023';
  end if;

  return v_at;
end;
$$;
grant execute on function public.lb_verify_license(uuid) to authenticated;

-- Reject / needs correction. Mirrors lb_verify_license: same owner guard, same
-- "no licence number to act on" error, and it always DROPS verification so the two
-- states stay mutually exclusive.
create or replace function public.lb_reject_license(p_user uuid, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at     timestamptz;
  v_reason text;
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- A rejection the agent cannot act on is worse than none: the reason is required.
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  update public.profiles
     set license_verified_at      = null,
         license_rejected_at      = now(),
         license_rejection_reason = left(v_reason, 300)
   where id = p_user
     and nullif(trim(coalesce(license_number, '')), '') is not null
  returning license_rejected_at into v_at;

  if v_at is null then
    raise exception 'license_number_missing' using errcode = '22023';
  end if;

  return v_at;
end;
$$;
grant execute on function public.lb_reject_license(uuid, text) to authenticated;

-- ── 4. Admin listing ────────────────────────────────────────────────────────
-- Two more columns so the panel can show rejected rows and their reason without a
-- second round trip. `create or replace` cannot change a return type, so the
-- existing function is dropped first — the same pattern 20260826000001 used.
-- Signature, guard, joins and ordering are otherwise unchanged.
drop function if exists public.lb_list_licenses();
create or replace function public.lb_list_licenses()
returns table (
  user_id                  uuid,
  display_name             text,
  photo_url                text,
  license_state            text,
  license_number           text,
  license_verified_at      timestamptz,
  signed_up_at             timestamptz,
  sponsor_name             text,
  license_rejected_at      timestamptz,
  license_rejection_reason text
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
      p.created_at,
      -- Display context only. LEFT JOIN so a non-member is still listed.
      coalesce(
        nullif(trim(sp.preferred_name), ''),
        nullif(trim(concat_ws(' ', sp.first_name, sp.last_name)), '')
      ),
      p.license_rejected_at,
      p.license_rejection_reason
    from public.profiles p
    left join public.network_members nm on nm.user_id = p.id
    left join public.profiles sp        on sp.id = nm.sponsor_id
    -- Unverified first (false sorts before true), then newest signup.
    order by (p.license_verified_at is not null), p.created_at desc;
end;
$$;
grant execute on function public.lb_list_licenses() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. Every line should read as described.
-- ════════════════════════════════════════════════════════════════════════════
-- a) columns exist and are nullable
--    select column_name, is_nullable from information_schema.columns
--     where table_schema='public' and table_name='profiles'
--       and column_name in ('license_rejected_at','license_rejection_reason');
--
-- b) the exclusivity constraint exists
--    select conname from pg_constraint where conname='profiles_license_status_exclusive';
--
-- c) no contradictory row exists (expect 0)
--    select count(*) from public.profiles
--     where license_verified_at is not null and license_rejected_at is not null;
--
-- d) nothing was silently rewritten — verified/pending counts unchanged (expect 1 / 1)
--    select count(*) filter (where license_verified_at is not null) as verified,
--           count(*) filter (where license_verified_at is null
--                              and nullif(trim(coalesce(license_number,'')),'') is not null) as pending
--      from public.profiles;
--
-- e) the state freeze is live. As a NON-admin verified user this must raise
--    license_verified_locked:
--    update public.profiles set license_state='TX' where id = auth.uid();

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the exact pre-Pass-4 behaviour.
-- Run top to bottom. The columns are dropped LAST so the listing stops selecting
-- them first. Dropping them discards any rejection reasons recorded meanwhile.
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--
-- -- 4. listing back to its 8-column shape (20260826000001)
-- drop function if exists public.lb_list_licenses();
-- create or replace function public.lb_list_licenses()
-- returns table (
--   user_id uuid, display_name text, photo_url text, license_state text,
--   license_number text, license_verified_at timestamptz, signed_up_at timestamptz,
--   sponsor_name text
-- ) language plpgsql stable security definer set search_path = public as $$
-- begin
--   if not public.is_platform_admin() then
--     raise exception 'not_authorized' using errcode = '42501';
--   end if;
--   return query
--     select p.id,
--            coalesce(nullif(trim(p.preferred_name),''),
--                     nullif(trim(concat_ws(' ', p.first_name, p.last_name)),''), 'Agent'),
--            p.profile_photo_url, p.license_state, p.license_number,
--            p.license_verified_at, p.created_at,
--            coalesce(nullif(trim(sp.preferred_name),''),
--                     nullif(trim(concat_ws(' ', sp.first_name, sp.last_name)),''))
--       from public.profiles p
--       left join public.network_members nm on nm.user_id = p.id
--       left join public.profiles sp        on sp.id = nm.sponsor_id
--      order by (p.license_verified_at is not null), p.created_at desc;
-- end; $$;
-- grant execute on function public.lb_list_licenses() to authenticated;
--
-- -- 3. drop the reject action; restore verify without the rejection clear
-- drop function if exists public.lb_reject_license(uuid, text);
-- create or replace function public.lb_verify_license(p_user uuid)
-- returns timestamptz language plpgsql security definer set search_path = public as $$
-- declare v_at timestamptz;
-- begin
--   if not public.is_platform_admin() then
--     raise exception 'not_authorized' using errcode = '42501';
--   end if;
--   update public.profiles
--      set license_verified_at = coalesce(license_verified_at, now())
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
-- -- 2. guard trigger back to 20260826000003 EXACTLY (no state freeze, no rejection)
-- --    NOTE: this reopens the security regression. Only roll this part back if the
-- --    new trigger is actively breaking a legitimate write.
-- create or replace function public.lb_guard_verified_license()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   if public.is_platform_admin() then return new; end if;
--   if new.license_state is distinct from old.license_state
--      and new.license_verified_at is null
--      and new.license_number is null
--      and auth.uid() = old.id
--   then return new; end if;
--   if old.license_verified_at is not null then
--     if new.license_number is distinct from old.license_number then
--       raise exception 'license_verified_locked' using errcode = '42501';
--     end if;
--     if new.license_verified_at is distinct from old.license_verified_at then
--       raise exception 'license_verification_readonly' using errcode = '42501';
--     end if;
--   else
--     if new.license_verified_at is distinct from old.license_verified_at then
--       raise exception 'license_verification_readonly' using errcode = '42501';
--     end if;
--   end if;
--   return new;
-- end; $$;
--
-- -- 1. schema
-- alter table public.profiles drop constraint if exists profiles_license_status_exclusive;
-- alter table public.profiles
--   drop column if exists license_rejection_reason,
--   drop column if exists license_rejected_at;
--
-- commit;
