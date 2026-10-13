-- INTERNAL COMPLIMENTARY ACCESS — an explicit, per-user, owner-granted entitlement.
--
-- ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────────────────────
-- lb_workspace_has_access requires TWO independent things: licence eligibility AND billing
-- entitlement. The licence half already has a sanctioned exemption (profiles.internal_demo_access,
-- granted only by lb_set_internal_demo_access). The billing half has three sources and NONE of them
-- fits a complimentary internal account:
--
--   subscription_status = 'active'   → a real Stripe subscription, i.e. a charge
--   a live trial                     → time-limited, and auto-granted trials are not wanted here
--   network_members.status='active'  → asserts a Beast Network / brokerage relationship that may
--                                      not be true, and shows up in the admin Network panel
--
-- So this adds a FOURTH billing source whose only meaning is "the platform owner granted this
-- person free access". Nothing infers it, nothing expires it, and it applies to exactly the user
-- ids listed in one table.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────────────────────
-- • It does not touch the LICENCE half. A complimentary grant is not a licence and never implies
--   one; licence fields stay null and lb_guard_verified_license is untouched. Software access only.
-- • It is not a role, a flag on profiles, or an admin bypass. profiles.UPDATE policy is an
--   unrestricted `auth.uid() = id`, so a boolean there would be self-grantable — the same reasoning
--   that put platform_admins in its own table.
-- • It has NO write policy. A row is grantable only through the platform-admin RPC below or the
--   service role, exactly like platform_admins.
-- • review_date is RECORDED AND NEVER ENFORCED. A review date that silently suspended access would
--   be an expiry by another name; the predicate below does not read it. It exists so the owner can
--   be reminded to look, and a grant therefore survives the holder becoming licensed.
-- • Nobody else's entitlement changes: the new disjunct can only match a row in this table, and
--   this table starts empty.

create table if not exists public.lb_complimentary_access (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  -- A date for a HUMAN to review the grant. Never consulted by any access check.
  review_date date,
  note        text,
  -- Revocation is a timestamp rather than a delete, so a withdrawn grant leaves a record.
  revoked_at  timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.lb_complimentary_access is
  'Explicit owner-granted free product access. Billing entitlement only — never a licence, never a role. review_date is advisory and is not enforced by any access check.';

-- Active grants only; the partial index matches the predicate's shape.
create index if not exists lb_complimentary_access_active_idx
  on public.lb_complimentary_access (user_id) where revoked_at is null;

alter table public.lb_complimentary_access enable row level security;

-- The holder may see their own grant; the platform owner may see all. No write policy.
drop policy if exists "read own complimentary access" on public.lb_complimentary_access;
create policy "read own complimentary access" on public.lb_complimentary_access
  for select using (user_id = auth.uid() or public.is_platform_admin());

-- ── THE GRANT, through the same door as the licence exemption ───────────────────────────────
-- Mirrors lb_set_internal_demo_access exactly: SECURITY DEFINER, platform-admin only, explicit
-- errors. It cannot be reached by a subscriber, and it never touches licence columns.
create or replace function public.lb_set_complimentary_access(
  p_user        uuid,
  p_enabled     boolean,
  p_review_date date default null,
  p_note        text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'enabled_required' using errcode = '22023';
  end if;
  -- The target must be a real account. A grant against a missing user would sit in the table
  -- looking effective while matching nobody.
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  if p_enabled then
    insert into public.lb_complimentary_access (user_id, granted_by, review_date, note)
    values (p_user, auth.uid(), p_review_date, p_note)
    on conflict (user_id) do update
      set revoked_at  = null,
          granted_by  = auth.uid(),
          granted_at  = now(),
          review_date = coalesce(excluded.review_date, public.lb_complimentary_access.review_date),
          note        = coalesce(excluded.note, public.lb_complimentary_access.note),
          updated_at  = now();
  else
    update public.lb_complimentary_access
       set revoked_at = now(), updated_at = now()
     where user_id = p_user and revoked_at is null;
  end if;

  select (revoked_at is null) into v_active
    from public.lb_complimentary_access where user_id = p_user;
  return coalesce(v_active, false);
end;
$function$;

revoke all on function public.lb_set_complimentary_access(uuid, boolean, date, text) from public;
grant execute on function public.lb_set_complimentary_access(uuid, boolean, date, text) to authenticated;

-- ── THE ONE-LINE CHANGE TO THE GATE ─────────────────────────────────────────────────────────
-- Replayed verbatim from the live definition with a single disjunct added as billing source (4).
-- The licence half above it is byte-identical and still must hold on its own.
create or replace function public.lb_workspace_has_access(ws uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.workspaces w
    join public.profiles p on p.id = w.created_by
    where w.id = ws
      -- LICENCE ELIGIBILITY (Pass 7). Must hold on its own — billing cannot
      -- substitute for it. UNCHANGED by the complimentary grant: free access is
      -- not a licence.
      and (
        (p.license_verified_at is not null and p.license_state = 'TX')
        or p.internal_demo_access
      )
      -- BILLING ENTITLEMENT. Must ALSO hold — a verified licence cannot substitute
      -- for it either.
      and (
        -- 1) Paid subscription
        p.subscription_status = 'active'
        -- 2) Live trial
        or (
          p.subscription_status = 'trialing'
          and p.trial_ends_at is not null
          and p.trial_ends_at > now()
        )
        -- 3) Organization Included — owner is an ACTIVE verified network member
        or exists (
          select 1
          from public.network_members nm
          where nm.user_id = w.created_by
            and nm.status = 'active'
        )
        -- 4) INTERNAL COMPLIMENTARY — explicitly granted by the platform owner to
        --    this user id. No Stripe customer, no trial, no network membership, and
        --    no expiry: review_date is advisory and is deliberately NOT read here,
        --    so a grant never lapses on its own and survives the holder becoming
        --    licensed. Revocation is explicit.
        or exists (
          select 1
          from public.lb_complimentary_access ca
          where ca.user_id = w.created_by
            and ca.revoked_at is null
        )
      )
  );
$function$;
