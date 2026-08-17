import { fromZonedTime, formatInTimeZone } from "date-fns-tz"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { TOUR_OUTCOME_LABELS, APPLICATION_FAVORITE_STATE, type TourOutcome, type ApplicationStatus } from "@bc/companion-shared"

// Pure tour date/time helpers (no DB) — safe to import anywhere, including tests.
// The DB-touching completion lives in lib/leads/setupTourWorkflow.ts.

// Tour Follow-Up fires this many hours after the LAST active scheduled tour, so
// the locator follows up the same day while the properties are still fresh.
export const TOUR_FOLLOW_UP_OFFSET_HOURS = 2

/**
 * The Tour Follow-Up due instant for a touring block: the LAST active scheduled
 * tour + 2 hours. Canonical rule — evolves naturally to multiple tours
 * (11:00 · 12:30 · 2:00 → follow-up 4:00). Only 'scheduled' tours count (canceled
 * ones never drive the follow-up). Returns null when there are no active tours.
 */
export function tourFollowUpDueAt(
  tours: { scheduledAt: string | Date; status?: string }[]
): string | null {
  const active = tours.filter((t) => (t.status ?? "scheduled") === "scheduled")
  if (active.length === 0) return null
  const lastMs = Math.max(...active.map((t) => new Date(t.scheduledAt).getTime()))
  return new Date(lastMs + TOUR_FOLLOW_UP_OFFSET_HOURS * 3600 * 1000).toISOString()
}

/**
 * PER-PROPERTY Tour Follow-Up due: one tour's own scheduled instant + 2 hours.
 * Property-scoped Tour Follow-Ups each fire 2h after THEIR tour (Foundry 9:00 →
 * 11:00, Skyline 13:00 → 15:00) — the +2h offset is unchanged, only the anchor
 * moves from "last tour" to "this tour".
 */
export function tourFollowUpDueForTour(scheduledAt: string | Date): string {
  return new Date(new Date(scheduledAt).getTime() + TOUR_FOLLOW_UP_OFFSET_HOURS * 3600 * 1000).toISOString()
}

// ── Pure Tour Follow-Up outcome plan (no I/O — fully unit-testable) ──────────
export type TourOutcomePlan = {
  /** Tour occurrence: 'completed' (the tour happened) vs 'no_show' (Didn't Tour). */
  tourStatus: "completed" | "no_show"
  /** Top Pick effect. 'set' = make this property Top Pick; 'clear_if_match' =
   *  remove Top Pick iff it is this property; 'keep' = untouched. */
  topPick: "set" | "clear_if_match" | "keep"
  /** Advance the lead to 'done_touring' (Ready to Apply only — NOT 'applied'). */
  advanceToDoneTouring: boolean
  /** Create the canonical "Apply" (start_application) action for the Top Pick. */
  createStartApplication: boolean
  /** Reopen Schedule Tour (Wants Another Tour / Didn't Like It / Didn't Tour). */
  reopenSetupTour: boolean
  /** Create a dated manual "Follow Up" decision task (Still Deciding / Other). */
  createFollowUpTask: boolean
}

/**
 * The compact surfaced state for a Favorite's tour, DERIVED from canonical
 * workflow/application state (never a second UI-only flag). It always shows the
 * FURTHEST canonical state, so earlier terminology is never left stale:
 *   • an open start_application  → "Toured · Ready to Apply" (pre-submission)
 *   • the application property once the lead is Closed (lease signed) → "Toured ·
 *     Leased" (the furthest canonical state)
 *   • the application property once an outcome is recorded (property-scoped):
 *       approved → "Toured · Approved"
 *       pending  → "Toured · Application Pending"
 *       canceled → "Toured · Application Canceled"
 *       denied   → "Toured · Application Denied"
 *       other    → "Toured · Applied"  (a note, not a positive/negative decision)
 *   • lead applied AND this property is the Top Pick → "Toured · Applied"
 *     (after Yes-Submitted advances crm_status → 'applied', before any outcome)
 *   • no_show tour → "No-Show"
 *   • any other recorded tour outcome → "Toured · {outcome label}"
 *   • nothing recorded → null
 * "Ready to Apply" is the PRE-submission state only; clicking Apply keeps it until
 * submission is explicitly confirmed. The application-phase states derive from the
 * durable leads.application_status, scoped to the application property (the one
 * carrying the check_application row) — never mutating historical tour outcomes.
 */
