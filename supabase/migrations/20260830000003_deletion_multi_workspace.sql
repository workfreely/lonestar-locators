-- ============================================================================
-- Account Deletion (fix): a user can own MORE THAN ONE workspace
-- ============================================================================
-- The 2/2 functions did `select w.id ... where created_by = uid LIMIT 1`, which
-- assumed exactly one owned workspace. That is false: trg_provision_solo_workspace
-- auto-creates a workspace for every new profile, so any additional workspace
-- means two owned rows.
--
-- The consequences of the LIMIT 1 were both wrong AND unsafe, caught by the
-- destructive-path tests:
--   • it deleted whichever workspace the planner returned, not the one holding
--     the data — leaving the other orphaned, the exact problem this feature exists
--     to stop;
--   • the co-member safety check inspected only that one workspace, so an owner
--     whose SECOND workspace had other members was NOT blocked.
--
-- Both now consider EVERY owned workspace: blocked if ANY of them has another
-- member row (any status), otherwise all of them are deleted.
create or replace function public.lb_account_deletion_preflight()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ws_count int := 0;
  v_co int := 0;
  v_leads int := 0;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;

  select count(*) into v_ws_count from public.workspaces w where w.created_by = v_uid;

  -- Every other member row across ALL owned workspaces, regardless of status.
  select count(*) into v_co
    from public.workspace_members m
   where m.workspace_id in (select id from public.workspaces where created_by = v_uid)
     and m.user_id <> v_uid;

  select count(*) into v_leads
    from public.leads l
   where l.workspace_id in (select id from public.workspaces where created_by = v_uid);

  return jsonb_build_object(
    'user_id',        v_uid,
    'email',          v_email,
    'owns_workspace', v_ws_count > 0,
    'workspace_count',v_ws_count,
    'co_members',     v_co,
    'lead_count',     v_leads,
    'workspaces_will_be_deleted', case when v_co = 0 then v_ws_count else 0 end,
    'blocked',        v_co > 0,
    'blocked_reason', case when v_co > 0
      then 'This workspace has other members. Please contact support to transfer ownership before deleting your account.'
      else null end
  );
end $$;

revoke all on function public.lb_account_deletion_preflight() from public, anon;
grant execute on function public.lb_account_deletion_preflight() to authenticated;

create or replace function public.lb_delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_co int := 0;
  v_leads int := 0;
  v_ws_deleted int := 0;
  v_slugs int := 0;
  v_trial int := 0;
begin
  if p_user_id is null then
    raise exception 'lb_delete_account_data: user id required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'lb_delete_account_data: no such user';
  end if;

  -- Safety rule, re-evaluated inside the transaction across ALL owned
  -- workspaces so a member joining after preflight cannot be raced past it.
  select count(*) into v_co
    from public.workspace_members m
   where m.workspace_id in (select id from public.workspaces where created_by = p_user_id)
     and m.user_id <> p_user_id;

  if v_co > 0 then
    raise exception 'workspace has % other member(s); ownership must be transferred first', v_co;
  end if;

  select count(*) into v_leads
    from public.leads l
   where l.workspace_id in (select id from public.workspaces where created_by = p_user_id);

  -- Keep the trial row and its fingerprints; drop the identifiers. email is
  -- NOT NULL so it takes a non-identifying placeholder. The fill-if-absent
  -- fingerprint trigger leaves the existing fingerprints untouched.
  update public.trial_usage
     set email = 'deleted:' || id::text,
         phone = null
   where user_id = p_user_id;
  get diagnostics v_trial = row_count;

  delete from public.reserved_usernames where reserved_for_user_id = p_user_id;
  get diagnostics v_slugs = row_count;

  -- Sole owner across the board → every owned workspace goes, cascading its
  -- workspace-scoped data.
  delete from public.workspaces where created_by = p_user_id;
  get diagnostics v_ws_deleted = row_count;

  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'deleted_user_id',       p_user_id,
    'workspaces_deleted',    v_ws_deleted,
    'leads_deleted',         v_leads,
    'slugs_released',        v_slugs,
    'trial_rows_anonymized', v_trial
  );
end $$;

revoke all on function public.lb_delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.lb_delete_account_data(uuid) to service_role;
