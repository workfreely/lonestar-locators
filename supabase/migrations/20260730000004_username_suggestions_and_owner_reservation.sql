-- ============================================================================
-- Username suggestions + owner reservation update
-- ============================================================================
--   1. lb_suggest_usernames(): available, slug-valid alternatives for a base.
--   2. reserved_usernames gains reserved_for_user_id so the owner reservation
--      can later be tied to an IMMUTABLE user id without behavior change (email
--      is used until the account exists / is known).
--   3. jay-morris is (re)reserved permanently for locatorbeast@gmail.com.
--   4. Availability/set functions honor reserved_for_user_id first, then email.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).
-- Idempotent — safe whether or not 20260730000003 has already been applied.

-- 1) Future-proof: allow tying a reservation to an immutable auth user id.
alter table public.reserved_usernames add column if not exists reserved_for_user_id uuid;

-- 2) Owner permanent reservation → locatorbeast@gmail.com. Upsert so it updates
--    an existing row (from 20260730000003) or inserts if not present. user_id is
--    left null now and can be set to the owner's uuid later with no behavior
--    change (the functions below prefer user_id when present, else email).
insert into public.reserved_usernames (slug, reserved_for_email, reason)
values ('jay-morris', 'locatorbeast@gmail.com', 'owner permanent reservation')
on conflict (slug) do update
  set reserved_for_email = excluded.reserved_for_email,
      reason             = excluded.reason;

-- 3) Availability: user_id-first, then email, then blocked-for-all.
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
  v_res_uid       uuid;
  v_res_email     text;
  v_found         boolean := false;
begin
  if v_slug is null or length(v_slug) < 3 or length(v_slug) > 30 then
    return false;
  end if;

  select reserved_for_user_id, reserved_for_email
    into v_res_uid, v_res_email
  from public.reserved_usernames where slug = v_slug;
  v_found := found;

  if v_found then
    if v_res_uid is not null then
      if v_res_uid <> auth.uid() then return false; end if;   -- reserved for another account
    elsif v_res_email is not null then
      if v_email is null or lower(v_res_email) <> v_email then return false; end if;
    else
      return false;                                           -- blocked for everyone
    end if;
    -- otherwise reserved for the caller → allowed to continue
  end if;

  return not exists (
    select 1 from public.workspaces w
    where w.slug = v_slug and (v_ws is null or w.id <> v_ws)
  );
end $$;

grant execute on function public.lb_username_available(text) to authenticated;

-- 4) Set: same reservation logic, raises stable error strings.
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
  v_res_uid   uuid;
  v_res_email text;
  v_found     boolean := false;
begin
  if v_ws is null then
    raise exception 'no_workspace';
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

-- 5) Suggestions: available, slug-valid variants of a base (never auto-assigned;
--    the UI shows them and the user must choose). Returns only AVAILABLE ones,
--    evaluated with the same lb_username_available rules (format + reservations
--    + uniqueness, relative to the current caller).
create or replace function public.lb_suggest_usernames(p_base text, p_limit int default 6)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root     text := public.slugify(p_base);
  v_suffixes text[] := array[
    '1', 'tx', 'sa', 'realty', 'home', 'apartments',
    'locator', 'homes', 'rentals', 'leasing', '2', '3'
  ];
  v_cand text;
  v_out  text[] := '{}';
  s      text;
begin
  if v_root is null or v_root = '' then
    return v_out;
  end if;

  foreach s in array v_suffixes loop
    exit when coalesce(array_length(v_out, 1), 0) >= p_limit;
    v_cand := public.slugify(v_root || '-' || s);
    if length(v_cand) between 3 and 30
       and not (v_cand = any(v_out))
       and public.lb_username_available(v_cand) then
      v_out := array_append(v_out, v_cand);
    end if;
  end loop;

  return v_out;
end $$;

grant execute on function public.lb_suggest_usernames(text, integer) to authenticated;
