/**
 * Tour completion status vs. client outcome — two orthogonal facts about a tour
 * ("How did the tour go?"). Shared by the CRM (producer) and the Companion
 * read-model (consumer). Mirrors the DB CHECKs in
 * supabase/migrations/20260815000001_lead_tours_outcome.sql.
 *
 *   status  — DID the tour happen?  (no_show ≠ canceled; canceled is pre-tour)
 *   outcome — WHAT did the client decide? (null until a Tour Follow-Up is recorded)
 */

export const TOUR_STATUSES = ["scheduled", "completed", "no_show", "canceled"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export const TOUR_OUTCOMES = [
  "ready_to_apply",
  "still_deciding",
  "wants_another_tour",
  "didnt_like",
  "didnt_tour",
  "other",
] as const;
export type TourOutcome = (typeof TOUR_OUTCOMES)[number];

export function isTourOutcome(v: unknown): v is TourOutcome {
  return typeof v === "string" && (TOUR_OUTCOMES as readonly string[]).includes(v);
}

/** User-facing outcome labels — the exact choices in the Tour Follow-Up modal
 *  and the compact status shown on the Favorite card. */
export const TOUR_OUTCOME_LABELS: Record<TourOutcome, string> = {
  ready_to_apply: "Ready to Apply",
  still_deciding: "Still Deciding",
  wants_another_tour: "Wants Another Tour",
  didnt_like: "Didn't Like It",
  didnt_tour: "Didn't Tour",
  other: "Other",
};

/** Whether an outcome means the tour actually happened (status → completed) vs.
 *  a no-show (status → no_show). Didn't Tour is the only "did not tour" outcome. */
export function tourStatusForOutcome(outcome: TourOutcome): Extract<TourStatus, "completed" | "no_show"> {
  return outcome === "didnt_tour" ? "no_show" : "completed";
}
