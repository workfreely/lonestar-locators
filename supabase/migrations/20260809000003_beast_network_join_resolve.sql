-- ============================================================================
-- Beast Network — Phase 2: public Join-page sponsor resolver
-- ============================================================================
-- Powers the public /join/[agent-slug] landing page. Mirrors lb_resolve_public_form
-- (same slug → workspace → profile join, SECURITY DEFINER, granted to anon), with
-- ONE extra condition: the resolved owner must be an ACTIVE network member. So a
-- working Join page exists ONLY for approved members — pending/inactive/unknown
-- slugs resolve to no row and the page 404s.
--
-- Returns PUBLIC BRANDING ONLY (agent name, brokerage name, photo, service areas)
-- plus a BOOLEAN `has_referral_url` — exactly the same exposure class as the Smart
-- Form resolver. It deliberately does NOT return the brokerage_referral_url itself
-- or any user id; the actual redirect URL is resolved server-side in
-- /api/join/start via the minted referral token, never exposed in the page
-- payload. `has_referral_url` lets the page decide, at render, whether to enable
-- the primary "Join Brokerage" CTA (a missing URL disables it with a message).

drop function if exists public.lb_resolve_public_join(text);
create or replace function public.lb_resolve_public_join(p_slug text)
returns table (
  agent_name       text,
  brokerage_name   text,
  photo_url        text,
  service_areas    text[],
  has_referral_url boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      nullif(trim(p.preferred_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Your Local Locator'
    ),
    coalesce(nullif(trim(p.brokerage), ''), nullif(trim(p.business_name), '')),
    p.profile_photo_url,
    coalesce(w.service_areas, '{}'),
    (nm.brokerage_referral_url is not null and length(trim(nm.brokerage_referral_url)) > 0)
  from public.workspaces w
  join public.profiles p        on p.id = w.created_by
  join public.network_members nm on nm.user_id = w.created_by and nm.status = 'active'
  where w.slug = public.slugify(p_slug)
  limit 1;
$$;

grant execute on function public.lb_resolve_public_join(text) to anon, authenticated;
