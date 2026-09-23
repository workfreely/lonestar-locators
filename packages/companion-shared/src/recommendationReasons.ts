// Phase 2A — collect grounded "Why I chose this for you" reasons for a recommendation.
//
// This is a COLLECTOR/RANKER only: it consumes the fragments the existing evidence-
// gated evaluators already produce (evaluateAmenities / evaluateLocationFit /
// evaluateBudget / evaluateApproval / evaluateSpecials on the the external site path; assessLocationFit
// on the Map path). It NEVER invents a reason, runs no LLM, and does not change any
// evaluator's scoring — a fragment appears only when its evaluator supplied real evidence.
//
// Ordering is deterministic and favors CLIENT-SPECIFIC matching (the client's own
// must-have amenities, requested location, budget) over generic property marketing
// (a concession). Capped at 3 to honor the lead_recommendations_reasons_max3 constraint.

export type ReasonEvidence = {
  /** evaluateAmenities output — the client's OWN must-haves the property confirms. */
  amenities?: string[] | null
  /** evaluateLocationFit verdict === "good" (the external site) or assessLocationFit tone === "match" (Map). */
  locationMatch?: boolean | null
  /** evaluateBudget output string ("Within budget" / "Options within budget" / …). */
  budget?: string | null
  /** evaluateApproval reason ("1099 friendly", "Second chance"), when present. */
  approvalReason?: string | null
  /** Resolved current concession display ("8 Weeks Free"), when present. */
  special?: string | null
}

/** Join amenity labels into a natural phrase: [a] → "a", [a,b] → "a and b",
 *  [a,b,c] → "a, b and c". Inputs are already client-relevant confirmed amenities. */
function joinAmenities(list: string[]): string {
  const items = list.map((s) => s.trim()).filter(Boolean)
  if (items.length <= 1) return items[0] ?? ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/**
 * Up to 3 grounded reasons, most client-specific first. The order is the priority:
 *   1) must-have amenities the property confirms   (client asked for it)
 *   2) matches the client's requested location
 *   3) fits the client's budget
 *   4) approval-friendly management
 *   5) a current concession/special               (generic marketing)
 *
 * Review quality is intentionally NOT a source here: there is no existing evidence-
 * gated rating rule to reuse, and a new rating threshold introduced solely for reasons
 * is out of scope. Fewer than three reasons is valid — slots are never padded.
 */
export function collectRecommendationReasons(e: ReasonEvidence): string[] {
  const out: string[] = []

  const amenities = (e.amenities ?? []).map((a) => (a ?? "").trim()).filter(Boolean)
  if (amenities.length > 0) {
    // Cap the amenity phrase itself at 3 items so one reason can't crowd the card.
    out.push(`Has the ${joinAmenities(amenities.slice(0, 3))} you wanted`)
  }

  if (e.locationMatch) out.push("In your preferred area")

  const b = (e.budget ?? "").trim().toLowerCase()
  if (b.startsWith("within budget")) out.push("Within your budget")
  else if (b.startsWith("options within budget")) out.push("Options within your budget")

  const approval = (e.approvalReason ?? "").trim()
  if (approval) out.push(approval)

  const special = (e.special ?? "").trim()
  if (special) out.push(special)

  // De-dupe case-insensitively (preserve first/highest-priority wording), cap at 3.
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const r of out) {
    const key = r.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(r)
  }
  return deduped.slice(0, 3)
}
