// Client tour-availability vocabulary — the shared enums + labels + guards for the
// public /r/<token> "when can you generally tour?" flow. DISPLAY/VALIDATION ONLY:
// these are the general-availability preferences the client submits (tour type +
// future dates + broad windows), NOT a concrete appointment. The actual scheduled
// appointment stays in lead_tours via the existing locator Schedule Tour flow.
//
// Values mirror the DB CHECK constraints in
// supabase/migrations/20260919000000_client_tour_availability.sql exactly — do not
// rename them (they are persisted). Same as-const + label-map + guard idiom as
// ./tourOutcome.ts so client, API validation, and the RPC agree on one vocabulary.

export const TOUR_TYPES = ["in_person", "virtual", "either"] as const
export type TourType = (typeof TOUR_TYPES)[number]

export const TOUR_TYPE_LABELS: Record<TourType, string> = {
  in_person: "In Person",
  virtual: "Virtual",
  either: "Either",
}

export const TOUR_WINDOWS = ["morning", "afternoon", "evening", "flexible"] as const
export type TourWindow = (typeof TOUR_WINDOWS)[number]

export const TOUR_WINDOW_LABELS: Record<TourWindow, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  flexible: "Flexible",
}

export function isTourType(value: unknown): value is TourType {
  return typeof value === "string" && (TOUR_TYPES as readonly string[]).includes(value)
}

export function isTourWindow(value: unknown): value is TourWindow {
  return typeof value === "string" && (TOUR_WINDOWS as readonly string[]).includes(value)
}

/** One selected day + its broad windows. `date` is a calendar day "YYYY-MM-DD"
 *  (no time, no timezone) — deliberately NOT a concrete appointment instant. */
export type TourAvailabilityDate = {
  date: string
  windows: TourWindow[]
}

/** The full availability payload the client submits / edits. */
export type TourAvailability = {
  tourType: TourType
  dates: TourAvailabilityDate[]
}

// Bounds enforced identically on the client, in the API route, and in the RPC so a
// public caller can never store an unbounded blob.
export const MAX_TOUR_DATES = 14
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Is "YYYY-MM-DD" a real calendar day that is today or later, relative to
 *  `todayYmd` (also "YYYY-MM-DD", the caller's local today)? Past dates are rejected.
 *  Pure string compare is valid because the format is zero-padded and lexicographic. */
export function isFutureOrTodayYmd(date: string, todayYmd: string): boolean {
  if (!DATE_RE.test(date)) return false
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10))
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false
  return date >= todayYmd
}
