-- ============================================================================
-- Smart Lead Form usernames (public URLs) — foundation only, NO reservation
-- ============================================================================
-- The username IS the workspace's public slug (workspaces.slug) — one per solo
-- workspace, already unique. This makes it USER-CHOOSABLE (availability-checked)
-- instead of auto-locked, and adds the server-side resolver the public page
-- uses to render an agent's branded form at locatorbeast.com/{username}.
--
-- Format: usernames are always the slugify() form — lowercase; letters, numbers
-- and single hyphens only; no spaces/underscores; no consecutive/leading/
-- trailing hyphens. The UI slugifies as the user types; the DB functions
-- slugify again server-side so a bad value can never be stored.
--
-- Deliberately NOT here (deferred, per spec): trial reservation windows,
-- post-trial expiry/grace, automatic release, billing gating of the public
-- form. What IS here is a PERMANENT reservation registry (reserved_usernames)
-- for (a) system/route names that must never be claimed by anyone, and (b)
-- account-tied owner reservations (e.g. jay-morris) that a specific account
-- keeps forever regardless of subscription or any future billing-reservation
-- rules. That's a separate concept from trial reservations and is safe to
-- establish now.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).

-- ── Permanent reservation registry ──────────────────────────────────────────
--   reserved_for_email IS NULL  → blocked for EVERYONE (system/route names)
--   reserved_for_email = <email> → only that account may ever claim this slug
create table if not exists public.reserved_usernames (
  slug               text primary key,
  reserved_for_email text,
  reason             text,
  created_at         timestamptz not null default now()
);

alter table public.reserved_usernames enable row level security;
-- No policies: service-role / SECURITY DEFINER only. Not readable/writable by
-- authenticated sessions directly — the username functions consult it.

insert into public.reserved_usernames (slug, reserved_for_email, reason) values
  -- System / route names — never claimable (would collide with real routes).
  ('admin', null, 'system route'),
  ('api', null, 'system route'),
  ('auth', null, 'system route'),
  ('billing', null, 'system route'),
  ('dashboard', null, 'system route'),
  ('demo', null, 'system route'),
  ('features', null, 'system route'),
  ('pricing', null, 'system route'),
  ('academy', null, 'system route'),
  ('help', null, 'system route'),
  ('support', null, 'system route'),
  ('contact', null, 'system route'),
  ('about', null, 'system route'),
  ('login', null, 'system route'),
  ('signup', null, 'system route'),
  ('sign-in', null, 'system route'),
  ('sign-up', null, 'system route'),
  ('logout', null, 'system route'),
  ('forgot-password', null, 'system route'),
  ('reset-password', null, 'system route'),
  ('onboarding', null, 'system route'),
  ('settings', null, 'system route'),
  ('profile', null, 'system route'),
  ('account', null, 'system route'),
  ('companion', null, 'system route'),
  ('ai', null, 'system route'),
  ('app', null, 'system route'),
  ('www', null, 'system route'),
  ('smart-lead-form', null, 'system route'),
  ('terms', null, 'system route'),
  ('privacy', null, 'system route'),
  ('blog', null, 'system route'),
  ('join', null, 'system route'),
  ('workspace', null, 'system route'),
  ('leads', null, 'system route'),
  ('performance', null, 'system route'),
  ('locator-beast', null, 'system route'),
  -- Account-tied permanent owner reservation (tied by email since the account's
  -- uuid isn't known at migration time). Update the email if the owner's LB
  -- account uses a different address.
  ('jay-morris', 'workingfreely@gmail.com', 'owner permanent reservation')
on conflict (slug) do nothing;

-- Caller's normalized email (for account-tied reservation checks).
create or replace function public.lb_current_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(email)) from auth.users where id = auth.uid();
$$;

-- Is a candidate username valid + available for the CURRENT user to claim?
-- Valid: slugified form is 3..30 chars. Available: not reserved for someone
-- else / not system-blocked, and not used by ANY OTHER workspace (the caller's
-- own current slug counts as available so re-saving is a no-op).
create or replace function public.lb_username_available(p_candidate text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug          text := public.slugify(p_candidate);
  v_ws            uuid := public.current_workspace_id();
  v_email         text := public.lb_current_email();
  v_reserved_email text;
begin
  if v_slug is null or length(v_slug) < 3 or length(v_slug) > 30 then
    return false;
  end if;

  -- Permanent reservation registry: blocked for everyone (null) or reserved for
  -- a different account.
  select reserved_for_email into v_reserved_email
  from public.reserved_usernames where slug = v_slug;
  if found then
    if v_reserved_email is null then
      return false;
    end if;
    if v_email is null or lower(v_reserved_email) <> v_email then
      return false;
    end if;
    -- reserved for the caller → allowed to continue
  end if;

  return not exists (
    select 1 from public.workspaces w
    where w.slug = v_slug and (v_ws is null or w.id <> v_ws)
  );
end $$;

grant execute on function public.lb_username_available(text) to authenticated;

-- Claim/change the caller's username. Validates + checks reservations +
-- availability, then sets workspaces.slug. Raises a stable error string the app
-- maps to a message.
create or replace function public.lb_set_username(p_candidate text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug           text := public.slugify(p_candidate);
  v_ws             uuid := public.current_workspace_id();
  v_email          text := public.lb_current_email();
  v_reserved_email text;
begin
  if v_ws is null then
    raise exception 'no_workspace';
  end if;
  if v_slug is null or length(v_slug) < 3 or length(v_slug) > 30 then
    raise exception 'invalid_username';
  end if;

  select reserved_for_email into v_reserved_email
  from public.reserved_usernames where slug = v_slug;
  if found then
    if v_reserved_email is null then
      raise exception 'reserved_username';
    end if;
    if v_email is null or lower(v_reserved_email) <> v_email then
      raise exception 'reserved_username';
    end if;
    -- reserved for the caller → allowed
  end if;

  if exists (select 1 from public.workspaces w where w.slug = v_slug and w.id <> v_ws) then
    raise exception 'username_taken';
  end if;

  update public.workspaces set slug = v_slug, updated_at = now() where id = v_ws;
  return v_slug;
end $$;

grant execute on function public.lb_set_username(text) to authenticated;

-- Public resolver the /{username} page calls to render an agent's branded form.
-- Returns ONLY public branding — never leads or private internals. Callable by
-- anon. Reservation gating can be added here later without changing the shape.
create or replace function public.lb_resolve_public_form(p_username text)
returns table (
  workspace_id   uuid,
  owner_user_id  uuid,
  agent_name     text,
  brokerage_name text,
  photo_url      text,
  service_areas  text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.created_by,
    coalesce(
      nullif(trim(p.preferred_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Your Local Locator'
    ),
    coalesce(nullif(trim(p.brokerage), ''), nullif(trim(p.business_name), '')),
    p.profile_photo_url,
    coalesce(w.service_areas, '{}')
  from public.workspaces w
  join public.profiles p on p.id = w.created_by
  where w.slug = public.slugify(p_username)
  limit 1;
$$;

grant execute on function public.lb_resolve_public_form(text) to anon, authenticated;
