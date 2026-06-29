// Shared property/lead match scoring engine.
//
// Moved out of components/crm/LeadInsights.tsx (a "use client" component)
// so it can be imported from server-side code too — specifically
// app/api/admin/debug/match-breakdown/route.ts, which needs to call the
// REAL scoring function rather than a hand-mirrored copy. A "use client"
// file cannot be safely imported into a server route, so this pure logic
// now lives in its own framework-agnostic module.
//
// Behavior, formulas, and point values are unchanged from the original —
// this is a verbatim move, not a rewrite.

import { MANAGEMENT_PROFILES } from "@/lib/managementProfiles"
import { scoreLocationMatch } from "@/lib/matching/locationIntelligence"
import type { LocationCluster } from "@/lib/types/locationCluster"

// 🔥 KEYWORD EXTRACTOR
function extractKeywords(text: string) {
  if (!text) return []

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s|,/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
}

// Pre-resolved Location Intelligence clusters, computed once per fetch
// (outside calculateMatchScore, since cluster resolution is async and
// this function is not — see fetchProperties in LeadInsights.tsx).
//
// allowNearbyClusterScoring: set false when 6+ candidate properties already
// resolve to the lead's exact cluster, so nearby-cluster credit (the +20
// fallback) is withheld in favor of exact matches only. Computed once per
// fetch by countExactClusterMatches, applied uniformly to every property
// scored in that batch. Defaults to true (current behavior) if omitted.
export type LocationContext = {
  leadClusters: LocationCluster[]
  propertyClusters: LocationCluster[]
  allowNearbyClusterScoring?: boolean
}

// DEBUG ONLY — optional instrumentation hook, never affects the returned
// score. Used by debug routes to inspect the real calculateMatchScore
// execution instead of a hand-mirrored copy. Fired once, at the very end
// of the function, with every per-factor contribution captured alongside
// the values already used for location-intelligence debugging.
export type MatchScoreDebugInfo = {
  locationContextReceived: boolean
  leadClustersCount: number
  propertyClustersCount: number
  scoreBeforeLocationIntelligence: number
  locationPointsAdded: number
  scoreAfterLocationIntelligence: number

  cityScore: number
  locationKeywordScore: number
  budgetScore: number
  bedroomScore: number
  propertyTypeScore: number
  managementScore: number

  // Raw additive total BEFORE the Math.max(0, Math.min(100, ...)) clamp,
  // vs. the actual clamped/rounded value returned to callers. Compare the
  // two to spot score saturation (different raw totals all collapsing
  // to the same capped 100).
  rawScoreBeforeNormalization: number
  normalizedMatchScore: number
  finalScore: number
}

