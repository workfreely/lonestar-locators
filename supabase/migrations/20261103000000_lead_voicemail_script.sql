-- ============================================================================
-- AGENT-ONLY VOICEMAIL SCRIPT, saved per lead
-- ============================================================================
-- A reading aid. The locator opens it while dialling and reads it aloud; nothing
-- here is ever sent to anyone. It is NOT notes, NOT a message, and NOT workflow:
-- this migration changes nothing about Next Actions, stages, timing, texting or
-- tour booking, and creates no automation of any kind.
--
-- WHY A COLUMN AND NOT A TABLE. One row per lead, no history, no relations — the
-- shape of a column. `leads` already carries agent-private fields of exactly this
-- kind (locator_notes, invoice_notes, ooo_held_at), so this follows the existing
-- grain instead of adding a table that would need its own RLS, indexes and cascade.
--
-- WHY IT CANNOT REACH A CLIENT. lb_resolve_client_recommendations — the only
-- public, anon-reachable path that touches `leads` — returns an EXPLICIT column
-- list (client_first_name, client_city) and never `select *`. A new column is
-- structurally invisible to the renter's share page. Nothing below grants anon
-- anything.
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project (supabase db push).

-- 1) The column. Nullable: a lead with no saved script is the normal case, and
--    absent means "render the template fresh", never "render an empty script".
alter table public.leads
  add column if not exists voicemail_script jsonb;

comment on column public.leads.voicemail_script is
  'AGENT-ONLY voicemail reading aid for this lead: {templateKey, body, '
  'specialsEnabled, editedAt, editedBy}. Never client-facing — the public share '
  'RPC returns an explicit column list that excludes it. Not notes, not a message, '
  'not workflow. Null means no saved script; the panel renders the template.';

-- 2) Save RPC. Workspace-scoped and validating, because the caller is a browser.
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

  -- ALLOWED KEYS ONLY. The third template is deliberately absent: it has no
  -- approved wording yet, so a client claiming it would be storing a script that
  -- does not exist. pre_tour is added here when that copy is approved.
  if p_template_key is null
     or p_template_key not in ('list_sent_30_90', 'list_sent_over_90') then
    raise exception 'invalid_template_key';
  end if;

  if p_body is null or btrim(p_body) = '' then
    raise exception 'empty_body';
  end if;

  -- A spoken voicemail is short. The cap is generous enough for a long edit and
  -- small enough that this column can never become a document store.
  if length(p_body) > 4000 then
    raise exception 'body_too_long';
  end if;

  -- OWNERSHIP IS THE WHERE CLAUSE. A lead outside the caller's workspace matches
  -- no row, so `not found` below turns it into an error rather than a silent
  -- write — and never discloses whether that lead exists.
  --
  -- editedAt and editedBy are derived HERE, from now() and auth.uid(). A client
  -- cannot backdate a script or attribute it to another member.
  update public.leads
     set voicemail_script = jsonb_build_object(
           'templateKey',     p_template_key,
           'body',            p_body,
           'specialsEnabled', coalesce(p_specials_enabled, false),
           'editedAt',        v_now,
           'editedBy',        v_uid
         ),
         updated_at = v_now
   where id = p_lead_id
     and workspace_id = v_ws;

  if not found then raise exception 'not_found'; end if;
  return v_now;
end $$;

-- 3) Clear RPC — "reset to template" is the ABSENCE of a saved script, not an
--    empty one, so the panel falls back to rendering the template fresh.
create or replace function public.clear_lead_voicemail_script(p_lead_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws  uuid := public.current_workspace_id();
  v_now timestamptz := now();
begin
  if v_ws is null then raise exception 'no_workspace'; end if;
  update public.leads
     set voicemail_script = null, updated_at = v_now
   where id = p_lead_id and workspace_id = v_ws;
  if not found then raise exception 'not_found'; end if;
  return v_now;
end $$;

-- 4) PERMISSIONS — revoke first, then grant. This order matters.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and `anon` inherits PUBLIC.
-- Granting `authenticated` therefore does NOT exclude anyone: without the revoke below, these
-- SECURITY DEFINER functions would be callable by an anonymous request. They would still fail —
-- current_workspace_id() is null without a session, so both raise 'no_workspace' — but that is an
-- accident of the implementation, not a permission. An anon caller should not reach the function
-- body at all.
revoke execute on function public.save_lead_voicemail_script(bigint, text, text, boolean) from public, anon;
revoke execute on function public.clear_lead_voicemail_script(bigint) from public, anon;

grant execute on function public.save_lead_voicemail_script(bigint, text, text, boolean) to authenticated;
grant execute on function public.clear_lead_voicemail_script(bigint) to authenticated;
