// Quick Match — selection, ordering, and the hard ceiling of six.
//
// ── SIX IS A MAXIMUM, NOT A TARGET ──────────────────────────────────────────────────────────
// `MAX_RECOMMENDATIONS` caps the list; nothing invents a candidate to fill it. If two properties
// earn a place, the agent gets two. If none does — a client whose market the curated collection
// does not cover, say — the agent gets none, and the result says which test each property failed.
//
// ── THE ORDER THE QUESTIONS ARE ASKED IN ────────────────────────────────────────────────────
//   1. WHERE, as a GATE. Is this property in, next to, or near somewhere the client actually
//      named? A property outside every band is outside a requirement the CLIENT stated, so it is
//      not recommended at all and the reason is recorded. Bands live in ./geography, are measured
//      from real coordinates, and this is where "prioritize the client's location" bites: it
//      removes candidates, which no points-based nudge ever really does.
//   2. HOW DOES IT SCREEN. Inside the pool, a property whose stated requirements this client
//      meets ranks above one with open questions, which ranks above one with nothing on record.
//   3. HOW CLOSE. The band orders properties of equal screening standing.
//   4. BEDROOMS, BUDGET, COMMUTE. Tie-breaks inside a tier and a band.
//
// The weights make that order structural rather than aspirational: the screening-tier gap is
// 300,000, the whole band range is 90,000, and every housing term together swings at most 370 up
// and 550 down. So no bedroom match can move a property up a band, and no proximity can present
// a property with nothing on record as better evidenced than one that states it.
//
// ── NO POLICY ON RECORD IS NOT, BY ITSELF, A RECOMMENDATION ─────────────────────────────────
// A curated member with nothing on record about this client's situation (`curated_only`) is NOT
// recommended on the strength of curation alone. It reaches the agent only when there is other,
// positive, established evidence for it:
//
//   • the client's own stated area puts it in front of them — a measured geographic fit, and
//   • nothing else contradicts it: the bedroom count is not known to be unavailable and the
//     bedroom's starting rent is not known to be over budget.
//
// Then it is recommended as NEEDS VERIFICATION — never as a match — and its detail leads with
// the fact that no policy is on record, followed by every question that raises. That is the
// difference between "we have not entered this property's policies yet" (not a reason to hide a
// property the client's own area search found) and "we have no reason at all to put this in
// front of this client" (which is padding, and is excluded).
//
// A property with a STATED requirement this client cannot meet is a Known Mismatch and is
// excluded outright, however well it fits geographically. A conflicting restriction is never
// presented as a compatible match.
//
// ── TWO CLAIMS THIS FILE REFUSES TO MAKE ────────────────────────────────────────────────────
// 1. BUDGET. A community's `rent_min` is its cheapest floor plan, usually a studio. Using it to
//    say "this 3-bedroom is within budget" is simply false, and bedroom-specific rents are
//    unpopulated across the collection. So budget is judged ONLY against the rent for the
//    bedroom count the client actually needs; when that figure is missing, budget is "not
//    established" and says so, rather than quietly scoring as a fit.
// 2. COMMUTE. A property in a neighbouring ZIP is not thereby within twenty minutes of the
//    client's destination. A stated commute limit is only ever reported as met when a real
//    travel-time estimate says so; with no estimate the property may still be recommended, but
//    the limit is listed as unverified instead of assumed.
import type { QuickMatchProperty, ScreeningAssessment, AssessedTier, DisplayTier } from "./types"
import { assessGeography, GEO_WEIGHT, GEO_BAND_MILES, type ClientGeography, type GeoFit } from "./geography"

/** The ceiling the policy sets. Six is the most an agent will be shown, never a quota to fill. */
export const MAX_RECOMMENDATIONS = 6

export type ClientNeeds = {
  /** Bedrooms the client asked for. null = unstated, which is not a mismatch. */
  bedrooms: number | null
  /** Maximum rent the client gave. null = unstated. */
  budgetMax: number | null
  /** ZIPs the client named in the intake. */
  preferredZips: string[]
  /** The destination ZIP from Edit Client Profile. */
  destinationZip: string | null
  /** A stated commute ceiling in minutes, e.g. 20. */
  commuteLimitMinutes: number | null
  /** The commute destination's own label, for the agent-facing reason text. */
  commuteDestinationLabel: string | null
  /**
   * The client's resolved geographic requirement. Absent means none was resolved, and geography
   * is then not a criterion at all — see ./geography. Note what that implies for a property with
   * no policy on record: with no geographic evidence it has no evidence, so it is not
   * recommended.
   */
  geography?: ClientGeography
}

export type RankInput = {
  property: QuickMatchProperty
  assessment: ScreeningAssessment
  /** Real driving estimate to the client's destination, when one could be obtained. */
  travelMinutes: number | null
}

