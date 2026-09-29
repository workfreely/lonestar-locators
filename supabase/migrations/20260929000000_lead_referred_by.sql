-- ============================================================================
-- Referral attribution — WHO referred the lead
-- ============================================================================
-- `leads.source` already records THAT a lead came from a referral (it is one of
-- the six Lead Source options), but there has never been a place to record the
-- person who made it — so that name could only live in free-text notes, where it
-- cannot be reported on, searched, or thanked.
--
-- Deliberately ONE column. A referrer's phone/email is a separate contact record,
-- not a lead attribute; if that is ever needed it belongs in its own table, not
-- as more loose columns here.
--
-- referred_by is the AUTHORITATIVE current value. The "Referred by <name>"
-- sentence the Add Lead flow writes into locator_notes is historical context
-- captured at creation time only — it is never rewritten when this column is
-- edited later, and nothing synchronizes the two.
--
-- NOT to be confused with the Beast Network's agent-to-agent referral tables
-- (referral_intents, network_members.brokerage_referral_url) — those are about
-- which AGENT sponsored another agent. This is about who sent us this CLIENT.

alter table public.leads
  add column if not exists referred_by text;

comment on column public.leads.referred_by is
  'Name of the person who referred this client. Meaningful only when source = ''referral''. Free text — a referrer is not necessarily a system user. Authoritative; the creation-time note in locator_notes is historical context, never synchronized.';