// 🔥 MATCH SCORING (APPROVAL FIRST)
export function calculateMatchScore(
  property: any,
  lead: any,
  locationContext?: LocationContext,
  debugCapture?: (info: MatchScoreDebugInfo) => void
) {
  let score = 0

  // =====================
  // CITY
  // =====================
  const citySlug = (lead.city || "")
    .toLowerCase()
    .replace(", tx", "")
    .replace(/\s+/g, "-")

  const cityScore = property.city_slug === citySlug ? 10 : 0
  score += cityScore

  // =====================
  // SHARED DERIVED VALUES
  // =====================
  const credit = Number(lead.credit_score || 0)
  const minCredit = Number(property.credit_min || 0)

  const hasBrokenLease =
    lead.credit_history === "Broken Lease" ||
    lead.broken_lease === true

  const hasEviction =
    lead.credit_history === "Eviction" ||
    lead.eviction === true

  const evictionAge = parseInt(lead.eviction_age || "0")

  const management = MANAGEMENT_PROFILES[property.management_company]

  // =====================
  // CREDIT
  // =====================
  if (minCredit > 0) {
    if (credit >= minCredit) score += 30
    else if (credit >= minCredit - 40) score += 15
    else score -= 20
  }

  // =====================
  // BROKEN LEASE
  // =====================
  if (hasBrokenLease) {
    score += property.broken_lease_ok ? 15 : -35
  }

  // =====================
  // EVICTION
  // =====================
  if (hasEviction) {
    if (evictionAge > 0 && evictionAge < 2) {
      // Recent eviction: light penalty if property accepts it, heavy if not
      score += property.eviction_ok ? -10 : -60
    } else {
      // Older eviction: reward eviction-friendly properties
      score += property.eviction_ok ? 10 : -45
    }
  }

  // Flexible-risk compound boost
  if (hasEviction || hasBrokenLease || credit < 600) {
    if (
      property.eviction_ok ||
      property.broken_lease_ok ||
      property.guarantor_accepted
    ) {
      score += 20
    }
  }

  // =====================
  // CRIMINAL BACKGROUND
  // =====================
  if (lead.criminal_background === "Felony") {
    if (property.felony_ok === true) score += 15
    else if (property.felony_ok === false) score -= 40
    // null/undefined = unknown, no change
  } else if (lead.criminal_background === "Misdemeanor") {
    if (property.misdemeanor_ok === true) score += 10
    else if (property.misdemeanor_ok === false) score -= 20
  }

  // =====================
  // BEDROOMS
  // =====================
  // Normalize a beds string to a numeric count.
  // Handles: "2 beds", "2-3", "3+", "Studio", "1", etc.
  function parseBeds(raw: string | number | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === "") return null
    const s = String(raw).toLowerCase().trim()
    if (s === "studio" || s === "0") return 0
    const match = s.match(/\d+/)
    if (!match) return null
    return parseInt(match[0])
  }

  const leadBeds = parseBeds(lead.beds)
  const propBeds = parseBeds(property.beds)

  let bedroomScore = 0
  if (leadBeds !== null && propBeds !== null) {
    const diff = Math.abs(leadBeds - propBeds)
    if (diff === 0) bedroomScore = 25       // exact match
    else if (diff === 1) bedroomScore = 10  // one off
    else bedroomScore = -15                 // two or more away
  }
  score += bedroomScore

  // =====================
  // PROPERTY TYPE
  // =====================
  // Normalize and keyword-match lead's desired type against property fields.
  const leadType = String(lead.property_type || "").toLowerCase().trim()
  const propTypeText = [
    property.property_type,
    property.name,
    property.submarket,
    property.neighborhood,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  let propertyTypeScore = 0
  if (leadType && leadType !== "any" && leadType !== "no preference") {
    // Define keyword groups so "townhome" matches "townhomes", "house" matches "home", etc.
    const TYPE_SYNONYMS: Record<string, string[]> = {
      apartment:  ["apartment", "apt", "flat"],
      townhome:   ["townhome", "townhouse", "town home", "town house"],
      house:      ["house", "home", "rental home", "single family", "sfr"],
      condo:      ["condo", "condominium"],
      "high-rise":["high-rise", "highrise", "high rise", "luxury high"],
      studio:     ["studio"],
      loft:       ["loft"],
    }

    // Find which synonym group the lead type belongs to
    const synonyms = Object.entries(TYPE_SYNONYMS).find(([key, vals]) =>
      key === leadType || vals.some((v) => leadType.includes(v))
    )?.[1] ?? [leadType]

    const typeMatches = synonyms.some((kw) => propTypeText.includes(kw))

    propertyTypeScore = typeMatches ? 20 : -10
  }
  score += propertyTypeScore

  // =====================
  // LOCATION KEYWORDS
  // =====================
  const leadText = [lead.neighborhoods, lead.desired_areas, lead.notes]
    .filter(Boolean)
    .join(" ")
  const propertyText = [
    property.neighborhood,
    property.submarket,
    property.full_address,
  ]
    .filter(Boolean)
    .join(" ")

  const leadKeywords = extractKeywords(leadText)
  const propertyKeywords = extractKeywords(propertyText)

  const matches = propertyKeywords.filter((kw) =>
    leadKeywords.includes(kw)
  )

  const locationKeywordScore = matches.length > 0 ? Math.min(25, matches.length * 10) : 0
  score += locationKeywordScore

  // =====================
  // LOCATION INTELLIGENCE (cluster-based — additive on top of the
  // free-text LOCATION KEYWORDS block above, not a replacement for it)
  // =====================
  const scoreBeforeLocationIntelligence = score // DEBUG capture only, not used in scoring
  let locationPointsAdded = 0
  if (locationContext) {
    locationPointsAdded = scoreLocationMatch(
      locationContext.leadClusters,
      locationContext.propertyClusters,
      30, // same cluster
      20, // nearby cluster
      locationContext.allowNearbyClusterScoring ?? true
    )
    score += locationPointsAdded
  }
  const scoreAfterLocationIntelligence = score // DEBUG capture only, not used in scoring

  // =====================
  // BUDGET (guideline, not hard filter)
  // Extract all digit groups so "$1,200 - $1,500" → [1200, 1500]
  // =====================
  const price = Number(property.price_value || 0)

  const rentNumbers = String(lead.desired_rent || "")
    .match(/[\d,]+/g)
    ?.map((n) => Number(n.replace(/,/g, "")))
    .filter((n) => n > 0) ?? []

  const budgetMin = rentNumbers.length > 0 ? Math.min(...rentNumbers) : 0
  const budgetMax = rentNumbers.length > 0 ? Math.max(...rentNumbers) : 0

  let budgetScore = 0
  if (price > 0 && budgetMax > 0) {
    const overRatio = (price - budgetMax) / budgetMax  // negative = under budget

    if (price <= budgetMax) {
      budgetScore = 8                             // at or under budget: small positive
    } else if (overRatio <= 0.20) {
      budgetScore = 4                             // up to 20% over: concession territory
    } else if (overRatio <= 0.40) {
      budgetScore = -5                            // 20–40% over: mild flag
    } else if (overRatio <= 0.60) {
      budgetScore = -10                           // 40–60% over: notable flag
    } else {
      budgetScore = -15                           // 60%+ over: strong flag
    }
  }
  score += budgetScore

  // =====================
  // MANAGEMENT FLEXIBILITY
  // =====================
  let managementScore = 0

  if (credit < 620 && management?.flexibleLowCredit) {
    managementScore += 20
  }

  if (hasBrokenLease && management?.flexibleBrokenLease) {
    managementScore += 20
  }

  if (hasEviction && management?.flexibleEviction) {
    managementScore += 25
  }

  if (lead.criminal_background === "Felony" && management?.strictFelony) {
    managementScore -= 40
  }

  score += managementScore

  // rawScoreBeforeNormalization: the unclamped additive total — this is
  // what reveals score saturation, since many different raw totals can
  // all clamp down to the same 100.
  const rawScoreBeforeNormalization = score
  const finalScore = Math.max(0, Math.min(100, Math.round(score)))
  const normalizedMatchScore = finalScore

  if (debugCapture) {
    debugCapture({
      locationContextReceived: !!locationContext,
      leadClustersCount: locationContext?.leadClusters.length ?? 0,
      propertyClustersCount: locationContext?.propertyClusters.length ?? 0,
      scoreBeforeLocationIntelligence,
      locationPointsAdded,
      scoreAfterLocationIntelligence,
      cityScore,
      locationKeywordScore,
      budgetScore,
      bedroomScore,
      propertyTypeScore,
      managementScore,
      rawScoreBeforeNormalization,
      normalizedMatchScore,
      finalScore,
    })
  }

  return finalScore
}
