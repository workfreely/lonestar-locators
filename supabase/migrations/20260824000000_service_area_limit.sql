-- ── Service areas: five is the rule, not a suggestion ────────────────────────
--
-- A workspace may serve at most 5 markets. The UI (Profile + onboarding) stops
-- a sixth from being selected, but the UI is convenience — this file is the
-- rule. Two layers, deliberately:
--
--   • set_workspace_service_areas raises a NAMED error the client can map to a
--     readable message, and never truncates: an oversized array is refused
--     outright so a user can never lose a selection silently.
--   • a CHECK constraint on the column is the backstop, covering every other
--     write path (direct SQL, a future admin tool, a mistaken migration).
--
-- No backfill: audited before writing this — the largest existing selection is
-- 4 markets, so no row violates the constraint and nothing needs correcting.

-- Backstop first. NOT VALID would skip the existing-row check; we want it
-- validated, and it passes today.
alter table public.workspaces
  drop constraint if exists workspaces_service_areas_max;

alter table public.workspaces
  add constraint workspaces_service_areas_max
  check (service_areas is null or array_length(service_areas, 1) is null or array_length(service_areas, 1) <= 5);

comment on constraint workspaces_service_areas_max on public.workspaces is
  'A workspace may serve at most 5 markets (MAX_SERVICE_AREAS in lib/markets/catalog.ts).';

-- Readable validation. Same signature and behavior as before, plus the limit.
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
  if v_count > 5 then
    raise exception 'too_many_service_areas';
  end if;

  update public.workspaces
  set service_areas = coalesce(p_areas, '{}'),
      updated_at = now()
  where id = v_ws;
end;
$$;
