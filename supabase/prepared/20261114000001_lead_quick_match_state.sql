-- PREPARED — NOT APPLIED TO PRODUCTION.
--
-- What makes a generated recommendation distinguishable from one the agent picked, and what
-- stops the automatic pass running twice.
--
-- ── WHY `origin` IS WHAT PROTECTS THE AGENT'S WORK ──────────────────────────────────────────
-- The approved behaviour is that a refresh must not overwrite recommendations the agent has
-- already chosen or reviewed. Without a marker, a refresh cannot tell its own previous output
-- from the agent's deliberate choices, so it either destroys their work or can never replace
-- anything. This column is the distinction that makes a safe refresh possible: a refresh may
-- replace rows it owns and that are unreviewed, and must leave everything else alone.
--
-- Follows the established lead_favorites.origin pattern (migration 20260917000000): nullable
-- text, legacy NULL meaning the pre-existing default — here "added by the agent" — so every row
-- already in the table keeps its current meaning and no backfill is needed.
--
-- ── WHY THE SCREENING DETAIL IS ITS OWN COLUMN ──────────────────────────────────────────────
-- It must never be in line to reach a renter. lead_recommendations.reasons is legacy and the
-- CLIENT-FACING reasons come from lead_property_reasons — lb_create_client_share and
-- lb_prepare_client_share both name their columns explicitly, so a column added here is invisible
-- to the share snapshot by construction rather than by a filter somebody has to remember. The
-- detail stored is internal locator intelligence ("evictions accepted only if the balance is paid
-- off") and some of it concerns the client themself, which is exactly why it goes here and not
-- into a column the share path reads.
--
-- ── WHY `leads.quick_match_at` AND NOT A RUN TABLE ──────────────────────────────────────────
-- One fact is needed: has the automatic pass happened for this client? A stamp answers it in one
-- nullable column with no RLS policies to write and no new table to keep in step. It is also the
-- thing that stops a property the agent DELIBERATELY REMOVED from reappearing the next time they
-- open the client: after the stamp, only an explicit refresh re-runs the draft.

alter table public.lead_recommendations
  add column if not exists origin      text,
  -- Set when the agent has looked at a generated draft and kept it. A refresh must never
  -- replace a row with this set.
  add column if not exists reviewed_at timestamptz,
  -- The agent-facing screening record: tier, reasons, open questions, documented conflicts,
  -- approval costs, and when it was computed.
  add column if not exists screening   jsonb;

alter table public.leads
  add column if not exists quick_match_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_recommendations_origin_vocab') then
    alter table public.lead_recommendations
      add constraint lead_recommendations_origin_vocab
      check (origin is null or origin in ('agent','quick_match')) not valid;
  end if;
end
$$;

-- A refresh deletes by (lead_id, origin, reviewed_at is null) on every run. 24 leads makes that
-- a sequential scan either way today, but the predicate is the one this feature issues most and
-- the index costs nothing on a table this size.
create index if not exists lead_recommendations_quick_match_idx
  on public.lead_recommendations (lead_id)
  where origin = 'quick_match';

comment on column public.lead_recommendations.origin is
  'NULL (legacy) or ''agent'' = added by hand; ''quick_match'' = generated draft. A refresh may only replace its own unreviewed rows.';
comment on column public.lead_recommendations.reviewed_at is
  'When the agent kept a generated draft. Set = no refresh may replace this row.';
comment on column public.lead_recommendations.screening is
  'AGENT-ONLY Quick Match detail. Deliberately outside lb_create_client_share / lb_prepare_client_share, which name their columns — nothing here reaches a client-facing page.';
comment on column public.leads.quick_match_at is
  'When the automatic Quick Match pass ran for this client. NULL = never. Set = only an explicit refresh re-runs it, so a removed property is not resurrected.';
