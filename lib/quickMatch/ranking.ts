// Quick Match — ordering, and the hard ceiling of six.
//
// ── SIX IS A MAXIMUM, NOT A TARGET ──────────────────────────────────────────────────────────
// `MAX_RECOMMENDATIONS` caps the list; nothing invents a candidate to fill it. If two properties
// earn a place, the agent gets two.
//
// ── THE ONE PLACE CURATION STANDS IN FOR DATA, AND WHY ──────────────────────────────────────
// A property with no screening policy on record is `curated_only`. It IS recommendable, and that
// is a deliberate judgement rather than padding:
//
//   • the pool is not the 4,207-row catalogue, it is the 68-property Quick Match collection — a
//     hand-curated list of the places that work for credit-challenged renters. Membership is the
//     positive signal, and it was put there by a person;
//   • the row says so in the agent's face: the chip reads "No policy on record" and the detail
//     lists every unanswered question. Nothing claims approval, so the failure mode this guards
//     against — an agent sending a renter somewhere that will decline them — is met by the
//     label, not by withholding the row;
//   • the alternative, today, is an empty section. 0 of 68 members hold a broken-lease or
//     eviction policy and 3 hold a felony policy, so a rule that recommends only assessed
//     properties recommends almost nothing, and the agent falls back to calling the same curated
//     list by hand with no questions prepared.
//
// It is ranked STRICTLY BELOW everything with real evidence (see TIER_WEIGHT), counted
// separately in the result, and it can never outrank a Needs-Verification property however well
// it fits on bedrooms, budget or distance — the tier gap is wider than every other term added
// together. A property ruled out by a stated policy is still excluded outright.
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
import type { QuickMatchProperty, ScreeningAssessment, RecommendableTier } from "./types"

/** The ceiling the policy sets. Six is the most an agent will be shown, never a quota to fill. */
export const MAX_RECOMMENDATIONS = 6

export type ClientNeeds = {
  /** Bedrooms the client asked for. null = unstated, which is not a mismatch. */
  bedrooms: number | null
  /** Maximum rent the client gave. null = unstated. */
  budgetMax: number | null
  /** ZIPs the client named in the intake. */
  preferredZips: string[]
  /** The destination ZIP from Edit Client Profile. Ranks above the intake's area list. */
  destinationZip: string | null
  /** A stated commute ceiling in minutes, e.g. 20. */
  commuteLimitMinutes: number | null
  /** The commute destination's own label, for the agent-facing reason text. */
  commuteDestinationLabel: string | null
}

export type RankInput = {
  property: QuickMatchProperty
  assessment: ScreeningAssessment
  /** Real driving estimate to the client's destination, when one could be obtained. */
  travelMinutes: number | null
}

export type Recommendation = {
  property: QuickMatchProperty
  tier: RecommendableTier
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

/**
 * The tier gap, which has to dominate.
 *
 * The widest possible swing from the housing-fit terms below is 120 + 80 + 60 + 70 + 40 = 370
 * up and 400 + 60 + 90 = 550 down, so 10,000 between tiers guarantees that no combination of
 * bedrooms, budget and distance can lift a curated-only property above an assessed one. The
 * ordering question "is there evidence about this client's situation?" is settled before any
 * other is asked.
 */
const TIER_WEIGHT: Record<RecommendableTier, number> = {
  strong_candidate: 30000,
  needs_verification: 20000,
  curated_only: 10000,
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

const TIER_REASON: Record<RecommendableTier, string> = {
  strong_candidate:
    "Every screening requirement this property states for this client's situation is met (not a guarantee of approval)",
  needs_verification:
    "Screening information is on record and leaves open questions — confirm them before sending",
  curated_only:
    "On the curated Quick Match list for credit-challenged clients, but this property has NO screening policy on record — confirm everything before sending",
}

/**
 * Rank and cap.
 *
 * Known Mismatch is dropped before ordering, so a property ruled out by a stated policy can
 * never reach the agent however short the list becomes. Order follows the approved priority:
 * screening compatibility first, then bedrooms, then budget where it can be established, then
 * real proximity, then the client's stated areas.
 */
export function rankRecommendations(inputs: RankInput[], needs: ClientNeeds): Recommendation[] {
  const eligible = inputs.filter((i) =>
    i.assessment.outcome === "strong_candidate"
    || i.assessment.outcome === "needs_verification"
    || i.assessment.outcome === "curated_only")

  const scored = eligible.map((i) => {
    const tier = i.assessment.outcome as RecommendableTier
    const reasons: string[] = [TIER_REASON[tier]]
    const unverified = [...i.assessment.unverified]
    let score = TIER_WEIGHT[tier]

    // 2. Bedrooms.
    const beds = bedroomsFit(i.property, needs.bedrooms)
    if (beds === true) { score += 120; reasons.push(`Offers ${needs.bedrooms}-bedroom floor plans`) }
    else if (beds === false) { score -= 400; reasons.push(`May not offer ${needs.bedrooms}-bedroom floor plans`) }
    else if (needs.bedrooms !== null) unverified.push(`Whether ${needs.bedrooms}-bedroom floor plans are offered is not recorded`)

    // 3. Budget — ONLY against the bedroom the client needs. rentMin is never substituted.
    if (needs.budgetMax !== null && needs.bedrooms !== null) {
      const rent = bedroomRent(i.property, needs.bedrooms)
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

    // 4. Proximity. A real estimate, or an explicit admission that there is none.
    if (needs.destinationZip && i.property.zip === needs.destinationZip) {
      score += 60
      reasons.push(`In the requested destination ZIP ${needs.destinationZip}`)
    }
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

    // 5. Preferred areas, including surrounding ZIPs the client did not name but which may
    //    approve them. A nearby ZIP is a mild bonus and never a claim about commute time.
    if (i.property.zip && needs.preferredZips.includes(i.property.zip)) {
      score += 40
      reasons.push(`In ${i.property.zip}, one of the client's preferred areas`)
    } else if (i.property.zip && needs.preferredZips.length > 0) {
      reasons.push(`In ${i.property.zip}, a surrounding area rather than one the client named`)
    }

    return {
      property: i.property, tier, assessment: i.assessment, reasons, unverified,
      conflicts: i.assessment.conflicts, conditions: i.assessment.conditions, score,
    }
  })

  return scored
    .sort((a, b) => b.score - a.score || (a.property.propertyName ?? "").localeCompare(b.property.propertyName ?? ""))
    .slice(0, MAX_RECOMMENDATIONS)
}
