-- ============================================================================
-- Invoice-detail contact/context — who at the property provided the lease info
-- ============================================================================
-- When an agent calls the leasing office to obtain lease/commission details for
-- the invoice, they need to record WHO provided it (properties sometimes refuse
-- to share lease info for privacy reasons, so this doubles as the place to note
-- that outcome). These are invoice-scoped, additive fields alongside the existing
-- leads.invoice_* data — NOT the client's form notes (leads.notes) or the locator
-- notes; there is no existing canonical field for this (audited).
--
--   invoice_contact_name  — who the agent spoke with ("Sarah")
--   invoice_contact_title — their role ("Assistant Manager")
--   invoice_notes         — free-text context ("Unable to provide lease details
--                           without resident authorization.")
--
-- All nullable — blank invoice/lease fields must be allowed (the agent can save
-- the contact + notes and complete Get Invoice Details even when the property
-- refused to provide details). Additive only; no data change.

alter table public.leads
  add column if not exists invoice_contact_name  text,
  add column if not exists invoice_contact_title text,
  add column if not exists invoice_notes         text;
