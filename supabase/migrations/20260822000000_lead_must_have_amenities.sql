-- Must-Have Amenities — structured client requirement captured on the Smart Form
-- (optional, max 3) and editable later in the CRM.
--
-- Stored as a comma-joined list of CANONICAL OPTION VALUES (e.g.
-- "attached_garage, washer_dryer, pool"), following the exact precedent already set by
-- `leads.neighborhoods` / `leads.submarkets`. Values are stable keys, never display
-- labels, so re-wording a choice never invalidates stored data.
--
-- Nullable with no default: a lead simply has no must-haves when the agent hid the
-- field, the lead was created manually, or the client skipped the optional question.

alter table public.leads
  add column if not exists must_have_amenities text;

comment on column public.leads.must_have_amenities is
  'Comma-joined canonical Must-Have Amenity option values (max 3), e.g. "attached_garage, washer_dryer". Stable keys, not labels.';
