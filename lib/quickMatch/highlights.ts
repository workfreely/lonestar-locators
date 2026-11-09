// Quick Match — the two highlights the draft WRITES, and why it writes only two.
//
// ── THE THIRD SLOT IS LEFT EMPTY ON PURPOSE ─────────────────────────────────────────────────
// "Why I chose this for you" shows three lines. This file produces the first and the third:
//
//     stored    ["Located in Medical Center", "Credit-Friendly"]
//     rendered  ["Located in Medical Center", "2BR from $1,679", "Credit-Friendly"]
//
// The price in the middle is derived at READ time by two composers that already exist and are
// held level by a drift test — lib/leads/bedroomPricing.displayReasons for the CRM card, and
// lb_compose_recommendation_reasons for the client snapshot. Both insert at index 1 and both
// YIELD rather than evict when the array is full. Storing a price here would duplicate that
// system and freeze a figure a later correction would leave stale, so the slot is left for them.
//
// It also means the stored array is two long, so the lead_property_reasons_max3 CHECK is never
// approached and a locator can still add a third line of their own.
//
// ── NOTHING AGENT-FACING CROSSES OVER ───────────────────────────────────────────────────────
// StoredScreening.reasons / unverified / conflicts / conditions are internal locator intelligence
// and some of it is about the client themself. None of it is read here. The only strings that can
// leave this file are the approved labels below and a location line built from a band and the
// client's own area label.
import type { Recommendation } from "./ranking"
import type { Finding, QuickMatchProperty } from "./types"
import { CREDIT_CEILING, type ScreeningFacts } from "./eligibility"
import { areaHighlightText } from "@/lib/leads/locationHighlight"
import { isVerifiedInArea } from "./areaReference"

/**
 * THE APPROVED CLIENT-FACING LABELS. This is the whole vocabulary — no label is assembled
 * anywhere else, and no free text from a property or a client reaches a renter's page through
 * this file.
 *
 * Each one says a property MAY CONSIDER an applicant under criteria it has recorded. None of them
 * says approved, qualified or guaranteed, and the two "Case-by-Case" labels deliberately name the
 * uncertainty rather than hiding it.
 *
 * The year numbers are NOT constants. They are read from the property's own recorded minimum, so
 * a property that accepts an eviction after 3 years says 3 and one that wants 7 says 7.
 */
export const CREDIT_FRIENDLY = "Credit-Friendly"
export const BACKGROUND_CASE_BY_CASE = "Background Case-by-Case"
export const BROKEN_LEASE_CASE_BY_CASE = "Broken Lease Case-by-Case"
export const EVICTION_CASE_BY_CASE = "Eviction Case-by-Case"
export const brokenLeaseYearsLabel = (years: number): string => `Broken Lease ${years}+ Years OK`
export const evictionYearsLabel = (years: number): string => `Eviction ${years}+ Years OK`

/**
 * The structured columns behind each claim. A finding whose field is outside its family cannot
 * block that family's label, and a family with no finding at all produces nothing — which is the
 * "if the policy is unknown, do not suggest the property considers it" rule, enforced by the
 * absence of evidence rather than by a special case.
 *
 * `notes` is absent from every family on purpose: assessProperty pushes a `notes` finding only
 * when a family has NO structured policy (structuredHere === 0), so a family that can produce a
 * label never has one.
 */
const EVICTION_FIELDS = [
  "eviction_status", "eviction_min_age_years",
  "eviction_balance_requirement", "eviction_positive_history_required",
]
const BROKEN_LEASE_FIELDS = [
  "broken_lease_status", "broken_lease_min_age_years", "broken_lease_balance_requirement",
  "broken_lease_max_balance", "broken_lease_positive_history_required",
]
const CRIMINAL_FIELDS = [
  "felony_policy", "felony_min_age_years", "misdemeanor_policy", "misdemeanor_min_age_years",
  "criminal_restricted_offense_types", "felony_restrictions", "misdemeanor_restrictions",
  "background_screening_notes",
]

