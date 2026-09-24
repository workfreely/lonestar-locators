-- Client-facing "Resume Your Search" from a DISABLED /r recommendations link.
--
-- Re-engages the LEAD (fresh intake) without re-opening the stale property list:
--   • the recommendations share stays disabled (disabled_at untouched)
--   • On Hold / Archived / Ghosted  -> crm_status = 'new' (no prior-stage restore)
--   • already-active leads           -> stage unchanged
--   • closed/leased                  -> NO stage change (never auto-reopen a closed deal)
-- Every case creates ONE due-now Next Action so the lead lands in the Agenda today,
-- records a single 'resumed' timeline event, and preserves all existing data
-- (notes/messages/favorites/recommendations/tours/history/commission). Idempotent:
-- the first request flips resumed_at atomically; repeats return already-resumed.

alter table public.client_recommendation_shares
  add column if not exists resumed_at timestamptz;

-- Add 'resume_search' to the canonical Next Action action_key allowlist so the
-- Resume workflow can create its due-now action.
alter table public.lead_next_actions drop constraint if exists lead_next_actions_action_key_chk;
alter table public.lead_next_actions add constraint lead_next_actions_action_key_chk
  check (action_key is null or action_key = any (array[
    'contact_lead','contacted_follow_up','contact_follow_up_1','contact_follow_up_2','contact_follow_up_3',
    'build_list','send_list','setup_tour','tour_follow_up','start_application','check_application',
    'confirm_lease','get_invoice_details','send_invoice','commission_paid','setup_movers','send_rebate',
    'lease_follow_up','follow_up_1','follow_up_2','follow_up_3','final_follow_up','reconnect_client',
    'email_guest_card','resume_search']));

create or replace function public.lb_client_resume_search(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_share  record;
  v_lead   record;
  v_owner  record;
  v_from_stage text;
  v_was_hold   boolean := false;
  v_is_closed  boolean := false;
  v_action_key   constant text := 'resume_search';
  v_action_title text;
  v_prepared     text;
  v_first_name   text;
begin
  -- Resolve share by token; unknown/revoked -> silent no-op.
  select s.id, s.lead_id, s.workspace_id, s.disabled_at, s.resumed_at
    into v_share
  from public.client_recommendation_shares s
  where s.token_hash = p_token_hash and s.revoked_at is null
  limit 1;
  if v_share.id is null then return null; end if;

  -- Resume is only meaningful for a DISABLED (paused) share. An active share has no
  -- paused page / Resume button; never reactivate the lead from an active share.
  if v_share.disabled_at is null then return null; end if;

  -- Atomic first-resume guard: only the first request flips resumed_at. Subsequent
  -- taps/refreshes update no row -> idempotent already-resumed (no further writes).
  update public.client_recommendation_shares
    set resumed_at = now()
  where id = v_share.id and resumed_at is null;
  if not found then
    return jsonb_build_object('ok', true, 'alreadyResumed', true);
  end if;

  -- Resolve the existing lead (never created/duplicated).
  select l.id, l.crm_status, l.archive_reason, l.held_at, l.first_name,
         l.workspace_id, l.owner_user_id
    into v_lead
  from public.leads l where l.id = v_share.lead_id limit 1;
  if v_lead.id is null then
    return jsonb_build_object('ok', true, 'alreadyResumed', false);
  end if;

  v_from_stage := v_lead.crm_status;
  v_was_hold   := (v_lead.held_at is not null);
  v_is_closed  := (v_lead.crm_status = 'closed')
               or (v_lead.crm_status = 'archived' and v_lead.archive_reason = 'closed');
  v_first_name := nullif(btrim(v_lead.first_name), '');

  -- ── State transition (fresh intake); all other data is preserved untouched ──
  if v_is_closed then
    null;                                   -- closed/leased: never auto-reopen
  elsif v_was_hold then
    update public.leads                     -- On Hold -> New (no prior-stage restore)
      set crm_status = 'new', held_at = null, hold_follow_up_at = null
    where id = v_lead.id;
  elsif v_lead.crm_status = 'archived' then
    update public.leads                     -- Archived / Ghosted -> New
      set crm_status = 'new', archive_reason = null
    where id = v_lead.id;
  else
    null;                                   -- already active -> keep current stage
  end if;

  -- ── One due-now Next Action so the lead surfaces in the Agenda today ──
  v_action_title := case when v_is_closed
    then 'Former client wants to resume — reach out'
    else 'Resume Search' end;
  v_prepared := case when v_first_name is not null
    then 'Hey ' || v_first_name || '! I got your request to continue your apartment search. Has anything changed since we last talked or would you like me to update your list?'
    else 'Hey! I got your request to continue your apartment search. Has anything changed since we last talked or would you like me to update your list?' end;

  begin
    insert into public.lead_next_actions
      (lead_id, title, due_at, priority, completed, action_type, origin, action_key,
       status, workflow_version, workspace_id, owner_user_id, notes)
    values
      (v_lead.id, v_action_title, now(), 'high', false, 'workflow', 'workflow',
       v_action_key, 'open', 1, v_lead.workspace_id, v_lead.owner_user_id, v_prepared);
  exception when unique_violation then
    null;  -- lead_next_actions_one_open_per_action_uidx backstop -> idempotent no-op
  end;

  -- ── Single 'resumed' timeline event (guarded by the resumed_at flip above) ──
  insert into public.lead_timeline (lead_id, type, method, metadata, occurred_at, workspace_id, owner_user_id)
  values (
    v_lead.id, 'resumed', 'recommendations_page',
    jsonb_build_object('from_stage', v_from_stage, 'source', 'recommendations_page',
                       'was_hold', v_was_hold, 'closed', v_is_closed),
    now(), v_lead.workspace_id, v_lead.owner_user_id
  );

  -- ── Locator identity for the one-time server-side notification ──
  select p.email,
         coalesce(nullif(btrim(p.preferred_first_name), ''),
                  nullif(btrim(p.first_name), ''),
                  nullif(btrim(p.preferred_name), '')) as first_name
    into v_owner
  from public.profiles p where p.id = v_lead.owner_user_id limit 1;

  return jsonb_build_object(
    'ok', true,
    'alreadyResumed', false,
    'clientFirstName', v_first_name,
    'closed', v_is_closed,
    'locatorEmail', v_owner.email,
    'agentFirstName', v_owner.first_name
  );
end;
$function$;
