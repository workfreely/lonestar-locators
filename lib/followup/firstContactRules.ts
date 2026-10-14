// AUTOMATED FIRST CONTACT — the pure decision, with no database behind it.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────
// recordFirstContact (lib/leads/contactWorkflow.ts) is the canonical successful-contact
// cascade, and it is a BROWSER function: it imports the session Supabase client, posts to a
// relative /api/admin/leads/update-stage URL, fires a toast and takes React callbacks. It can
// only run when a human clicks in the CRM.
//
// runAck — the Mac Companion's send acknowledgment — runs on the server, under a device token
// with no user session. It updated the intent and advanced the follow-up run, and stopped
// there. So the Follow-Up Agent could text a brand-new lead and the CRM would still show New /
// Lead Created / Contact Lead overdue, because no code path connected the two. Lead 91 is
// exactly that: both texts delivered, crm_status "new", contact_lead open and overdue.
//
// This is NOT a second stage-transition mechanism. The applier calls the SAME primitives the
// canonical cascade calls — getStageWorkflowAction + createWorkflowActionIfNeeded for the
// successor, completedPatch for the action, the same leads columns, the same lead_timeline
// event. Only the decision of WHEN lives here, and it lives here so it can be tested without
// a database, a device, or a network.

/** The one intent that constitutes first contact. Text 2 is a follow-up question, not outreach. */
export const FIRST_CONTACT_SEQUENCE = "new_lead"
export const FIRST_CONTACT_STEP = "t1"

export type AckedIntent = {
  sequence_key?: string | null
  step_key?: string | null
  /** Must be "sent" — the Companion's genuine device acknowledgment. */
  dispatch_status?: string | null
  lead_id?: number | string | null
  workspace_id?: string | null
}

export type ContactLeadRow = {
  crm_status?: string | null
  first_text_sent_at?: string | null
}

export type SyncDecision =
  | { act: true }
  | { act: false; reason: SkipReason }

export type SkipReason =
  | "not_sent"
  | "not_the_intro_text"
  | "no_lead"
  | "already_contacted"
  | "already_recorded"

/**
 * Should this acknowledgment advance the CRM?
 *
 * Every clause is a refusal, and the order is the order of least trust:
 *
 *  1. NOT SENT. "pending", "claimed", "failed" and "superseded" are all states in which no
 *     message reached anybody. A queued intent is an intention, not an outreach, and treating
 *     one as contact would mark leads contacted that were never texted. Only the Companion's
 *     own "sent" acknowledgment counts.
 *  2. NOT THE INTRO. Only new_lead/t1. Text 2 is a question asked after contact was already
 *     made, and every later sequence fires on a lead that is long past New.
 *  3. ALREADY CONTACTED. A lead the agent moved on themselves is THEIR work: an automated text
 *     landing afterwards must never drag a Searching lead back to Contacted, and must never
 *     overwrite the stage they chose.
 *  4. ALREADY RECORDED. first_text_sent_at is the canonical "this lead was reached" stamp and
 *     the cascade's own idempotency key. Present ⇒ the cascade already ran, so a duplicate
 *     acknowledgment (a retried POST, a Companion replay) changes nothing — no second action,
 *     no second timeline row.
 *
 * Nothing here infers a REPLY. The lead becomes Contacted, which says outreach happened; it
 * does not say the renter answered, and no inbound is recorded.
 */
export function decideFirstContactSync(intent: AckedIntent, lead: ContactLeadRow | null): SyncDecision {
  if ((intent.dispatch_status ?? "") !== "sent") return { act: false, reason: "not_sent" }
  if ((intent.sequence_key ?? "") !== FIRST_CONTACT_SEQUENCE || (intent.step_key ?? "") !== FIRST_CONTACT_STEP) {
    return { act: false, reason: "not_the_intro_text" }
  }
  if (!lead) return { act: false, reason: "no_lead" }
  if ((lead.crm_status ?? "").toLowerCase() !== "new") return { act: false, reason: "already_contacted" }
  if ((lead.first_text_sent_at ?? "").trim()) return { act: false, reason: "already_recorded" }
  return { act: true }
}

/**
 * Does advancing to Contacted endanger the pending Text 2?
 *
 * It must not, and this states why in code rather than in a comment: applicableSequence
 * switches on applied/doneSelecting/listSent and otherwise returns "new_lead" — crm_status
 * only matters for closed and archived. So a New → Contacted move leaves the SAME sequence
 * applicable, supersedeTo returns false, and the already-enqueued t2 is untouched. STOP and a
 * hard opt-out still cancel it, exactly as before.
 */
export function stageAdvanceCancelsPair(fromStage: string, toStage: string): boolean {
  const terminal = (s: string) => /closed|archiv/.test((s ?? "").toLowerCase())
  return !terminal(fromStage) && terminal(toStage)
}

/** The marker written on the completed action so both Last Action surfaces can say who did it. */
export const AUTOMATED_CONTACT_ORIGIN = "followup_agent"
/** What the agent reads. "Contacted Lead" is true but hides that nobody lifted a finger. */
export const AUTOMATED_CONTACT_LABEL = "Auto Text Sent"
