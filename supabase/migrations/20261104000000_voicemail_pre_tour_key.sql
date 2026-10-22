-- ============================================================================
-- ALLOW THE pre_tour VOICEMAIL KEY
-- ============================================================================
-- The Pre-Tour script now has approved wording, so the save RPC may accept it.
-- 20261103000000 deliberately excluded it: a key with no script behind it would
-- have stored a template that did not exist.
--
-- MINIMAL BY DESIGN. One CREATE OR REPLACE of ONE function. No column changes, no
-- new objects, nothing touched on any other function, and no data is read or
-- written by applying it. Every other guard in that function is reproduced here
-- UNCHANGED — workspace scoping, the ownership WHERE clause, the server-derived
-- editedAt/editedBy, the empty-body and length checks.
--
-- PERMISSIONS ARE RE-ASSERTED. `create or replace` preserves an existing
-- function's ACL, so the revoke/grant below is belt-and-braces rather than a
-- correction — and it means this file is correct whether or not 20261103000000
-- was applied first.
--
-- DEPLOYMENT: apply THIS FILE ALONE via the dashboard SQL editor. Not
-- `supabase db push` — the ledger is out of step with the live catalog, so a push
-- would attempt far more than this. Idempotent; re-running is safe.

create or replace function public.save_lead_voicemail_script(
  p_lead_id bigint,
  p_template_key text,
  p_body text,
  p_specials_enabled boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws   uuid := public.current_workspace_id();
  v_uid  uuid := auth.uid();
  v_now  timestamptz := now();
begin
  if v_ws is null then raise exception 'no_workspace'; end if;

  -- ALLOWED KEYS. pre_tour joins the two List Sent scripts now that its wording is
  -- approved. Anything else is still refused.
  if p_template_key is null
     or p_template_key not in ('list_sent_30_90', 'list_sent_over_90', 'pre_tour') then
    raise exception 'invalid_template_key';
  end if;

  if p_body is null or btrim(p_body) = '' then
    raise exception 'empty_body';
  end if;

  if length(p_body) > 4000 then
    raise exception 'body_too_long';
  end if;

  -- Ownership is the WHERE clause; a lead outside the caller's workspace matches no
  -- row and raises below rather than being written. editedAt/editedBy are derived
  -- here, so a client cannot backdate a script or attribute it to someone else.
  -- NO updated_at: public.leads has no such column.
  update public.leads
     set voicemail_script = jsonb_build_object(
           'templateKey',     p_template_key,
           'body',            p_body,
           'specialsEnabled', coalesce(p_specials_enabled, false),
           'editedAt',        v_now,
           'editedBy',        v_uid
         )
   where id = p_lead_id
     and workspace_id = v_ws;

  if not found then raise exception 'not_found'; end if;
  return v_now;
end $$;

-- Re-assert permissions. Postgres grants EXECUTE to PUBLIC by default and anon
-- inherits PUBLIC, so the revoke is what actually excludes anon — not the grant.
revoke execute on function public.save_lead_voicemail_script(bigint, text, text, boolean) from public, anon;
grant  execute on function public.save_lead_voicemail_script(bigint, text, text, boolean) to authenticated;
