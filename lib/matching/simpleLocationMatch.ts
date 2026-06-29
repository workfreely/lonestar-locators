// Simple Location Match — a fresh, intentionally isolated, LOCATION-ONLY
// recommendation engine.
//
// This file does NOT import anything from lib/matching/locationIntelligence.ts
// or lib/matching/calculateMatchScore.ts. It is a clean-room implementation,
// built to be small enough to fully reason about and verify in isolation
// before any of the older, more complex layers are reconsidered.
//
// First version scope — LOCATION ONLY:
//   No credit. No budget. No property type. No bedrooms. No management.
//   No score stacking. Just a boolean inclusion test with a plain-English
//   explanation of why.
//
// Not wired into production. See app/api/admin/debug/simple-location-match
// for the verification route.

import { supabase } from "@/lib/supabase/client"

export type SimpleMatchedBy = "property_name" | "neighborhood" | "core_zip"

export type SimpleLeadArea = {
  clusterId: string
  clusterName: string
  terms: string[] // e.g. ["la cantera", "the rim"] — derived from cluster_name only
  coreZips: string[] // core_zips only — no nearby_zips, no aliases, no landmarks, no corridor_keywords
}

export type SimpleLocationMatchResult = {
  property: string
  included: boolean
  matchedBy: SimpleMatchedBy[]
  explanation: string
}

function norm(s: any): string {
  return String(s || "").toLowerCase().trim()
}

// Resolves the lead's area using ONLY location_clusters.cluster_name +
// core_zips. Does not consult aliases, landmarks, corridor_keywords, or
// nearby_clusters — kept deliberately minimal for this first version.
export async function resolveSimpleLeadArea(lead: any): Promise<SimpleLeadArea | null> {
  const { data: clusters, error } = await supabase.from("location_clusters").select("*")
  if (error || !clusters) return null

  const leadText = norm(lead?.neighborhoods)
  if (!leadText) return null

  const match = clusters.find((c: any) => {
    const nameParts = norm(c.cluster_name)
      .split("/")
      .map((s: string) => s.trim())
      .filter(Boolean)
    return nameParts.some((part: string) => leadText.includes(part))
  })

  if (!match) return null

  const terms = norm(match.cluster_name)
    .split("/")
    .map((s: string) => s.trim())
    .filter(Boolean)

  return {
    clusterId: match.cluster_id,
    clusterName: match.cluster_name,
    terms,
    coreZips: match.core_zips || [],
  }
}

// Pure, dependency-free inclusion test for ONE property against ONE
// already-resolved lead area.
//
// Include only if:
//   property.name contains an area term
//   OR property.neighborhood contains an area term
//   OR property.postal_code is one of the area's core_zips
export function simpleLocationMatch(property: any, area: SimpleLeadArea): SimpleLocationMatchResult {
  const matchedBy: SimpleMatchedBy[] = []

  const name = norm(property?.name)
  const neighborhood = norm(property?.neighborhood)
  const postalCode = String(property?.zip || property?.zip_code || property?.postal_code || "")

  const nameTerm = area.terms.find((t) => t && name.includes(t))
  if (nameTerm) matchedBy.push("property_name")

  const neighborhoodTerm = area.terms.find((t) => t && neighborhood.includes(t))
  if (neighborhoodTerm) matchedBy.push("neighborhood")

  if (postalCode && area.coreZips.includes(postalCode)) matchedBy.push("core_zip")

  const included = matchedBy.length > 0

  const reasons: string[] = []
  if (matchedBy.includes("property_name")) reasons.push(`property name contains "${nameTerm}"`)
  if (matchedBy.includes("neighborhood")) reasons.push(`neighborhood field contains "${neighborhoodTerm}"`)
  if (matchedBy.includes("core_zip")) {
    reasons.push(`postal code "${postalCode}" is one of the area's core ZIPs (${area.coreZips.join(", ")})`)
  }

  const explanation = included
    ? `Included because ${reasons.join(" and ")}.`
    : `Excluded — name ("${property?.name || ""}"), neighborhood ("${property?.neighborhood || ""}"), and postal code ("${postalCode}") matched none of the area's terms (${area.terms.join(", ")}) or core ZIPs (${area.coreZips.join(", ")}).`

  return {
    property: property?.name,
    included,
    matchedBy,
    explanation,
  }
}
