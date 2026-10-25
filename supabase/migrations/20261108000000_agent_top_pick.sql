-- ============================================================================
-- AGENT TOP PICK — "My Top Pick for You"
-- ============================================================================
-- The locator's own recommendation: one property on a client's recommendation
-- list that they personally put forward. It is NOT the client's Top Pick, and
-- the two must never be confused:
--
--   leads.top_pick_favorite_id              THE CLIENT'S choice, a favorite the
--                                           client is moving on. Owned by the
--                                           Tour Follow-Up / application flows.
--                                           UNTOUCHED by anything here.
--
--   leads.agent_top_pick_recommendation_id  THE AGENT'S choice, a recommendation
--                                           they are highlighting. New, below.
--
-- A client may favorite something the agent did not pick, and the agent may pick
-- something the client never favorites. Both facts stand; neither writes the
-- other. They are separate columns pointing at separate tables.
--
-- ── WHY A SCALAR FK, LIKE THE CLIENT'S ──────────────────────────────────────
-- Exactly the shape top_pick_favorite_id already uses, for the same three
-- reasons: a column holds ONE value, so "at most one per client" is structural
-- rather than a partial unique index or a trigger; it is O(1) to read; and
-- ON DELETE SET NULL means removing a property from the list clears the
-- designation for free, so a removed recommendation can never keep its badge.
--
-- Additive and nullable. Every existing lead keeps NULL, which renders nothing,
-- so no row needs a backfill and nothing already saved changes.

alter table public.leads
  add column if not exists agent_top_pick_recommendation_id bigint
  references public.lead_recommendations(id) on delete set null;

create index if not exists leads_agent_top_pick_recommendation_id_idx
  on public.leads (agent_top_pick_recommendation_id);

-- ── THE OWNERSHIP SAFEGUARD ─────────────────────────────────────────────────
-- The foreign key above promises the recommendation EXISTS. It does not promise
-- it belongs to THIS lead — nothing stops lead A pointing at lead B's row, and a
-- mis-scoped id would sit there permanently. The front end checks it too, but a
-- front-end check is a convenience, not a constraint.
--
-- A composite FK (id, agent_top_pick_recommendation_id) → (lead_id, id) would say
-- this structurally, but its ON DELETE SET NULL nulls EVERY referencing column —
-- including leads.id — unless the server is PG15+, where a column list is allowed.
-- This trigger says the same thing on every version.
--
-- IT IS INERT FOR EVERY OTHER WRITE. `update of agent_top_pick_recommendation_id`
-- means Postgres only fires it when that column is in the UPDATE's target list, so
-- the eight other lead-column writes this app performs never reach it at all.
--
-- CLEARING STILL WORKS, and so does ON DELETE SET NULL: both arrive as the column
-- being set to NULL, which returns on the first line. The constraint has nothing to
-- say about the absence of a pick.

create or replace function public.lb_assert_agent_top_pick_belongs_to_lead()
returns trigger
language plpgsql
as $$
begin
  -- No pick is always valid — this is how clearing, and the FK's own ON DELETE SET
  -- NULL, pass through untouched.
  if new.agent_top_pick_recommendation_id is null then
    return new;
  end if;

  -- An update that re-states the value it already held changed nothing worth
  -- re-validating.
  if tg_op = 'UPDATE'
     and old.agent_top_pick_recommendation_id
         is not distinct from new.agent_top_pick_recommendation_id then
    return new;
  end if;

  if not exists (
    select 1
      from public.lead_recommendations r
     where r.id = new.agent_top_pick_recommendation_id
       and r.lead_id = new.id
  ) then
    raise exception
      'agent_top_pick_recommendation_id % does not belong to lead %',
      new.agent_top_pick_recommendation_id, new.id
      using errcode = '23514';  -- check_violation
  end if;

  return new;
end;
$$;

drop trigger if exists leads_agent_top_pick_belongs_to_lead on public.leads;
create trigger leads_agent_top_pick_belongs_to_lead
  before insert or update of agent_top_pick_recommendation_id
  on public.leads
  for each row
  execute function public.lb_assert_agent_top_pick_belongs_to_lead();

comment on column public.leads.agent_top_pick_recommendation_id is
  'THE AGENT''S "My Top Pick for You" — one lead_recommendations row the locator personally highlights, or NULL. Independent of top_pick_favorite_id, which is the CLIENT''S own choice among their favorites. Neither column is derived from the other.';


-- ============================================================================
-- The client-facing lookup
-- ============================================================================
-- A NEW function rather than a change to lb_resolve_client_recommendations.
-- That resolver is long, has been replaced by several migrations, and the badge
-- needs one integer from it — replacing it wholesale to add a field risks
-- reverting a later change this file does not know about. This sits beside it.
--
-- IT RETURNS A POSITION, NOT A FLAG, because the client page already keys every
-- property by `index` (which is client_recommendation_share_items.sort_order —
-- the same value the resolver emits). One integer, matched on the client.
--
-- ── LIVE, NOT FROZEN, AND DELIBERATELY SO ───────────────────────────────────
-- Everything else about a sent list is frozen into the snapshot at send time.
-- This is read live from the lead, so that changing or clearing the pick is
-- reflected on a link already sent — which is what "the agent changes their top
-- pick" has to mean for a client who has not opened the list yet. The join to
-- the snapshot's own items is what keeps it honest: the badge can only land on
-- a property that is actually ON this list, so a pick pointing at a property
-- that was removed, or at a different list entirely, returns NULL.
--
-- SECURITY DEFINER with a pinned search_path, resolved by token hash exactly as
-- the sibling client-facing functions are. It exposes one integer about the
-- caller's own list and nothing else: no lead id, no agent data, no other
-- client's share. There is no write counterpart — the client cannot set or
-- clear the agent's pick, only see it.

create or replace function public.lb_agent_top_pick_index(p_token_hash text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select i.sort_order
    from public.client_recommendation_shares s
    join public.leads l
      on l.id = s.lead_id
    join public.client_recommendation_share_items i
      on i.share_id = s.id
     -- The FK the snapshot already stores back to the row it was frozen from.
     -- Matching on it means the pick must be ON THIS LIST to show at all.
     and i.source_recommendation_id = l.agent_top_pick_recommendation_id
   where s.token_hash = p_token_hash
     and s.disabled_at is null
     and s.revoked_at is null
   limit 1
$$;

comment on function public.lb_agent_top_pick_index(text) is
  'The sort_order of the agent''s "My Top Pick for You" within the share this token resolves to, or NULL. Read live from leads.agent_top_pick_recommendation_id and joined through the snapshot''s own items, so a pick that was cleared, changed, or whose property is no longer on the list returns NULL. Read-only; there is no client-facing writer.';

revoke all on function public.lb_agent_top_pick_index(text) from public;
grant execute on function public.lb_agent_top_pick_index(text) to anon, authenticated;
