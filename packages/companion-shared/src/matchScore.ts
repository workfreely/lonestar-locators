// Overall Match % for the Current Property.
//
// This is NOT a second scoring system. It COMPOSES the four intelligence evaluators
// already running on this property — Location, Budget, Approval and Amenities — so the
// headline number can never disagree with the rows printed beneath it.
//
// (The CRM's own scorers cannot be reused here: calculateMatchScore and runLocationFilter
// read a `properties`-table row — city_slug, credit_min, price_value, beds, felony_ok —
// and a the external site CurrentProperty has none of those columns. finalRankingEngine is still
// documented as inert and unwired.)
//
// COVERAGE, NOT PENALTY. A dimension counts only when the client has a criterion AND the
// property supplies evidence. Anything unknown is EXCLUDED from the average rather than
// scored zero, so a property is never punished for information we simply do not have.
// Below MIN_DIMENSIONS the percentage is omitted entirely — a number derived from one
// signal would read as an overall match while measuring almost nothing.

import type { LocationFitResult } from "./locationFit";
import type { ApprovalResult } from "./approval";

/** How many dimensions must be evaluable before a percentage is shown. ONE is enough:
 *  a score built from the client's budget alone is still real information, and
 *  withholding it left properties with no percentage at all. */
export const MIN_DIMENSIONS = 1;

/** Amenity coverage: how many of the client's must-haves this property confirms. */
export type AmenityCoverage = { requested: number; confirmed: number };

/**
 * 0–100 for one dimension, or null to EXCLUDE it (unknown ≠ bad).
 *
 * Location is a WEIGHTED dimension, never an overall disqualifier. Apartment searches
 * routinely cross municipal boundaries — Austin → Round Rock, San Antonio → New
 * Braunfels — so a property outside the stated criteria scores poorly HERE while Budget,
 * Approval and Amenities keep their real scores and still shape the total.
 */
function locationScore(location: LocationFitResult | null | undefined, outsideCriteria?: boolean): number | null {
  if (outsideCriteria) return 0; // poor dimension — not a 0% overall
  if (!location) return null;
  if (location.verdict === "good") return 100;
  if (location.verdict === "bad") return 0;
  return null; // no client location, unverifiable proximity, or area not confirmed
}

function budgetScore(budget?: string | null): number | null {
  if (!budget) return null; // no client budget, or no property rent
  if (budget === "Within budget") return 100;
  if (budget === "Options within budget") return 75;
  if (budget === "Near budget") return 50;
  return 0; // "$N over budget" — real evidence the property misses the budget
}

function approvalScore(approval?: ApprovalResult | null): number | null {
  if (!approval) return null;
  if (approval.risk === "Low") return 100;
  if (approval.risk === "Moderate") return 60;
  if (approval.risk === "High") return 0;
  return null; // Unverified — no management intelligence is absence of evidence
}

function amenityScore(coverage?: AmenityCoverage | null): number | null {
  if (!coverage || coverage.requested <= 0) return null; // client asked for nothing
  const ratio = Math.min(1, Math.max(0, coverage.confirmed / coverage.requested));
  return Math.round(ratio * 100);
}

export type MatchScoreInput = {
  /** The property's location clearly does not align with the client's stated location
   *  criteria (both known and different). Scores the LOCATION dimension poorly; it never
   *  disqualifies the property, because a different municipality can still be viable. */
  locationOutsideCriteria?: boolean;
  location?: LocationFitResult | null;
  budget?: string | null;
  approval?: ApprovalResult | null;
  amenities?: AmenityCoverage | null;
};

/**
 * The overall Match %, or null when too little is known to state one.
 *
 * Equal weight across the evaluable dimensions: each is a genuine pass/fail concern for
 * a locator, and weighting them differently would be an unevidenced judgement.
 */
export function evaluateMatchScore(input: MatchScoreInput): number | null {
  const scores = [
    locationScore(input.location, input.locationOutsideCriteria),
    budgetScore(input.budget),
    approvalScore(input.approval),
    amenityScore(input.amenities),
  ].filter((n): n is number => n !== null);

  if (scores.length < MIN_DIMENSIONS) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
