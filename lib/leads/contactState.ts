// Canonical contact-history signal — the ONE source of truth for "has this lead
// ever been SUCCESSFULLY contacted?", used to route Beast Voice Text/Call between
// the first-contact gate and normal communication.
//
// `first_text_sent_at` is legacy-named but means "first successful contact"
// (regardless of call vs text). It is written ONLY by recordFirstContact on a
// confirmed reach — a mere No Answer / Text Sent / outreach attempt never writes
// it (see lib/leads/pendingOutreach.ts). So it, NOT crm_status, is authoritative:
// a lead can be in "contacted" from an attempt alone and still have never been
// reached, and a lead moved back to "new" keeps its historical first contact.
//
// Pure + dependency-free so the business rule has one explicit, testable home.

/** True once this lead has had a confirmed successful first contact. */
export function hasSuccessfulContact(lead: { first_text_sent_at?: unknown } | null | undefined): boolean {
  const v = lead?.first_text_sent_at
  return typeof v === "string" ? v.trim().length > 0 : v != null
}
