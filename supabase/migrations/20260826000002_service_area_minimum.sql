-- ── Service areas: a workspace must serve BETWEEN 1 AND 5 markets ────────────
--
-- The maximum of 5 was already enforced in four places (onboarding UI, Profile
-- UI, this RPC, and the workspaces_service_areas_max CHECK constraint). The
-- MINIMUM of 1 was enforced nowhere: onboarding's Continue button ignored the
-- selection entirely, Profile allowed deselecting the last market, and this RPC
-- happily wrote an empty array (it even coalesced NULL to '{}').
--
-- An empty selection is not harmless: the Smart Form falls back to displaying
-- ALL markets when service_areas is empty, so a workspace that saved zero
-- markets silently advertises every market Locator Beast supports. That
-- fallback is a display default, NOT validation.
--
-- This migration adds the floor to the RPC — the server-side backstop behind
-- the two UI guards. It deliberately does NOT add the matching CHECK constraint
-- yet: one real workspace still has service_areas = '{}' and will stay that way
-- until its owner completes onboarding through the normal flow. Adding a
-- validating constraint now would fail against that row. The constraint lands
-- in a follow-up migration once no violating rows remain.
--
-- The error name mirrors the existing too_many_service_areas so the client can
-- classify both the same way (lib/supabase/serviceAreasDiagnostics.ts).

create or replace function public.set_workspace_service_areas(p_areas text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws    uuid;
  v_count int;
begin
  v_ws := public.current_workspace_id();
  if v_ws is null then
    raise exception 'no active workspace for current user';
  end if;

  -- array_length is NULL for an empty array, hence the coalesce.
  v_count := coalesce(array_length(p_areas, 1), 0);
  if v_count < 1 then
    raise exception 'no_service_areas';
  end if;
  if v_count > 5 then
    raise exception 'too_many_service_areas';
  end if;

  update public.workspaces
  set service_areas = p_areas,
      updated_at = now()
  where id = v_ws;
end;
$$;

comment on function public.set_workspace_service_areas(text[]) is
  'Sets the caller workspace''s markets. Requires between 1 and 5 catalog slugs; '
  'raises no_service_areas / too_many_service_areas outside that range.';