export type Recommendation = {
  property: QuickMatchProperty
  /** What the agent sees. There is no "No policy" label — see DISPLAY_TIERS. */
  tier: DisplayTier
  /** What the screening engine actually concluded, which `tier` can soften but never contradict. */
  screeningTier: AssessedTier
  /** Does this property state ANY requirement bearing on this client's situation? */
  policyOnRecord: boolean
  /** Where it sits relative to what the client asked for. */
  geo: GeoFit
  assessment: ScreeningAssessment
  /** Why it was selected, agent-facing, most load-bearing first. */
  reasons: string[]
  /** Everything the agent must confirm before relying on it. */
  unverified: string[]
  /** Documented restrictions that bear on this client, for agent review. */
  conflicts: string[]
  /** Approval costs: deposits, risk fees, guarantor programmes. */
  conditions: string[]
  score: number
}

export type ExcludedCandidate = { placeId: string; propertyName: string | null; why: string[] }

export type RankResult = {
  recommendations: Recommendation[]
  /** Outside every geographic band the client's own areas define. */
  excludedByGeography: ExcludedCandidate[]
  /** Nothing on record, and no other established evidence for putting it in front of them. */
  excludedNoPolicy: ExcludedCandidate[]
}

/**
 * Real evidence outranks none, inside the geographic pool.
 *
 * Three weights but only two labels: a property with nothing on record is SHOWN as Needs
 * Verification (see DISPLAY_TIERS) while still ranking below one whose policies are recorded and
 * merely incomplete. The agent reads one honest label and still gets the better-evidenced
 * property first.
 */
const TIER_WEIGHT: Record<AssessedTier, number> = {
  strong_candidate: 1_000_000,
  needs_verification: 700_000,
  curated_only: 400_000,
}

const TIER_REASON: Record<AssessedTier, string> = {
  strong_candidate:
    "Every screening requirement this property states for this client's situation is met (not a guarantee of approval)",
  needs_verification:
    "Screening information is on record and leaves open questions — confirm them before sending",
  curated_only:
    "NO screening policy is on record for this property — it is on the curated Quick Match list and in the client's own area, and everything below must be confirmed with the leasing office",
}

/** The bedroom-specific starting rent, or null when that floor plan's price is unknown. */
export function bedroomRent(p: QuickMatchProperty, bedrooms: number | null): number | null {
  if (bedrooms === 1) return p.onebrStartingRent
  if (bedrooms === 2) return p.twobrStartingRent
  if (bedrooms === 3) return p.threebrStartingRent
  return null
}

/** Does the community offer the bedroom count at all? Unknown range is not a mismatch. */
function bedroomsFit(p: QuickMatchProperty, bedrooms: number | null): boolean | null {
  if (bedrooms === null) return null
  if (p.bedsMin === null && p.bedsMax === null) return null
  const lo = p.bedsMin ?? bedrooms
  const hi = p.bedsMax ?? bedrooms
  return bedrooms >= lo && bedrooms <= hi
}

const NOT_APPLICABLE: GeoFit = {
  band: null, applicable: false, miles: null, anchorLabel: null, reason: null, outsideReason: null,
}

/**
 * Select, order and cap — reporting what was left out and why.
 *
 * Three gates, in order, and each one records its refusals:
 *   • Known Mismatch — never reaches this function (index.ts reports it separately).
 *   • outside every geographic band the client's areas define.
 *   • nothing on record AND no other established evidence.
 */
