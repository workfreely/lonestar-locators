-- ============================================================================
-- Beast Network — Phase 1 (1/3): membership + referral-intent foundation
-- ============================================================================
-- Introduces the referral / network-membership data model WITHOUT changing any
-- existing behavior. These tables are brand new — nothing in the app reads or
-- writes them yet (entitlement wiring is 2/3; the write RPCs are 3/3) — so their
-- RLS cannot break the current experience.
--
-- Design principles (per the Phase 1 spec):
--   • Brokerage-INDEPENDENT. No relive_* fields, no brokerage-specific columns.
--     The brokerage's own referral URL is stored generically per member.
--   • Direct sponsor ONLY (adjacency list). No tier_1/tier_2/tier_3 columns —
--     the hierarchy is DERIVED later from `sponsor_id`, never stored.
--   • Writes flow through SECURITY DEFINER RPCs / the service role, never direct
--     client writes — so RLS stays closed by default.

-- ── network_members ──────────────────────────────────────────────────────────
-- One row per participant. `user_id` IS the auth user id (1:1, like profiles).
-- `sponsor_id` is the member's DIRECT referrer only. Status flows
-- pending → active (owner-approved) → inactive (eligibility lost); an inactive
-- member keeps all of their CRM data — they simply fall out of the
-- Organization-Included entitlement source (see 2/3).
create table if not exists public.network_members (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  sponsor_id             uuid references auth.users(id) on delete set null,
  status                 text not null default 'pending'
                           check (status in ('pending','active','inactive')),
  -- Generic: THIS member's own referral URL issued by the brokerage (whatever
  -- brokerage that is). Populated in a later phase; brokerage-neutral by design.
  brokerage_referral_url text,
  applied_at             timestamptz not null default now(),
  approved_at            timestamptz,
  approved_by            uuid references auth.users(id) on delete set null,
  deactivated_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A member can never be their own sponsor (cheapest cycle guard; deeper cycle
  -- prevention arrives with the tree resolver in a later phase).
  constraint network_members_no_self_sponsor
    check (sponsor_id is null or sponsor_id <> user_id)
);
create index if not exists network_members_sponsor_idx on public.network_members(sponsor_id);
create index if not exists network_members_status_idx  on public.network_members(status);

-- Keep updated_at honest on every write (no shared touch-helper exists in this
-- codebase, so this trigger is scoped to Beast Network).
create or replace function public.beast_network_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_network_members_updated_at on public.network_members;
create trigger trg_network_members_updated_at
  before update on public.network_members
  for each row execute function public.beast_network_touch_updated_at();

-- ── referral_intents ─────────────────────────────────────────────────────────
-- The safe attribution primitive: when a prospect starts joining under an agent
-- (BEFORE any Locator Beast account exists), we mint an opaque token bound to the
-- sponsor and hand it back to the caller (a cookie carries it across the off-site
-- brokerage redirect). After the prospect creates their account, the token is
-- claimed (see 3/3) and the sponsor relationship is preserved. This is a plain
-- lookup table — NOT an attribution platform.
create table if not exists public.referral_intents (
  token       text primary key,
  sponsor_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  consumed_by uuid references auth.users(id) on delete set null,
  consumed_at timestamptz
);
create index if not exists referral_intents_sponsor_idx on public.referral_intents(sponsor_id);

-- ── platform_admins (intentionally minimal owner-approval architecture) ───────
-- Deliberately a SEPARATE table rather than a `profiles.is_platform_admin`
-- column: the existing profiles UPDATE policy is `auth.uid() = id` with no
-- column restriction, so a boolean on profiles would let any user self-elevate
-- to admin. A dedicated table with NO write policy closes that escalation path —
-- admin rows are grantable only via the service role / SQL migration. This is
-- the smallest thing that lets an owner eventually approve members; it is NOT a
-- general RBAC/permissions framework.
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER so RLS policies / RPCs can call it without needing their own
-- read access to platform_admins.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  );
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- ── RLS (safe: no app code reads these tables yet) ───────────────────────────
alter table public.network_members  enable row level security;
alter table public.referral_intents enable row level security;
alter table public.platform_admins  enable row level security;

-- A member may read ONLY their own membership row. The downline tree (reading
-- OTHER members) is deliberately NOT exposed here — it will arrive in a later
-- phase via a narrow SECURITY DEFINER resolver returning only safe fields, never
-- by broadening this policy.
create policy "read own network membership"
  on public.network_members for select
  using (user_id = auth.uid());

-- Platform admins may read all memberships (for the future approval console).
create policy "admins read all network memberships"
  on public.network_members for select
  using (public.is_platform_admin());

-- A user may see whether they themselves are an admin (harmless); no write
-- policy exists, so admin grants are service-role/migration only.
create policy "read own platform admin row"
  on public.platform_admins for select
  using (user_id = auth.uid());

-- referral_intents intentionally has NO policy — closed by default, touched only
-- by the SECURITY DEFINER RPCs in 3/3. The sponsor→token mapping is never
-- directly readable/writable by clients.

-- Note: NO INSERT/UPDATE/DELETE policies on network_members. Every mutation goes
-- through the SECURITY DEFINER RPCs (3/3: claim referral, admin set-status) or
-- the service role.

-- ── Seed the initial platform owner (brokerage-independent, not hard-coded) ──
-- Derives the owner from the EXISTING owner-username reservation rather than a
-- hard-coded email in this file. No-op if that user hasn't signed up yet — an
-- admin row can always be inserted later via the service role.
insert into public.platform_admins (user_id, note)
select u.id, 'initial platform owner (from reserved_usernames owner reservation)'
from public.reserved_usernames r
join auth.users u on lower(u.email) = lower(r.reserved_for_email)
where r.reserved_for_email is not null
on conflict (user_id) do nothing;

-- ── Bootstrap the ROOT network member (same confirmed owner account) ─────────
-- Beast Network is an adjacency list, so it needs a root: the owner sits at the
-- top with NO sponsor. Resolved the SAME way as the admin seed above (from the
-- owner-username reservation), so it targets exactly the confirmed owner account
-- WITHOUT hard-coding an email — brokerage-neutral, no brokerage-specific fields.
-- The owner is self-approved (approved_by = own id) at seed time. Idempotent:
-- `on conflict (user_id) do nothing` means re-running never duplicates and never
-- overwrites/demotes an already-existing membership row. Any account NOT named in
-- an owner reservation (e.g. a normal testing account) is untouched.
insert into public.network_members (user_id, sponsor_id, status, approved_at, approved_by)
select u.id, null, 'active', now(), u.id
from public.reserved_usernames r
join auth.users u on lower(u.email) = lower(r.reserved_for_email)
where r.reserved_for_email is not null
on conflict (user_id) do nothing;
