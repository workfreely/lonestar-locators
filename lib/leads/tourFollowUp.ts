import { fromZonedTime, formatInTimeZone } from "date-fns-tz"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { TOUR_OUTCOME_LABELS, type TourOutcome } from "@bc/companion-shared"

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
 * workflow/application state (never a second UI-only flag):
 *   • an open start_application  → "Toured · Ready to Apply" (pre-submission)
 *   • lead applied AND this property is the Top Pick → "Toured · Applied"
 *     (only after Yes-Submitted advances crm_status → 'applied'; property-scoped)
 *   • no_show tour → "No-Show"
 *   • any other recorded outcome → "Toured · {outcome label}"
 *   • nothing recorded → null
 * "Ready to Apply" is the PRE-submission state only; clicking Apply keeps it until
 * submission is explicitly confirmed. Only the applied Top Pick shows "Applied".
 */
export function favoriteTourStateLabel(opts: {
  applyActionOpen: boolean
  isTopPick: boolean
  appliedStage: boolean
  tourStatus?: string | null
  outcome?: TourOutcome | null
}): string | null {
  if (opts.applyActionOpen) return "Toured · Ready to Apply"
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
