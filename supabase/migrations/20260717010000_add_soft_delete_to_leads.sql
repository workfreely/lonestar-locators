-- Soft-delete support for leads. Replaces permanent deletion: the CRM's
-- new "Delete Lead" action archives a lead instead of ever issuing a
-- DELETE. See components/crm/LeadPanel.tsx.
--
-- deleted_at / deleted_by record who deleted a lead and when.
-- pre_delete_status snapshots crm_status at the moment of deletion (before
-- it's overwritten to "archived"), so Restore can put the lead back where
-- it was instead of always defaulting to "new".
--
-- Purely additive: nullable, no default, no backfill, no change to any
-- existing row.

alter table public.leads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists pre_delete_status text;
