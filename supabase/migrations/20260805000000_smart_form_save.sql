-- ============================================================================
-- Smart Lead Form: "always-live" save model (replaces the publish workflow)
-- ============================================================================
-- Product direction: every account has ONE live Smart Form. There is no
-- draft/published split — saving IS publishing. This migration introduces the
-- canonically-named save_smart_form() and keeps publish_smart_form() as a thin
-- backward-compatible alias so nothing that still calls it breaks.
--
-- NON-DESTRUCTIVE: the smart_form_published_at column is intentionally LEFT IN
-- PLACE (deferred cleanup). Nothing gates on it anymore, but save still stamps
-- it as a "last saved / live since" marker for bookkeeping.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).

-- Canonical: persist the caller's Smart Lead Form config and keep it live.
-- Same write path publish_smart_form always used; just the intent-revealing name.
create or replace function public.save_smart_form(p_config jsonb)
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
         -- Retained only as a "live since / last saved" marker; no code gates
         -- on it anymore. Stamp once, then keep it stable across later saves.
         smart_form_published_at = coalesce(smart_form_published_at, v_now),
         updated_at              = v_now
   where id = v_ws;
  return v_now;
end $$;

grant execute on function public.save_smart_form(jsonb) to authenticated;

-- Backward-compatible alias — existing callers keep working while we migrate
-- the editor over to save_smart_form. Delegates to the canonical function so
-- there is a single source of truth for the write.
create or replace function public.publish_smart_form(p_config jsonb)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select public.save_smart_form(p_config);
$$;

grant execute on function public.publish_smart_form(jsonb) to authenticated;
