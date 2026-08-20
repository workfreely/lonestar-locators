-- License verification — manual, owner-verified for launch.
--
-- A locator's license number is surfaced on guest cards and generated documents, so
-- once the platform owner has confirmed it, the user must not be able to change or
-- clear it. Disabling the input alone would be cosmetic: profiles carries
--   create policy "Users can update their own profile" for update using (auth.uid() = id)
-- with NO `with check`, so a user can write any column on their own row through the
-- API. Enforcement therefore lives here, in the database.
--
-- Deliberately minimal for launch: no verification queue, no review dashboard, no
-- automated lookup, no third-party service. The owner verifies from the existing
-- Beast Network admin panel, which is already gated by is_platform_admin().

-- ── State ───────────────────────────────────────────────────────────────────
-- Null = not yet verified (Pending). Non-null = verified at that moment, and the
-- license number is frozen from the user's side.
alter table public.profiles
  add column if not exists license_verified_at timestamptz;

comment on column public.profiles.license_verified_at is
  'When the platform owner verified this license number. Non-null freezes profiles.license_number against user edits (see lb_guard_verified_license).';

-- ── Enforcement ─────────────────────────────────────────────────────────────
-- A BEFORE UPDATE trigger rather than an RLS `with check`: the rule is about the
-- RELATIONSHIP between old and new rows ("unchanged while verified"), which a row-level
-- check predicate cannot express. SECURITY DEFINER RPCs below set the timestamp; this
-- trigger only ever blocks the user-facing path.
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

drop trigger if exists lb_guard_verified_license on public.profiles;
create trigger lb_guard_verified_license
  before update on public.profiles
  for each row
  execute function public.lb_guard_verified_license();

-- ── Owner action ────────────────────────────────────────────────────────────
-- Sets the verification stamp. Guarded by is_platform_admin() exactly like
-- lb_set_member_status, so hiding the button is defence in depth, not the control.
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
     set license_verified_at = coalesce(license_verified_at, now())
   where id = p_user
     and nullif(trim(coalesce(license_number, '')), '') is not null
  returning license_verified_at into v_at;

  if v_at is null then
    -- Either no such profile, or no license number to verify.
    raise exception 'license_number_missing' using errcode = '22023';
  end if;

  return v_at;
end;
$$;
grant execute on function public.lb_verify_license(uuid) to authenticated;

-- Undo, for a verification made in error. Owner only, same guard.
create or replace function public.lb_unverify_license(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.profiles set license_verified_at = null where id = p_user;
end;
$$;
grant execute on function public.lb_unverify_license(uuid) to authenticated;

-- ── Admin panel data ────────────────────────────────────────────────────────
-- Extend the existing owner-only member listing with the license fields so the panel
-- can show the number and its state without a second round trip. Same guard, same
-- shape otherwise — callers selecting the previous columns are unaffected.
-- The return type gains two columns, and `create or replace` cannot change a function's
-- return type — the existing one must be dropped first. Signature and grant below are
-- otherwise unchanged, so every current caller keeps working.
drop function if exists public.lb_list_network_members(text);
create or replace function public.lb_list_network_members(p_status text default 'pending')
returns table (
  user_id             uuid,
  display_name        text,
  photo_url           text,
  sponsor_name        text,
  applied_at          timestamptz,
  approved_at         timestamptz,
  status              text,
  license_number      text,
  license_verified_at timestamptz
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
      nm.user_id,
      coalesce(
        nullif(trim(p.preferred_name), ''),
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        'Member'
      ),
      p.profile_photo_url,
      coalesce(
        nullif(trim(sp.preferred_name), ''),
        nullif(trim(concat_ws(' ', sp.first_name, sp.last_name)), '')
      ),
      nm.applied_at,
      nm.approved_at,
      nm.status,
      p.license_number,
      p.license_verified_at
    from public.network_members nm
    join public.profiles p on p.id = nm.user_id
    left join public.profiles sp on sp.id = nm.sponsor_id
    where (p_status is null or nm.status = p_status)
    order by nm.applied_at desc;
end;
$$;
grant execute on function public.lb_list_network_members(text) to authenticated;

-- ── Username is registered ONCE ─────────────────────────────────────────────
-- The public Smart Lead Form URL is permanent after creation: agents share it on
-- listings, signage and social profiles, so letting it change would silently break
-- links already in circulation and free the old slug for someone else.
--
-- Enforced HERE, not by hiding the Change button — lb_set_username is callable by any
-- authenticated user, so the UI alone would be no control at all. Everything else about
-- the function is unchanged: same slug validation, same reservation rules (by user id
-- or email), same uniqueness check, same error vocabulary.
create or replace function public.lb_set_username(p_candidate text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug      text := public.slugify(p_candidate);
  v_ws        uuid := public.current_workspace_id();
  v_email     text := public.lb_current_email();
  v_existing  text;
  v_res_uid   uuid;
  v_res_email text;
  v_found     boolean := false;
begin
  if v_ws is null then
    raise exception 'no_workspace';
  end if;

  -- One-time registration. Re-submitting the SAME slug is a harmless no-op so a
  -- double-submit or retry does not surface as an error. The platform owner may still
  -- correct a slug (recovery/typo) through the SAME authorization mechanism used by the
  -- rest of the admin surface; there is no normal-user path.
  select w.slug into v_existing from public.workspaces w where w.id = v_ws;
  if nullif(trim(coalesce(v_existing, '')), '') is not null and not public.is_platform_admin() then
    if v_existing = v_slug then
      return v_existing;
    end if;
    raise exception 'username_already_set';
  end if;

  if v_slug is null or length(v_slug) < 3 or length(v_slug) > 30 then
    raise exception 'invalid_username';
  end if;

  select reserved_for_user_id, reserved_for_email
    into v_res_uid, v_res_email
  from public.reserved_usernames where slug = v_slug;
  v_found := found;

  if v_found then
    if v_res_uid is not null then
      if v_res_uid <> auth.uid() then raise exception 'reserved_username'; end if;
    elsif v_res_email is not null then
      if v_email is null or lower(v_res_email) <> v_email then raise exception 'reserved_username'; end if;
    else
      raise exception 'reserved_username';
    end if;
  end if;

  if exists (select 1 from public.workspaces w where w.slug = v_slug and w.id <> v_ws) then
    raise exception 'username_taken';
  end if;

  update public.workspaces set slug = v_slug, updated_at = now() where id = v_ws;
  return v_slug;
end $$;

grant execute on function public.lb_set_username(text) to authenticated;
