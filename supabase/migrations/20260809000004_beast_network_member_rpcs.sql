-- ============================================================================
-- Beast Network — Phase 3: authenticated member + admin RPCs
-- ============================================================================
-- Read/write surface for the authenticated Beast Network page (/admin/network)
-- and the owner approval panel. All SECURITY DEFINER with explicit guards. No
-- commission/revenue logic. The downline read is the codebase's first
-- cross-account read — done ONLY through a narrow, depth-capped resolver that
-- returns safe display fields, never by loosening base-table RLS.

-- ── lb_my_network_overview() ─────────────────────────────────────────────────
-- One call for the member's own page header: their membership status (null when
-- they aren't a member — e.g. the platform owner who only administers), their
-- public workspace slug (for the Copy-My-Join-Link URL), and their saved
-- brokerage referral URL.
create or replace function public.lb_my_network_overview()
returns table (
  status                 text,
  slug                   text,
  brokerage_referral_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select nm.status, w.slug, nm.brokerage_referral_url
  from public.workspaces w
  left join public.network_members nm on nm.user_id = auth.uid()
  where w.created_by = auth.uid()
  limit 1;
$$;
grant execute on function public.lb_my_network_overview() to authenticated;

-- ── lb_set_my_referral_url(url) ──────────────────────────────────────────────
-- Member self-service: save/update THEIR OWN official brokerage referral URL.
-- Active members only (recruiting is an active-member privilege). Validates the
-- scheme (http/https) to block javascript:/data: etc. An empty value clears it.
create or replace function public.lb_set_my_referral_url(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_url text := nullif(trim(p_url), '');
begin
  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'invalid_url' using errcode = '22023';
  end if;

  update public.network_members
     set brokerage_referral_url = v_url
   where user_id = auth.uid()
     and status = 'active';

  if not found then
    raise exception 'not_active_member' using errcode = '42501';
  end if;
end;
$$;
grant execute on function public.lb_set_my_referral_url(text) to authenticated;

-- ── lb_network_downline(max_depth) ───────────────────────────────────────────
-- The caller's own downline, grouped later by depth into Direct (1) / Tier 2 /
-- Tier 3. Depth is HARD-capped at 3 regardless of the argument. Returns only
-- safe display fields — name, photo, joined date, status — never emails/phones/
-- ids. Adjacency list walked with a recursive CTE (no stored tiers).
create or replace function public.lb_network_downline(p_max_depth int default 3)
returns table (
  depth        int,
  display_name text,
  photo_url    text,
  joined_date  timestamptz,
  status       text
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select nm.user_id, nm.sponsor_id, 1 as depth, nm.applied_at, nm.status
    from public.network_members nm
    where nm.sponsor_id = auth.uid()
    union all
    select c.user_id, c.sponsor_id, t.depth + 1, c.applied_at, c.status
    from public.network_members c
    join tree t on c.sponsor_id = t.user_id
    where t.depth < least(greatest(coalesce(p_max_depth, 3), 1), 3)
  )
  select
    t.depth,
    coalesce(
      nullif(trim(p.preferred_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Member'
    ),
    p.profile_photo_url,
    t.applied_at,
    t.status
  from tree t
  join public.profiles p on p.id = t.user_id
  order by t.depth, t.applied_at;
$$;
grant execute on function public.lb_network_downline(int) to authenticated;

-- ── lb_list_network_members(status) — ADMIN ONLY ─────────────────────────────
-- Backs the owner approval panel. Guarded by is_platform_admin() (raises for
-- everyone else). p_status null = all members; otherwise filter by status.
-- Returns user_id so the admin can call lb_set_member_status(user, ...).
create or replace function public.lb_list_network_members(p_status text default 'pending')
returns table (
  user_id      uuid,
  display_name text,
  photo_url    text,
  sponsor_name text,
  applied_at   timestamptz,
  approved_at  timestamptz,
  status       text
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
      nm.status
    from public.network_members nm
    join public.profiles p on p.id = nm.user_id
    left join public.profiles sp on sp.id = nm.sponsor_id
    where (p_status is null or nm.status = p_status)
    order by nm.applied_at desc;
end;
$$;
grant execute on function public.lb_list_network_members(text) to authenticated;