const inFamily = (findings: Finding[], fields: string[]): Finding[] =>
  findings.filter((x) => fields.includes(x.field))

/**
 * Every structured requirement in this family is stated AND met.
 *
 * `fromNotes` disqualifies the whole family: an agent's sentence about evictions is a question,
 * never a policy, and the one thing a client-facing label must not do is harden it into one.
 * An `unknown` disqualifies too — an unresolved balance condition means we cannot say "OK".
 */
function familyClear(findings: Finding[], fields: string[]): boolean {
  const mine = inFamily(findings, fields)
  if (mine.length === 0) return false
  return mine.every((x) => x.verdict === "meets" && x.fromNotes !== true)
}

/** A policy that commits the office to LOOKING at the application. Both tokens are an explicit
 *  recorded answer; null is not one, and `not_considered` is a refusal. */
const isIndividualReview = (policy: string | null): boolean =>
  policy === "considered" || policy === "case_by_case"

/**
 * The screening label for one client-property pair, or null.
 *
 * ── ORDER: MOST SPECIFIC FIRST ──────────────────────────────────────────────────────────────
 * A client with an eviction learns more from "Eviction 5+ Years OK" — which names their own
 * barrier and the property's own threshold — than from "Credit-Friendly", which is true of most
 * of this collection. So a dated, met, structured policy outranks a case-by-case commitment,
 * which outranks the credit default. Eviction leads broken lease because it is the heavier
 * barrier of the two.
 *
 * ── ONE BLANKET GUARD ───────────────────────────────────────────────────────────────────────
 * Any conflict at all silences slot three. A conflict is a documented restriction that bears on
 * something THIS client has on record, so while one is open no positive screening claim about
 * this property is safe to put in front of them — including the credit default, which the brief
 * conditions on not contradicting a recorded restriction.
 */
export function screeningHighlight(
  property: QuickMatchProperty,
  findings: Finding[],
  conflicts: string[],
  facts: ScreeningFacts,
): string | null {
  if (conflicts.length > 0) return null

  // 1-2. A recorded minimum age the client's own reported age clears. The number is the
  //      property's; nothing here supplies a default, so a property with no minimum says nothing.
  if (facts.hasEviction && property.evictionMinAgeYears !== null && familyClear(findings, EVICTION_FIELDS)) {
    return evictionYearsLabel(property.evictionMinAgeYears)
  }
  if (facts.hasBrokenLease && property.brokenLeaseMinAgeYears !== null && familyClear(findings, BROKEN_LEASE_FIELDS)) {
    return brokenLeaseYearsLabel(property.brokenLeaseMinAgeYears)
  }

  // 3-4. BROKEN_LEASE_CASE_BY_CASE / EVICTION_CASE_BY_CASE have no structured source.
  //      approvalCriteria.ts gives both incidents the tokens accepted / accepted_if_paid /
  //      not_accepted and says, in as many words, that anything conditional on something other
  //      than the balance — corporate review, case by case — belongs in the NOTES. Notes are
  //      questions, never policy. So there is no column that can confirm individual review of a
  //      broken lease or an eviction, and inventing the claim from free text is exactly what the
  //      brief forbids. The labels are exported and tested; they are emitted the day a column
  //      records the fact, and not before.

  // 5. An explicitly recorded commitment to review the record individually, for a kind of record
  //    this client actually has. `unknown` on the lookback is fine here and nowhere else: "we
  //    weigh it case by case" is precisely a statement that the outcome is decided on reading.
  const criminal = inFamily(findings, CRIMINAL_FIELDS)
  const criminalUsable = criminal.every((x) => x.verdict !== "fails" && x.fromNotes !== true)
  const reviewsThisClient =
    (facts.hasFelony && isIndividualReview(property.felonyPolicy)) ||
    (facts.hasMisdemeanor && isIndividualReview(property.misdemeanorPolicy))
  if (reviewsThisClient && criminalUsable) return BACKGROUND_CASE_BY_CASE

  // 6. The default for the clients this collection is curated for. Not derived from a credit
  //    column — a property with no recorded minimum still earns it — but silenced by one that
  //    the client's score fails, which is the "does not contradict a recorded restriction" rule.
  //    A score ABOVE the ceiling gets nothing: telling someone with strong credit that a property
  //    is credit-friendly is noise, not help.
  if (facts.creditScore !== null && facts.creditScore <= CREDIT_CEILING) {
    const creditFails = findings.some((x) => x.field === "credit" && x.verdict === "fails")
    if (!creditFails) return CREDIT_FRIENDLY
  }

  return null
}

