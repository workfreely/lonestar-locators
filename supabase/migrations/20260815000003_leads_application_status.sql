-- ============================================================================
-- Durable application status — the outcome of a client's submitted application
-- ============================================================================
-- After a client submits their application for their Top Pick, "What's the
-- application status?" resolves to ONE durable fact per lead:
--   pending  — submitted, no decision yet (re-check later; lead stays Applied)
--   approved — accepted → the canonical next step is Confirm Lease (NOT Closed)
--   canceled — the application was pulled (DISTINCT from denied) → live Top Pick
--              clears and Schedule Tour reopens (history preserved, never Closed)
--   denied   — rejected → the live Top Pick clears and Schedule Tour reopens
--   other    — anything else → a free note + a dated follow-up (lead stays Applied)
--
-- MVP: ONE application per lead, so a scalar column on `leads` is sufficient (no
-- lead_applications table). lead_timeline holds the immutable application history;
-- this column is the fast O(1) current-state read (mirrors leads.top_pick_favorite_id
-- and lead_tours.outcome). The application is property-scoped in application code to
-- the lead's Top Pick (check_application.property_id is stamped at creation).
--
-- Semantics (enforced in application code, see lib/leads/applicationOutcomeWorkflow):
--   • Recorded by the Check Application outcome; null until then.
--   • Denied also clears leads.top_pick_favorite_id (the property is no longer viable).
--   • Approved/Denied/Other complete check_application; Pending re-dates it (stays open).
--   • Never auto-advances the lead to 'closed' (Confirm Lease → Closed is separate).

alter table public.leads
  add column if not exists application_status text;

alter table public.leads drop constraint if exists leads_application_status_check;
alter table public.leads
  add constraint leads_application_status_check
  check (
    application_status is null or application_status in (
      'pending',
      'approved',
      'canceled',
      'denied',
      'other'
    )
  );
