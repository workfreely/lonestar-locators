// ONE policy for "what must happen before a lead lands in this stage".
//
// THE PROBLEM THIS SOLVES. A stage was reachable two ways with two different sets
// of consequences: the canonical Next Action button (confirmation → writes → stage
// as a RESULT), and a Kanban drag (set crm_status, let the server derive the rest).
// Dragging to List Sent advanced the stage, created FU1 and left `send_list` OPEN
// with the share never marked sent — production still shows leads closed with
// "Send List" open from exactly that.
//
// THE RULE. The stage is the DESTINATION; the canonical workflow decides what must
// happen before that destination is finalised. So a consequential drag does not
// write a stage at all — it REQUESTS the canonical action and lets the existing
// handler do every write it already does. There is deliberately no second
// implementation of any workflow here: this module only classifies.
//
// Pure and I/O-free on purpose, so every classification is testable without a
// database, a DOM or a network.

/** Canonical CRM stages that can be a drop destination. */
export type Stage =
  | "new" | "contacted" | "searching" | "list_sent" | "ready_to_tour"
  | "done_touring" | "applied" | "closed" | "archived"

/**
 * How a move must be carried out.
 *
 *  direct    — no confirmation owed; the stage route may be called immediately.
 *  canonical — a workflow action owns this destination. Hand off to its EXISTING
 *              flow; that flow performs the stage change itself.
 *  dialog    — a non-workflow dialog owns it (archive reason capture).
 *  noop      — dropping a card on the column it already occupies.
 */
export type TransitionPolicy =
  | { kind: "noop" }
  | { kind: "direct" }
  | { kind: "canonical"; flow: CanonicalFlow; because: string }
  | { kind: "dialog"; dialog: "archive"; because: string }

/**
 * The existing flows a drag may hand off to. These are names of things that
 * ALREADY EXIST — each maps to the confirmation a locator already sees when they
 * reach that stage through the Next Action button.
 */
export type CanonicalFlow =
  /** "Did you send {name}'s list?" → marks the share sent, completes send_list. */
  | "send_list"
  /** The tour outcome modal → Top Pick, start_application, done_touring. */
  | "tour_outcome"
  /** "Did the client submit their application?" → guest-card guard → applied. */
  | "application"
  /** "Did the client sign their lease?" → closed + the invoice chain. */
  | "confirm_lease"
  /** The Build List tool chooser → searching with build_list left open. */
  | "build_list"

/**
 * Classify a move.
 *
 * `from` matters: the same destination can be consequential or trivial depending
 * on where the lead is coming from (a lead already past List Sent being dragged
 * BACK is a correction, not a send).
 */
export function stageTransitionPolicy(from: string | null | undefined, to: string): TransitionPolicy {
  const prev = (from ?? "").trim()
  if (prev === to) return { kind: "noop" }

  switch (to) {
    // ── Consequential ───────────────────────────────────────────────────────
    case "list_sent":
      // Only a FORWARD move means "I sent it". Dragging back from Ready to Tour
      // is a correction and must not re-ask, re-send, or re-stamp sent_at.
      return isForward(prev, "list_sent")
        ? { kind: "canonical", flow: "send_list", because: "a list is only List Sent once it has actually been sent" }
        : { kind: "direct" }

    case "done_touring":
      // The stage has NO workflow rule of its own, so a bare move leaves the lead
      // with no Next Action at all. Its canonical arrival is the tour outcome.
      return isForward(prev, "done_touring")
        ? { kind: "canonical", flow: "tour_outcome", because: "Done Touring carries the tour outcome, Top Pick and the application hand-off" }
        : { kind: "direct" }

    case "applied":
      return isForward(prev, "applied")
        ? { kind: "canonical", flow: "application", because: "Applied means a submitted application for a specific property" }
        : { kind: "direct" }

    case "closed":
      return isForward(prev, "closed")
        ? { kind: "canonical", flow: "confirm_lease", because: "Closed means a signed lease, and freezes the commission snapshot" }
        : { kind: "direct" }

    case "searching":
      // Build List START deliberately keeps build_list OPEN (skipWorkflowAction);
      // a bare drag instead creates send_list immediately AND leaves build_list
      // open, which is the stage/action disagreement seen on lead 57.
      return prev === "contacted"
        ? { kind: "canonical", flow: "build_list", because: "Build List owns Contacted → Searching and keeps itself open" }
        : { kind: "direct" }

    case "archived":
      return { kind: "dialog", dialog: "archive", because: "an archive needs a reason, and pre_delete_status so Restore can return the lead" }

    // ── Safe direct moves ───────────────────────────────────────────────────
    // new:           nothing is consequential about moving a lead back to New.
    // contacted:     the board already diverts new → contacted to the Contact Gate.
    // ready_to_tour: no button sets it; the route's Setup Tour successor is correct.
    default:
      return { kind: "direct" }
  }
}

/** Pipeline order. `archived` is deliberately absent — it is not a position. */
const ORDER: Stage[] = [
  "new", "contacted", "searching", "list_sent", "ready_to_tour", "done_touring", "applied", "closed",
]

/**
 * Is `to` genuinely ahead of `from` in the pipeline?
 *
 * A lead arriving from outside the pipeline (archived, or an unknown/blank stage)
 * counts as forward: restoring an archived lead straight into Applied should still
 * ask for the application confirmation.
 */
export function isForward(from: string, to: string): boolean {
  const a = ORDER.indexOf(from as Stage)
  const b = ORDER.indexOf(to as Stage)
  if (b < 0) return false
  if (a < 0) return true
  return b > a
}

/** Does this destination finalise through its own flow rather than the stage route? */
export function isCanonicalDestination(from: string | null | undefined, to: string): boolean {
  return stageTransitionPolicy(from, to).kind === "canonical"
}