/**
 * What slot one needs to know about where a property sits relative to what the client asked for.
 *
 * Assembled once per run by the caller and threaded through, because two of the three fields are
 * properties of the CLIENT, not of a property, and the third is the result of a network call
 * that must not happen inside a pure function.
 */
export type LocationInputs = {
  /** The market display name (`leads.city`), which keys the curated tables. */
  market: string | null | undefined
  /** EVERY area the client asked for. Rule 1 is "inside a requested neighbourhood" — any of
   *  them — so membership is checked against the whole list, not just the nearest anchor. */
  requestedAreas: string[]
  /** property place_id → a measured drive-time line, for properties that are not provably
   *  inside a requested area. Absent means no verified figure exists. */
  driveTimeLineByPlaceId: Map<string, string>
}

/**
 * The client-facing LOCATION line for one property, or null to leave the slot editable.
 *
 * ── NO "NEAR", NO "NEXT TO", EVER ───────────────────────────────────────────────────────────
 * This function used to hand the engine's band straight to areaHighlightText, which turned
 * `adjacent` into "Next to Medical Center" and `nearby` into "Near Medical Center". Those are
 * approximations derived from straight-line distance to a neighbourhood CENTROID, and they
 * answered a question the client did not ask: she wants to know how convenient a property is to
 * the area she chose, and "Near" does not tell her. They are gone. The two things that remain
 * are both facts:
 *
 *   1. MEMBERSHIP, proven by ZIP against a curated list → "Located in Medical Center".
 *      Checked across every requested area, and it OUTRANKS the band: a property whose ZIP is
 *      inside the area is inside it, whatever its distance from the centroid happens to be.
 *   2. A MEASURED DRIVE TIME to that area's approved reference point → "11 min to Medical Center".
 *
 * Neither is available → null, and the locator types what they know. That is rule 4, and it is
 * the whole reason this returns null rather than falling back to a vaguer sentence.
 *
 * Note that `r.geo.band` is no longer read here at all. The band still decides which properties
 * are recommended and in what order — this file has never had any say in that and still has none.
 */
export function locationHighlight(r: Recommendation, loc: LocationInputs): string | null {
  for (const area of loc.requestedAreas) {
    if (isVerifiedInArea(loc.market, area, r.property.zip)) {
      // areaHighlightText still owns the wording and its length cap; "in_area" is passed
      // because membership is exactly what has been proven.
      const text = areaHighlightText("in_area", area)
      if (text) return text
    }
  }
  return loc.driveTimeLineByPlaceId.get(r.property.placeId) ?? null
}

/**
 * The lines Quick Match writes for one recommendation: location, then screening, each present
 * only when it is supported. Never more than two, never a price, never a washer/dryer line.
 */
export function quickMatchHighlights(
  r: Recommendation,
  facts: ScreeningFacts,
  loc: LocationInputs,
): string[] {
  const out: string[] = []
  const location = locationHighlight(r, loc)
  if (location) out.push(location)
  const screening = screeningHighlight(r.property, r.assessment.findings, r.conflicts, facts)
  if (screening) out.push(screening)
  return out
}
