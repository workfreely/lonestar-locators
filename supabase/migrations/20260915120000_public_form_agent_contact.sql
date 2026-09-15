-- Expose the agent's CLIENT-FACING contact (phone + client email) through the
-- public form resolver so the thank-you page can render a proper signature
-- block. These are client-facing details by design (the same phone already
-- shown in the confirmation email; the client-facing email per the implemented
-- client_contact_email -> profiles.email rule). The login/account email is
-- never exposed on its own, and no platform/support address is returned.
--
-- SECURITY DEFINER + returns only public/client-facing columns, exactly like the
-- fields this resolver already exposes (name, brokerage, photo, service areas).
-- Adding columns is backward-compatible: existing callers select what they need.

drop function if exists public.lb_resolve_public_form(text);

create function public.lb_resolve_public_form(p_username text)
returns table(
  workspace_id uuid,
  owner_user_id uuid,
  agent_name text,
  brokerage_name text,
  photo_url text,
  service_areas text[],
  form_config jsonb,
  published_at timestamp with time zone,
  agent_phone text,
  agent_email text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    w.smart_form_published_at,
    -- client-facing phone
    nullif(trim(p.phone_number), ''),
    -- client-facing email: dedicated client contact email, else the profile email
    coalesce(nullif(trim(p.client_contact_email), ''), nullif(trim(p.email), ''))
  from public.workspaces w
  join public.profiles p on p.id = w.created_by
  where w.slug = public.slugify(p_username)
  limit 1;
$function$;

grant execute on function public.lb_resolve_public_form(text) to anon, authenticated, service_role;
