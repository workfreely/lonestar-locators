-- Guest Card workflow: a Next Action can be scoped to a specific Favorite
-- Property. Each favorite added to a List Sent lead spawns its own
-- property-specific "Email Guest Card" action, so we store which property the
-- guest card is for (id + name snapshot). Both nullable — every other action
-- type leaves them empty.
--
-- property_id is a plain reference to lead_favorites with ON DELETE SET NULL:
-- if the favorite is later removed, the guest-card action survives (its
-- property_name snapshot preserves what it was for) rather than cascading away.

alter table public.lead_next_actions
  add column if not exists property_id bigint
    references public.lead_favorites(id) on delete set null,
  add column if not exists property_name text;

-- Speeds up the per-property dedup check (does an open/completed guest card
-- already exist for this lead + property?).
create index if not exists lead_next_actions_lead_property_idx
  on public.lead_next_actions (lead_id, property_id);
