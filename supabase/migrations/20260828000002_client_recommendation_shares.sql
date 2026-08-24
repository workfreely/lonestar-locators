-- ============================================================================
-- Phase 2 - client_recommendation_shares (secure share links)
-- ============================================================================
-- One persistent, revocable share link per client for the public Recommendation
-- page. This migration creates ONLY the link model: no public page, no RPCs, no
-- Favorite writes, no Send List integration.
--
-- TOKEN MODEL (identical to device_tokens / companion_refresh_tokens):
-- the raw token is generated server-side, returned to the caller ONCE, and never
-- stored. Only sha256(raw) is persisted, so a database leak cannot yield a
-- working share URL. token_prefix exists purely so the agent UI can identify a
-- link without holding the secret.
--
-- ACCESS STATE is two nullable timestamps rather than an enum, matching this
-- schema's convention (revoked_at / rotated_at / completed_at) and recording
-- WHEN, which an enum discards:
--   revoked_at set -> revoked (terminal; the token is dead)
--   else paused_at -> paused  (reversible; SAME url, content withheld)
--   else           -> active
-- Pausing is therefore a single-column update. That is what structurally
-- guarantees it cannot delete recommendations or favorites, cannot touch the
-- client's CRM stage, and cannot mint a new URL.
--
-- The properties themselves are NOT modelled here: lead_recommendations and
-- lead_favorites remain the source of truth, so the page reflects list changes
-- with no action on this table.

create table if not exists public.client_recommendation_shares (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid   not null references public.workspaces(id) on delete cascade,
  lead_id        bigint not null references public.leads(id)      on delete cascade,
  -- sha256(raw token) hex. The raw token is shown once and never stored.
  token_hash     text   not null unique,
  -- Short display fragment for the agent UI (e.g. "lbr_ab12"). Not a secret.
  token_prefix   text   not null,
  created_at     timestamptz not null default now(),
  last_viewed_at timestamptz,
  paused_at      timestamptz,
  revoked_at     timestamptz
);

-- ONE active link per client. A revoked row keeps its history but frees the
-- slot, so "Regenerate Link" is: revoke the old row, insert a new one. A PAUSED
-- row still holds the slot, which is exactly why resuming returns the same URL.
create unique index if not exists client_rec_shares_one_active
  on public.client_recommendation_shares (lead_id)
  where revoked_at is null;

create index if not exists client_rec_shares_workspace_idx
  on public.client_recommendation_shares (workspace_id);
create index if not exists client_rec_shares_lead_idx
  on public.client_recommendation_shares (lead_id);

-- ── Workspace ownership derives from the LEAD, not from auth.uid() ───────────
-- The shared set_workspace_ownership() trigger resolves the workspace from
-- auth.uid() (or from "there is exactly one workspace"). Share links are issued
-- SERVER-SIDE with the service role, where auth.uid() is null and more than one
-- workspace now exists, so that trigger would leave workspace_id null and create
-- a row invisible to its own workspace. The only correct source here is the
-- parent lead, so this table gets its own derivation and workspace_id is NOT
-- NULL - a share that cannot be attributed must fail loudly, never be stored.
--
-- It also makes a cross-tenant share unrepresentable: the workspace always comes
-- from the lead, so a caller cannot point a share at another workspace's client.
create or replace function public.set_share_workspace_from_lead()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ws uuid;
begin
  select l.workspace_id into v_ws from public.leads l where l.id = new.lead_id;
  if v_ws is null then
    raise exception 'client_recommendation_shares: lead % has no workspace_id', new.lead_id;
  end if;
  new.workspace_id := v_ws;   -- always authoritative; a supplied value is ignored
  return new;
end $$;

drop trigger if exists trg_share_workspace on public.client_recommendation_shares;
create trigger trg_share_workspace
  before insert on public.client_recommendation_shares
  for each row execute function public.set_share_workspace_from_lead();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Members of the owning workspace may READ their links (to display/copy) and
-- UPDATE them (pause / resume / revoke). There is deliberately NO insert policy
-- and NO delete policy: issuance is service-role only, mirroring device_tokens,
-- and a link is revoked rather than deleted so the history survives.
--
-- anon gets NOTHING on this table. The public page will read through a
-- SECURITY DEFINER function in a later phase; it will never select here directly.
alter table public.client_recommendation_shares enable row level security;

drop policy if exists "members read client_recommendation_shares" on public.client_recommendation_shares;
create policy "members read client_recommendation_shares"
  on public.client_recommendation_shares for select
  using (public.is_active_workspace_member(workspace_id));

drop policy if exists "members update client_recommendation_shares" on public.client_recommendation_shares;
create policy "members update client_recommendation_shares"
  on public.client_recommendation_shares for update
  using (public.is_active_workspace_member(workspace_id))
  with check (public.is_active_workspace_member(workspace_id));

comment on table public.client_recommendation_shares is
  'One revocable share link per client for the public Recommendation page. Stores only sha256(token); paused_at/revoked_at gate public access without touching recommendations, favorites, or CRM stage.';
