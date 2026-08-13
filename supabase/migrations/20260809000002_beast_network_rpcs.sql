-- ============================================================================
-- Beast Network — Phase 1 (3/3): write RPCs (attribution + approval primitives)
-- ============================================================================
-- The ONLY sanctioned write paths into network_members / referral_intents. All
-- are SECURITY DEFINER (so they can write past the closed RLS) with tight,
-- explicit guards. No UI is built on them yet — these are the callable
-- foundation the Join page (Phase 2) and the approval console (Phase 4) will use.

-- ── lb_record_referral_intent(sponsor_slug) → token ──────────────────────────
-- Called (later, by the public Join page) BEFORE any account exists. Resolves the
-- agent slug → sponsor user, verifies the sponsor is an ACTIVE member (only
-- active members may recruit), mints an opaque token bound to that sponsor, and
-- returns it for the caller to persist in a first-party cookie. Does NOT create a
-- membership — that happens on claim, after the prospect signs up.
create or replace function public.lb_record_referral_intent(p_sponsor_slug text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sponsor uuid;
  v_token   text;
begin
  select w.created_by
    into v_sponsor
  from public.workspaces w
  where w.slug = public.slugify(p_sponsor_slug)
  limit 1;

  if v_sponsor is null then
    raise exception 'invalid_sponsor' using errcode = 'P0002';
  end if;

  -- Recruiting is an ACTIVE-member privilege.
  if not exists (
    select 1 from public.network_members nm
    where nm.user_id = v_sponsor and nm.status = 'active'
  ) then
    raise exception 'sponsor_not_active' using errcode = 'P0001';
  end if;

  -- Opaque, unguessable token (two uuids, no dashes = 64 hex chars). Avoids a
  -- pgcrypto dependency; gen_random_uuid() is in core Postgres.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.referral_intents (token, sponsor_id)
  values (v_token, v_sponsor);

  return v_token;
end;
$$;

grant execute on function public.lb_record_referral_intent(text) to anon, authenticated;

-- ── lb_claim_referral(token) ─────────────────────────────────────────────────
-- Called (later, at first sign-in / onboarding) by the freshly-created user to
-- preserve the referral relationship. Resolves the token → sponsor and creates
-- the caller's membership as 'pending'. Deliberately RESILIENT: an unknown /
-- already-consumed token, or a self-referral, is a silent no-op so it can never
-- block account creation. Never overwrites an existing membership.
create or replace function public.lb_claim_referral(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_intent public.referral_intents;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_intent from public.referral_intents where token = p_token;
  if not found then
    return; -- unknown/expired token → no-op
  end if;

  if v_intent.sponsor_id = v_uid then
    return; -- never self-refer
  end if;

  insert into public.network_members (user_id, sponsor_id, status, applied_at)
  values (v_uid, v_intent.sponsor_id, 'pending', now())
  on conflict (user_id) do nothing;

  update public.referral_intents
     set consumed_by = v_uid, consumed_at = now()
   where token = p_token and consumed_at is null;
end;
$$;

grant execute on function public.lb_claim_referral(text) to authenticated;

-- ── lb_set_member_status(user, status) — the approval primitive ───────────────
-- Admin-only. The minimal architecture that lets the owner eventually approve
-- (pending → active) or deactivate (→ inactive) a member. Stamps approval /
-- deactivation metadata. No UI yet; there is no self-service path to this.
create or replace function public.lb_set_member_status(p_user uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_status not in ('pending','active','inactive') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.network_members
     set status         = p_status,
         approved_at    = case when p_status = 'active'   and approved_at is null then now() else approved_at end,
         approved_by    = case when p_status = 'active'   and approved_by is null then v_admin else approved_by end,
         deactivated_at = case when p_status = 'inactive' then now()
                               when p_status = 'active'   then null
                               else deactivated_at end
   where user_id = p_user;

  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.lb_set_member_status(uuid, text) to authenticated;