export function rankRecommendationsDetailed(inputs: RankInput[], needs: ClientNeeds): RankResult {
  const geo = needs.geography
  const excludedByGeography: ExcludedCandidate[] = []
  const excludedNoPolicy: ExcludedCandidate[] = []
  const scored: Recommendation[] = []

  const assessed = inputs.filter((i) =>
    i.assessment.outcome === "strong_candidate"
    || i.assessment.outcome === "needs_verification"
    || i.assessment.outcome === "curated_only")

  for (const i of assessed) {
    const screeningTier = i.assessment.outcome as AssessedTier
    const policyOnRecord = screeningTier !== "curated_only"
    const fit = geo ? assessGeography(i.property, geo) : NOT_APPLICABLE
    const name = { placeId: i.property.placeId, propertyName: i.property.propertyName }

    // ── GATE 1. The client said where. ──
    if (fit.applicable && fit.band === null) {
      excludedByGeography.push({ ...name, why: [fit.outsideReason ?? "Outside the client's stated areas"] })
      continue
    }

    // Housing fit is computed BEFORE the no-policy gate, because "otherwise plausible" is
    // exactly these two facts.
    const beds = bedroomsFit(i.property, needs.bedrooms)
    const rent = needs.bedrooms !== null ? bedroomRent(i.property, needs.bedrooms) : null
    const overBudget = needs.budgetMax !== null && rent !== null && rent > needs.budgetMax

    // ── GATE 2. Nothing on record needs a reason to be here that is not curation. ──
    if (!policyOnRecord) {
      if (fit.band === null) {
        excludedNoPolicy.push({
          ...name,
          why: [fit.applicable
            ? "No screening policy on record, and it is not in or near an area the client named"
            : "No screening policy on record, and the client named no area that could put it in front of them"],
        })
        continue
      }
      if (beds === false || overBudget) {
        excludedNoPolicy.push({
          ...name,
          why: [beds === false
            ? `No screening policy on record, and it may not offer ${needs.bedrooms}-bedroom floor plans`
            : `No screening policy on record, and its ${needs.bedrooms}BR starts above the $${needs.budgetMax?.toLocaleString()} budget`],
        })
        continue
      }
    }

    const reasons: string[] = []
    const unverified = [...i.assessment.unverified]
    // The gate has already run: what remains is ordering. Screening standing leads, the band
    // orders equals, and the housing terms below break the remaining ties.
    let score = TIER_WEIGHT[screeningTier] + (fit.band ? GEO_WEIGHT[fit.band] : 0)

    // WHERE still leads the REASONS, whatever its weight: it is the client's own requirement and
    // the first thing an agent checks.
    if (fit.reason) reasons.push(fit.reason)
    reasons.push(TIER_REASON[screeningTier])
    if (!fit.applicable && (needs.destinationZip === null)) {
      unverified.push("The client has no preferred area or destination ZIP on record, so location was not used to choose this")
    }

    // 2. Bedrooms.
    if (beds === true) { score += 120; reasons.push(`Offers ${needs.bedrooms}-bedroom floor plans`) }
    else if (beds === false) { score -= 400; reasons.push(`May not offer ${needs.bedrooms}-bedroom floor plans`) }
    else if (needs.bedrooms !== null) unverified.push(`Whether ${needs.bedrooms}-bedroom floor plans are offered is not recorded`)

    // 3. Budget — ONLY against the bedroom the client needs. rentMin is never substituted.
    if (needs.budgetMax !== null && needs.bedrooms !== null) {
      if (rent === null) {
        unverified.push(`No ${needs.bedrooms}-bedroom starting rent is recorded, so budget fit is not established`)
      } else if (rent <= needs.budgetMax) {
        score += 80
        reasons.push(`${needs.bedrooms}BR starts at $${rent.toLocaleString()}, within the $${needs.budgetMax.toLocaleString()} budget`)
      } else {
        score -= 60
        reasons.push(`${needs.bedrooms}BR starts at $${rent.toLocaleString()}, above the $${needs.budgetMax.toLocaleString()} budget`)
      }
    }

    // 4. Commute. A real estimate, or an explicit admission that there is none. This is the one
    //    geographic claim that needs a measured drive time rather than a distance.
    const dest = needs.commuteDestinationLabel ? ` to ${needs.commuteDestinationLabel}` : " to the destination"
    if (needs.commuteLimitMinutes !== null) {
      if (i.travelMinutes === null) {
        unverified.push(`Travel time${dest} could not be estimated, so the ${needs.commuteLimitMinutes}-minute limit is unconfirmed`)
      } else if (i.travelMinutes <= needs.commuteLimitMinutes) {
        score += 70
        reasons.push(`About ${i.travelMinutes} minutes${dest}, within the ${needs.commuteLimitMinutes}-minute limit`)
      } else {
        score -= 90
        reasons.push(`About ${i.travelMinutes} minutes${dest}, beyond the ${needs.commuteLimitMinutes}-minute limit`)
      }
    } else if (i.travelMinutes !== null) {
      score += 20
      reasons.push(`About ${i.travelMinutes} minutes${dest}`)
    }

    scored.push({
      property: i.property,
      // The softening, and its single rule: nothing on record is shown as Needs Verification,
      // never as a match, and `policyOnRecord` keeps the fact available to anything that asks.
      tier: screeningTier === "curated_only" ? "needs_verification" : screeningTier,
      screeningTier, policyOnRecord, geo: fit, assessment: i.assessment,
      reasons, unverified, conflicts: i.assessment.conflicts, conditions: i.assessment.conditions,
      score,
    })
  }

  const recommendations = scored
    .sort((a, b) => b.score - a.score || (a.property.propertyName ?? "").localeCompare(b.property.propertyName ?? ""))
    .slice(0, MAX_RECOMMENDATIONS)

  return { recommendations, excludedByGeography, excludedNoPolicy }
}

/** The list alone, for callers that do not report exclusions. */
export function rankRecommendations(inputs: RankInput[], needs: ClientNeeds): Recommendation[] {
  return rankRecommendationsDetailed(inputs, needs).recommendations
}

export { GEO_BAND_MILES }
