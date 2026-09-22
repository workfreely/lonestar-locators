-- Follow-up template OVERRIDES — extend the accepted keys (Edit Follow-up
-- Templates checkpoint). Purely ADDITIVE + backward-compatible:
--   • the storage column, RPC contract, security-definer scoping and full-replace
--     semantics are UNCHANGED;
--   • existing saved overrides (intro / text_top_3 / follow_up_1..3 /
--     final_follow_up) keep working exactly as before;
--   • the accepted-key `case` is widened so the pre-list contact-chase keys (which
--     were in the in-code defaults but never accepted by the RPC) AND the new
--     Follow-Up Agent canonical templates can be saved.
--
-- Limits MUST stay in sync with the in-code TEMPLATE_CHAR_LIMITS (a unit test
-- asserts this mirror). Content only — no workflow/timing/automation.
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

  if p_templates is not null and jsonb_typeof(p_templates) <> 'object' then
    raise exception 'invalid_templates: expected a JSON object';
  end if;

  if p_templates is not null then
    for v_key, v_val in select key, value from jsonb_each(p_templates) loop
      v_limit := case v_key
        -- Legacy keys (unchanged).
        when 'intro'                     then 180
        when 'text_top_3'                then 200
        when 'follow_up_1'               then 140
        when 'follow_up_2'               then 140
        when 'follow_up_3'               then 140
        when 'final_follow_up'           then 180
        -- Pre-list contact chase (were in-code defaults; now saveable).
        when 'contact_follow_up_1'       then 180
        when 'contact_follow_up_2'       then 140
        when 'contact_follow_up_3'       then 180
        -- Follow-Up Agent Phase-1 canonical templates.
        when 'new_lead_text1'            then 180
        when 'new_lead_text2'            then 140
        when 'list_fu3_favorites'        then 200
        when 'list_fu3_no_favorites'     then 200
        when 'list_final'                then 200
        when 'ds_availability_submitted' then 200
        when 'ds_needs_availability'     then 220
        when 'ds_tour_now_or_wait'       then 220
        when 'future_move_wait_ack'      then 200
        when 'future_move_reactivate'    then 220
        when 'post_tour'                 then 140
        when 'application_status'        then 140
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
