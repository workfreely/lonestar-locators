-- ============================================================================
-- Smart Lead Form: publish + persist (workspace is the source of truth)
-- ============================================================================
-- One Smart Lead Form per workspace (solo model). The published config lives on
-- the workspace, addressed by the existing public username (workspaces.slug) —
-- no second slug, no sync layer. Built so multiple forms could be added later
-- without changing this shape, but not adding that complexity now.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).

alter table public.workspaces
  add column if not exists smart_form_config       jsonb,
  add column if not exists smart_form_published_at timestamptz;

-- Publish (persist + go live) the caller's Smart Lead Form config. Editing is
-- ephemeral in the builder; Publish commits the config and marks it live.
create or replace function public.publish_smart_form(p_config jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws  uuid := public.current_workspace_id();
  v_now timestamptz := now();
begin
  if v_ws is null then
    raise exception 'no_workspace';
  end if;
  update public.workspaces
     set smart_form_config       = p_config,
         smart_form_published_at = v_now,
         updated_at              = v_now
   where id = v_ws;
  return v_now;
end $$;

grant execute on function public.publish_smart_form(jsonb) to authenticated;

-- Load the caller's saved form (for the builder to start from the live version).
create or replace function public.get_smart_form()
returns table (config jsonb, published_at timestamptz, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select w.smart_form_config, w.smart_form_published_at, w.slug
  from public.workspaces w
  where w.id = public.current_workspace_id();
$$;

grant execute on function public.get_smart_form() to authenticated;

-- Public resolver now also returns the saved config + published_at so the public
-- /{username} page can render the agent's OWN configured form (only when live).
-- Agent identity (name/brokerage/photo) still comes from the live profile so it
-- reflects account edits, not stale editor copy.
create or replace function public.lb_resolve_public_form(p_username text)
returns table (
  workspace_id   uuid,
  owner_user_id  uuid,
  agent_name     text,
  brokerage_name text,
  photo_url      text,
  service_areas  text[],
  form_config    jsonb,
  published_at   timestamptz
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
    coalesce(w.service_areas, '{}'),
    w.smart_form_config,
    w.smart_form_published_at
  from public.workspaces w
  join public.profiles p on p.id = w.created_by
  where w.slug = public.slugify(p_username)
  limit 1;
$$;

grant execute on function public.lb_resolve_public_form(text) to anon, authenticated;