export function favoriteTourStateLabel(opts: {
  applyActionOpen: boolean
  isTopPick: boolean
  appliedStage: boolean
  tourStatus?: string | null
  outcome?: TourOutcome | null
  /** The lead's durable application status (leads.application_status). */
  applicationStatus?: ApplicationStatus | null
  /** This Favorite is the application property (carries the check_application row).
   *  Required for the application-status states to apply — they are property-scoped
   *  to the Top Pick, so a different Favorite never surfaces the lead's app status. */
  isApplicationProperty?: boolean
  /** The lead is Closed (crm_status === "closed"). For the application property this
   *  is the furthest state — the lease was signed. */
  closedStage?: boolean
  /** The invoice has been confirmed sent (leads.invoice_submitted). A closing
   *  milestone, surfaced above "Leased" for the application property. */
  invoiceSent?: boolean
  /** The commission payment was confirmed received (leads.invoice_commission_paid). */
  commissionPaid?: boolean
  /** The Cash Rebate was confirmed sent to the client (a completed send_rebate action;
   *  there is no durable leads.* flag). The FURTHEST closing milestone when present —
   *  it only occurs after Commission Paid on a Cash Rebate lead. */
  rebateSent?: boolean
}): string | null {
  if (opts.applyActionOpen) return "Toured · Ready to Apply"
  // Closed closing milestones (furthest first) for the application property:
  //   rebate sent → "Rebate Sent"; commission received → "Commission Paid";
  //   invoice sent → "Invoice Sent"; otherwise (lease signed) → "Leased".
  if (opts.closedStage && opts.isApplicationProperty && opts.rebateSent) return "Toured · Rebate Sent"
  if (opts.closedStage && opts.isApplicationProperty && opts.commissionPaid) return "Toured · Commission Paid"
  if (opts.closedStage && opts.isApplicationProperty && opts.invoiceSent) return "Toured · Invoice Sent"
  if (opts.closedStage && opts.isApplicationProperty) return "Toured · Leased"
  // Application-phase furthest state takes precedence for the application property.
  if (opts.isApplicationProperty && opts.applicationStatus) {
    return `Toured · ${APPLICATION_FAVORITE_STATE[opts.applicationStatus]}`
  }
  if (!opts.outcome) return null
  if (opts.tourStatus === "no_show") return "No-Show"
  if (opts.isTopPick && opts.appliedStage) return "Toured · Applied"
  return `Toured · ${TOUR_OUTCOME_LABELS[opts.outcome]}`
}

export function planForOutcome(outcome: TourOutcome): TourOutcomePlan {
  switch (outcome) {
    case "ready_to_apply":
      return { tourStatus: "completed", topPick: "set", advanceToDoneTouring: true, createStartApplication: true, reopenSetupTour: false, createFollowUpTask: false }
    case "still_deciding":
      return { tourStatus: "completed", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: false, createFollowUpTask: true }
    case "wants_another_tour":
      return { tourStatus: "completed", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: true, createFollowUpTask: false }
    case "didnt_like":
      return { tourStatus: "completed", topPick: "clear_if_match", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: true, createFollowUpTask: false }
    case "didnt_tour":
      return { tourStatus: "no_show", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: true, createFollowUpTask: false }
    case "other":
      return { tourStatus: "completed", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: false, createFollowUpTask: true }
  }
}

/**
 * Convert a locator's LOCAL wall-clock tour date+time into the canonical UTC
 * instant, using the resolved IANA zone (the same fromZonedTime convention as
 * lib/workflow/autoDueDate). "2026-08-15" + "13:00" in America/Chicago → the
 * correct UTC instant; never browser-local/UTC guessing. Falls back to the
 * workspace default zone when none is provided.
 */
export function localTourToUtc(dateStr: string, timeStr: string, timeZone?: string | null): string {
  // dateStr = "YYYY-MM-DD", timeStr = "HH:mm"
  return fromZonedTime(`${dateStr}T${timeStr}:00`, timeZone || DEFAULT_TIMEZONE).toISOString()
}

/**
 * Inverse of localTourToUtc — a canonical UTC instant back to the locator's LOCAL
 * wall-clock "YYYY-MM-DDTHH:mm" in the resolved zone, so the Edit/Reschedule UI
 * prefills the picker with the tour's real local date+time (never browser-local).
 * Round-trips with localTourToUtc under the same zone.
 */
export function utcToLocalTourValue(iso: string, timeZone?: string | null): string {
  return formatInTimeZone(new Date(iso), timeZone || DEFAULT_TIMEZONE, "yyyy-MM-dd'T'HH:mm")
}
