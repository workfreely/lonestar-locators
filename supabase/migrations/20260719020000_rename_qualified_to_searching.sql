-- CRM Phase 1 Workflow Cleanup: rename the "Qualified" Kanban stage to
-- "Searching" everywhere. crm_status is a plain text column with no
-- CHECK constraint/enum type, so there's nothing to alter at the schema
-- level — this migration only needs to update any existing row still
-- carrying the old value, matching the application code's renamed stage
-- identifier (see components/crm/LeadBoard.tsx, lib/nextAction.ts, etc).
update public.leads
set crm_status = 'searching'
where crm_status = 'qualified';
