-- Milestone A.1.1 — guest-card DB integrity. email_guest_card is intentionally
-- one-open PER PROPERTY (excluded from the general (lead_id, action_key) unique
-- index in 20260806000001). This makes the DATABASE the final concurrency
-- guarantee for "one open guest card per property" and requires a property_id
-- on any workflow guest-card row. Additive; applied against confirmed-empty
-- tables. The application-layer dedup stays for friendly/idempotent behavior;
-- this index is the race-proof backstop.

-- A workflow-generated email_guest_card MUST carry a property_id. (NULL-safe:
-- non-guest-card rows and manual/null-key rows are unaffected.)
alter table public.lead_next_actions
  add constraint lead_next_actions_guest_card_property_chk
  check (
    not (action_key = 'email_guest_card' and origin = 'workflow')
    or property_id is not null
  );

-- One OPEN workflow guest card per (lead, property). A completed/skipped/canceled
-- row (status <> 'open') is not in the index, so a later new open guest card for
-- the same property is allowed.
create unique index if not exists lead_next_actions_one_open_guest_card_per_property_uidx
  on public.lead_next_actions (lead_id, action_key, property_id)
  where action_key = 'email_guest_card'
    and origin = 'workflow'
    and status = 'open'
    and property_id is not null;
