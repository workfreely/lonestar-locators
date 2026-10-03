-- ─────────────────────────────────────────────────────────────────────────────
-- OUT OF OFFICE — workspace-level state (V1)
--
-- Two columns and one read-only resolver. V1 drives ONLY the public
-- /{username}/out-of-office landing page. The same state is intended to drive
-- one-time OOO auto-replies and a pause on automated outbound later; neither is
-- built here, and nothing in this migration touches the Follow-Up Agent.
--
-- COMPLETELY SEPARATE FROM RECOMMENDATION PAUSE. `share.status = 'disabled'` on
-- /r/<token> pauses ONE CLIENT'S share and is reversed by the client tapping
-- Resume Search. This is a LOCATOR being away, is workspace-wide, and has no
-- token, no client, and no resume path. They must never read each other.
--
-- WHY `date` AND NOT `timestamptz`:
--   • the client-facing copy is a calendar date ("will return on October 20"),
--     and an instant would be rendered down to one anyway;
--   • there is no timezone to anchor an instant to — workspaces.timezone is NULL
--     for every workspace today, so a timestamp would invent precision;
--   • a date-only value treated as an instant is exactly the bug that made
--     leads.move_date render a day early in Central. Rendering goes through the
--     canonical formatDateDisplay, never new Date().
-- Automation should combine this date with the existing resolve_timezone()
-- precedence rather than assuming UTC. A later "back at 1pm" need is an additive
-- `out_of_office_until_time time` column, not an overload of this one.
--
-- `enabled` is NOT NULL DEFAULT false so every existing workspace is explicitly
-- OFF. `until` stays nullable on purpose: "away, no return date yet" is a real
-- state, and the page omits the sentence rather than printing a placeholder.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.workspaces
  add column if not exists out_of_office_enabled boolean not null default false,
  add column if not exists out_of_office_until   date;

comment on column public.workspaces.out_of_office_enabled is
  'Locator is away. V1 drives only the public /{username}/out-of-office landing page. Intended later to drive one-time OOO auto-replies and a pause on automated outbound. Never read by recommendation pause/resume (share.status).';

comment on column public.workspaces.out_of_office_until is
  'Calendar date the locator returns, in their own timezone. A date, not a timestamp: the client-facing copy is a calendar date, and no workspace has a timezone set to anchor an instant to. Automation should combine this with resolve_timezone(), never assume UTC. NULL = away with no stated return date.';

-- Read-only resolver for the PUBLIC landing page.
--
-- A SEPARATE function from lb_resolve_public_form on purpose: adding return
-- columns to that one would change its signature and require dropping and
-- recreating a function the live Smart Lead Form depends on. This leaves that
-- path completely untouched; the cost is one extra query on a page that is not
-- hot.
--
-- security definer for the same reason as lb_resolve_public_form: anon cannot
-- read public.workspaces under RLS. It returns ONLY the two OOO fields — no
-- workspace id, no owner, nothing that could widen public exposure.
create or replace function public.lb_workspace_out_of_office(p_username text)
returns table (
  out_of_office_enabled boolean,
  out_of_office_until   date
)
language sql
stable
security definer
set search_path = public
as $$
  select w.out_of_office_enabled, w.out_of_office_until
  from public.workspaces w
  where w.slug = public.slugify(p_username)
  limit 1;
$$;

grant execute on function public.lb_workspace_out_of_office(text) to anon, authenticated;

commit;

-- ─── VERIFICATION (read-only; run after the transaction) ─────────────────────
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name='workspaces'
--    and column_name like 'out_of_office%';
--
-- select count(*) as workspaces,
--        count(*) filter (where out_of_office_enabled) as enabled   -- expect 0
--   from public.workspaces;
--
-- select * from public.lb_workspace_out_of_office('jay-morris');
