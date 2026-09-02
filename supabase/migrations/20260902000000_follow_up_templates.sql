-- ============================================================================
-- Editable follow-up message templates: workspace-level OVERRIDES (CP2)
-- ============================================================================
-- Product direction: agents may customize the TEXT of the live follow-up SMS
-- templates. Defaults live in code (packages/companion-shared); this stores ONLY
-- the keys an agent has customized. A missing key means "use the code default",
-- so Reset-to-Default is simply removing that key on the next save.
--
-- CONTENT-ONLY: these keys look up message wording. They are NOT workflow
-- action_key values and this migration changes NOTHING about the workflow
-- engine, Next Actions, timing, stages, overdue logic, or automation.
--
-- Mirrors the existing workspace-config write pattern (save_smart_form):
-- a jsonb column on workspaces + a security-definer RPC scoped to the caller's
-- current_workspace_id(), granted to authenticated.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).

-- 1) Column: only-customized overrides, keyed by content template key. Null /
--    absent key → the code default is used at render time.
alter table public.workspaces
  add column if not exists follow_up_templates jsonb;

comment on column public.workspaces.follow_up_templates is
  'Workspace-level follow-up SMS template TEXT overrides, keyed by content key '
  '(intro, text_top_3, follow_up_1..3, final_follow_up). Stores only customized '
  'keys; a missing key uses the in-code default. Content only — never workflow.';

-- 2) Save RPC. Validates the payload server-side (allowed keys, string values,
--    per-key max length matching the in-code TEMPLATE_CHAR_LIMITS) and replaces
--    the whole overrides object. Callers send ONLY the keys they customized, so
--    a full replace naturally drops a key that was reset to default.
create or replace function public.save_follow_up_templates(p_templates jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws    uuid := public.current_workspace_id();
  v_now   timestamptz := now();
  v_key   text;
  v_val   jsonb;
  v_limit int;
begin
  if v_ws is null then
    raise exception 'no_workspace';
  end if;

  -- Accept null (clear all overrides) or a JSON object; reject anything else.
  if p_templates is not null and jsonb_typeof(p_templates) <> 'object' then
    raise exception 'invalid_templates: expected a JSON object';
  end if;

  if p_templates is not null then
    for v_key, v_val in select key, value from jsonb_each(p_templates) loop
      -- Allowed content keys + their max lengths. MUST stay in sync with the
      -- in-code TEMPLATE_CHAR_LIMITS (a unit test asserts this mirror matches).
      v_limit := case v_key
        when 'intro'           then 180
        when 'text_top_3'      then 200
        when 'follow_up_1'     then 140
        when 'follow_up_2'     then 140
        when 'follow_up_3'     then 140
        when 'final_follow_up' then 180
        else null
      end;

      if v_limit is null then
        raise exception 'unknown_template_key: %', v_key;
      end if;
      if jsonb_typeof(v_val) <> 'string' then
        raise exception 'invalid_template_value: % must be a string', v_key;
      end if;
      if char_length(v_val #>> '{}') > v_limit then
        raise exception 'template_too_long: % exceeds % chars', v_key, v_limit;
      end if;
    end loop;
  end if;

  update public.workspaces
     set follow_up_templates = p_templates,
         updated_at          = v_now
   where id = v_ws;

  return v_now;
end $$;

grant execute on function public.save_follow_up_templates(jsonb) to authenticated;
