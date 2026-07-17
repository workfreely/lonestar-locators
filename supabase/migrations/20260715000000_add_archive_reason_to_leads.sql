-- Archive reason for archived leads (CRM display + persistence only).
--
-- Purely additive: nullable, no default, no backfill, no change to any
-- existing row. Only ever set/read from the CRM Lead Panel when
-- crm_status = 'archived' — unrelated to lead submission, automations,
-- metrics, or reporting.

alter table public.leads
  add column if not exists archive_reason text;
