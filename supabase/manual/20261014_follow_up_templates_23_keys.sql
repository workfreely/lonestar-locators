-- ─────────────────────────────────────────────────────────────────────────────
-- FOLLOW-UP TEMPLATE OVERRIDES — accept the two keys the code already ships
--
-- `post_tour_multi` and `resume_search` were added to the in-code template map
-- (packages/companion-shared/src/format/followUpTemplates.ts — 23 keys, with
-- limits 140 and 200) but never to this RPC's accepted-key `case`. The RPC raises
-- `unknown_template_key` for anything not listed, so a locator editing either of
-- those two templates gets a hard failure. The code↔SQL mirror test caught it;
-- the test had been red rather than the drift being fixed.
--
-- WHY A NEW FILE AND NOT AN EDIT TO 20260922000004. That migration is already
-- applied. Editing it would change what the mirror test READS while production's
-- function kept the old 21-key `case` — a green test over a still-broken
-- database, which is worse than the red test it replaced. The test now resolves
-- the LATEST file that re-declares the function, which is this one.
--
-- Purely additive: `create or replace` with the existing 21 keys untouched at
-- their existing limits, plus the two missing ones. Storage column, security
-- definer scoping, workspace resolution and full-replace semantics unchanged.
--
-- Limits MUST stay equal to the in-code TEMPLATE_CHAR_LIMITS; the mirror test
-- asserts every key in both directions.
-- ─────────────────────────────────────────────────────────────────────────────

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
        -- Pre-list contact chase.
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
        -- ADDED HERE: shipped in code, previously rejected by this function.
        when 'post_tour_multi'           then 140
        when 'resume_search'             then 200
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

-- ─── VERIFICATION (read-only unless noted) ───────────────────────────────────
--
-- 1. The function now accepts 23 keys:
--
-- select count(*) as declared_keys
--   from regexp_matches(prosrc, 'when ''(\w+)''\s+then\s+\d+', 'g') as m(x)
--  where (select oid from pg_proc where proname = 'save_follow_up_templates' limit 1) is not null
--    and prosrc is not null;
--
--    Simpler form:
-- select prosrc like '%post_tour_multi%' as has_post_tour_multi,
--        prosrc like '%resume_search%'   as has_resume_search
--   from pg_proc where proname = 'save_follow_up_templates';
--
-- 2. Both previously-rejected keys now save (run as a signed-in member, then
--    roll back so no workspace override is actually left behind):
--
-- begin;
--   select public.save_follow_up_templates('{"post_tour_multi":"ok"}'::jsonb);
--   select public.save_follow_up_templates('{"resume_search":"ok"}'::jsonb);
-- rollback;
--
-- 3. An unknown key is still rejected (must RAISE unknown_template_key):
--
-- begin;
--   select public.save_follow_up_templates('{"not_a_key":"x"}'::jsonb);
-- rollback;
--
-- 4. The length cap still bites (must RAISE template_too_long — 141 chars):
--
-- begin;
--   select public.save_follow_up_templates(
--     jsonb_build_object('post_tour_multi', repeat('x', 141)));
-- rollback;
