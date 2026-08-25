-- ============================================================================
-- Account Deletion (2/2): preflight + transactional data deletion
-- ============================================================================

-- ── 0. FIX: fingerprints must be immutable once set ─────────────────────────
-- The 1/2 trigger recomputed the fingerprint on every write to email/phone.
-- Account deletion anonymizes the plaintext, so that trigger would recompute
-- the fingerprint FROM THE PLACEHOLDER and destroy the real one — silently
-- re-granting a trial to a deleted user, which is the exact abuse this design
-- exists to prevent. Verified against a live probe before fixing.
--
-- The ledger is insert-only by design, so fill-if-absent is the correct rule:
-- a missing fingerprint gets computed, an existing one is never overwritten.
create or replace function public.lb_trial_usage_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.email_fp := coalesce(new.email_fp, public.lb_trial_fp('email', new.email));
  new.phone_fp := coalesce(new.phone_fp, public.lb_trial_fp('phone', new.phone));
  return new;
end $$;

revoke all on function public.lb_trial_usage_fingerprint() from public, anon, authenticated;

-- ── 1. Preflight ────────────────────────────────────────────────────────────
-- Takes NO user argument on purpose: it resolves auth.uid() itself, so a
-- caller cannot inspect another account. Safe to expose to `authenticated`.
--
-- co_members counts EVERY other member row regardless of status. An inactive
-- member is still a person with data in that workspace, and deleting the
-- workspace cascades shared CRM records — we do not destroy it on the strength
-- of a status flag.
create or replace function public.lb_account_deletion_preflight()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
  v_co  int := 0;
  v_leads int := 0;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;
  select w.id into v_ws from public.workspaces w where w.created_by = v_uid limit 1;

  if v_ws is not null then
    select count(*) into v_co
      from public.workspace_members m
     where m.workspace_id = v_ws and m.user_id <> v_uid;
    select count(*) into v_leads from public.leads l where l.workspace_id = v_ws;
  end if;

  return jsonb_build_object(
    'user_id',          v_uid,
    'email',            v_email,
    'owns_workspace',   v_ws is not null,
    'workspace_id',     v_ws,
    'co_members',       v_co,
    'lead_count',       v_leads,
    'workspace_will_be_deleted', v_ws is not null and v_co = 0,
    'blocked',          v_co > 0,
    'blocked_reason',   case when v_co > 0
      then 'This workspace has other members. Please contact support to transfer ownership before deleting your account.'
      else null end
  );
end $$;

revoke all on function public.lb_account_deletion_preflight() from public, anon;
grant execute on function public.lb_account_deletion_preflight() to authenticated;

-- ── 2. Transactional data deletion ──────────────────────────────────────────
-- Takes p_user_id because it runs from a server route AFTER that route has
-- authenticated the user; auth.uid() is null under the service role. The
-- arbitrary-user risk is closed by permissions, not by the signature: EXECUTE
-- is revoked from anon and authenticated and granted ONLY to service_role, so
-- no logged-in user can reach it through PostgREST with someone else's id.
--
-- Everything here is one transaction. External systems (Stripe, Google) are
-- handled by the caller BEFORE this runs, precisely because they cannot join it.
create or replace function public.lb_delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ws uuid;
  v_co int := 0;
  v_leads int := 0;
  v_ws_deleted boolean := false;
  v_slugs int := 0;
  v_trial int := 0;
begin
  if p_user_id is null then
    raise exception 'lb_delete_account_data: user id required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'lb_delete_account_data: no such user';
  end if;

  select w.id into v_ws from public.workspaces w where w.created_by = p_user_id limit 1;

  -- Re-checked HERE, inside the transaction, not merely at preflight — a member
  -- joining between the two would otherwise be raced past the safety rule.
  if v_ws is not null then
    select count(*) into v_co
      from public.workspace_members m
     where m.workspace_id = v_ws and m.user_id <> p_user_id;
    if v_co > 0 then
      raise exception 'workspace has % other member(s); ownership must be transferred first', v_co;
    end if;
    select count(*) into v_leads from public.leads l where l.workspace_id = v_ws;
  end if;

  -- Anonymize the trial ledger: keep the row and its fingerprints so repeat
  -- signups are still detected, drop the identifiers. email is NOT NULL, so it
  -- gets a non-identifying placeholder rather than null. The fill-if-absent
  -- trigger above leaves the existing fingerprints intact.
  update public.trial_usage
     set email = 'deleted:' || id::text,
         phone = null
   where user_id = p_user_id;
  get diagnostics v_trial = row_count;

  -- Release the public slug so the username becomes available again.
  delete from public.reserved_usernames where reserved_for_user_id = p_user_id;
  get diagnostics v_slugs = row_count;
  if v_ws is not null then
    update public.workspaces set slug = null where id = v_ws;
  end if;

  -- Sole member → the workspace goes, cascading its workspace-scoped data.
  if v_ws is not null and v_co = 0 then
    delete from public.workspaces where id = v_ws;
    v_ws_deleted := true;
  end if;

  -- Everything user-scoped cascades from here (profiles, workspace_members,
  -- device_tokens, google_credentials, smart_forms, companion_*, etc.).
  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'deleted_user_id',      p_user_id,
    'workspace_deleted',    v_ws_deleted,
    'workspace_id',         v_ws,
    'leads_deleted',        v_leads,
    'slugs_released',       v_slugs,
    'trial_rows_anonymized',v_trial
  );
end $$;

revoke all on function public.lb_delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.lb_delete_account_data(uuid) to service_role;
