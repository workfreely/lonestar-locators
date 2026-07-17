-- Timestamp for when First Text was clicked in the CRM — the moment the
-- locator intentionally contacted a lead. Not an SMS delivery timestamp,
-- not driven by Twilio, not inferred from crm_status. Set only by the
-- First Text button (components/crm/LeadPanel.tsx) — never by a Kanban
-- drag or a lead edit. Powers the daily "no response after 7 days"
-- auto-archive automation.
--
-- Purely additive: nullable, no default, no backfill, no change to any
-- existing row.

alter table public.leads
  add column if not exists first_text_sent_at timestamptz;
