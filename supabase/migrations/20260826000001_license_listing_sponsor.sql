-- Referral context on the License Verification list.
--
-- Adds sponsor_name for DISPLAY only. The list still originates from profiles and
-- still returns every Locator Beast user — the join is a LEFT JOIN and nothing
-- filters on it, so a user who never joined the referral network simply gets a null
-- sponsor and no badge. No referral field is duplicated, no tier logic is read, and
-- entitlement is untouched.
--
-- Sponsor resolution mirrors lb_list_network_members exactly (same coalesce order),
-- so a member's name reads identically on both pages.
--
-- `create or replace` cannot change a function's return type, so the existing one is
-- dropped first. Signature and grant are otherwise unchanged.
drop function if exists public.lb_list_licenses();

create or replace function public.lb_list_licenses()
returns table (
  user_id             uuid,
  display_name        text,
  photo_url           text,
  license_state       text,
  license_number      text,
  license_verified_at timestamptz,
  signed_up_at        timestamptz,
  sponsor_name        text
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
      )
    from public.profiles p
    left join public.network_members nm on nm.user_id = p.id
    left join public.profiles sp        on sp.id = nm.sponsor_id
    -- Unverified first (false sorts before true), then newest signup.
    order by (p.license_verified_at is not null), p.created_at desc;
end;
$$;
grant execute on function public.lb_list_licenses() to authenticated;
