// Quick Match — the pure engine, start to finish.
//
// Nothing here touches Supabase, React or the network: given a lead row, a set of candidate
// properties and (optionally) travel times, it returns the recommendations an agent should see.
// That is what makes the screening rules provable from fixtures.
//
// ── THE COLLECTION IS ENFORCED TWICE, DELIBERATELY ──────────────────────────────────────────
// The loader in ./collection only ever asks the database for members. This file then filters for
// membership AGAIN before assessing anything. The duplication is the point: a future caller that
// passes the wrong list — a full catalogue search, a Map Explorer result set, a test fixture —
// still cannot produce a recommendation outside the curated collection, because the engine itself
// refuses non-members. Quick Match recommends from the curated list or it recommends nothing.
import { evaluateEligibility, readScreeningFacts, type Eligibility, type ScreeningFacts } from "./eligibility"
import { assessProperty } from "./screening"
import {
  rankRecommendationsDetailed, MAX_RECOMMENDATIONS,
  type ClientNeeds, type Recommendation, type RankInput, type ExcludedCandidate,
} from "./ranking"
import type { QuickMatchProperty, AssessedTier } from "./types"

export * from "./types"
export { evaluateEligibility, readScreeningFacts, offenseTypeFromCharge, CREDIT_CEILING } from "./eligibility"
export type { ScreeningFacts, Eligibility } from "./eligibility"
export { assessProperty } from "./screening"
export { rankRecommendations, rankRecommendationsDetailed, MAX_RECOMMENDATIONS, bedroomRent } from "./ranking"
export type { ClientNeeds, Recommendation, RankInput, ExcludedCandidate, RankResult } from "./ranking"
export {
  assessGeography, resolveClientGeography, geographySummary, zipAnchor, fiveDigitZip,
  GEO_BAND_MILES, GEO_WEIGHT,
} from "./geography"
export type { ClientGeography, GeoFit, GeoBand } from "./geography"
export {
  criminalPolicyVerdict, lookbackVerdict, restrictedOffenseVerdict, offenseLabel,
} from "./criminal"
export { loadQuickMatchCollection, DEFAULT_COLLECTION } from "./collection"

export type QuickMatchResult = {
  eligibility: Eligibility
  /** The client facts the assessment ran on, so the agent view can show what was used. */
  facts: ScreeningFacts
  recommendations: Recommendation[]
  /** Members considered after the membership guard. */
  consideredCount: number
  /** How the considered members fell out, before the cap. Reported so "only two" is explicable. */
  tierCounts: Record<AssessedTier, number>
  /** Members dropped as Known Mismatch — reported so the agent knows they were ruled out. */
  excludedMismatches: ExcludedCandidate[]
  /** Members outside every geographic band the client's own areas define. */
  excludedByGeography: ExcludedCandidate[]
  /** Members with nothing on record and no other established evidence for recommending them. */
  excludedNoPolicy: ExcludedCandidate[]
  /** Non-members that reached the engine and were refused. Should always be 0 in production. */
  rejectedNonMembers: number
}

/**
 * Run Quick Match for one client.
 *
 * An ineligible client gets an empty list and the reason, not an error: Quick Match simply does
 * not apply to them, and the workspace says so rather than showing nothing.
 */
export function runQuickMatch(args: {
  lead: Record<string, unknown> | null | undefined
  /** Candidates. Non-members are refused here regardless of what the caller passed. */
  properties: QuickMatchProperty[]
  needs: ClientNeeds
  /** place_id → real driving minutes to the client's destination, where obtainable. */
  travelMinutes?: Record<string, number | null>
}): QuickMatchResult {
  const { lead, properties, needs, travelMinutes = {} } = args
  const eligibility = evaluateEligibility(lead)
  const facts = readScreeningFacts(lead)
  const emptyTiers: Record<AssessedTier, number> = {
    strong_candidate: 0, needs_verification: 0, curated_only: 0,
  }
  if (!eligibility.eligible) {
    return {
      eligibility, facts, recommendations: [], consideredCount: 0,
      tierCounts: emptyTiers, excludedMismatches: [], excludedByGeography: [], excludedNoPolicy: [],
      rejectedNonMembers: 0,
    }
  }

  const members = properties.filter((p) => typeof p.quickMatchCollection === "string" && p.quickMatchCollection !== "")
  const rejectedNonMembers = properties.length - members.length

  const assessed = members.map((property) => ({
    property,
    assessment: assessProperty(property, facts),
    travelMinutes: travelMinutes[property.placeId] ?? null,
  }))

  const tierCounts = { ...emptyTiers }
  for (const a of assessed) {
    if (a.assessment.outcome !== "known_mismatch" && a.assessment.outcome !== "off_collection") {
      tierCounts[a.assessment.outcome] += 1
    }
  }

  const excludedMismatches = assessed
    .filter((a) => a.assessment.outcome === "known_mismatch")
    .map((a) => ({
      placeId: a.property.placeId,
      propertyName: a.property.propertyName,
      why: a.assessment.findings.filter((x) => x.verdict === "fails").map((x) => x.text),
    }))

  const ranked = rankRecommendationsDetailed(assessed as RankInput[], needs)

  return {
    eligibility,
    facts,
    recommendations: ranked.recommendations,
    consideredCount: members.length,
    tierCounts,
    excludedMismatches,
    excludedByGeography: ranked.excludedByGeography,
    excludedNoPolicy: ranked.excludedNoPolicy,
    rejectedNonMembers,
  }
}

/** Does this result fill the cap? Used only for copy, never to pad the list. */
export const isAtCap = (r: QuickMatchResult) => r.recommendations.length === MAX_RECOMMENDATIONS
