// Location Filter — the one production location-scoring implementation.
//
// Priority (highest → lowest confidence): Neighborhood > Submarket > Tags >
// Address keywords. Each tier is scored independently via plain keyword
// overlap — no clusters, aliases, or DB lookups — then summed and capped,
// so a strong Neighborhood match can reach the ceiling on its own while
// weaker tiers only add up as reinforcement when it's absent or partial.
//
// Pure and framework-agnostic (no "use client", no React) so it's callable
// from both components/crm/LeadInsights.tsx (the live production path) and
// lib/matching/filters/finalRankingEngine.ts (the new architecture) without
// duplicating the logic in two places.

import type { FilterResult } from "./types"

function extractKeywords(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s|,/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2)
}

// City-name tokens are never a useful location-match signal — every
// candidate property has already been filtered to the lead's city, so a
// shared "san"/"antonio"/"dallas" token just inflates the score without
// indicating any real neighborhood/area overlap.
const CITY_NAME_STOPWORDS = new Set(["san", "antonio", "dallas", "houston", "austin"])

function stripCityStopwords(keywords: string[]): string[] {
  return keywords.filter((kw) => !CITY_NAME_STOPWORDS.has(kw))
}

type LocationTier = { field: "neighborhood" | "submarket" | "tags" | "full_address"; label: string; cap: number }

const LOCATION_TIERS: LocationTier[] = [
  { field: "neighborhood", label: "Neighborhood", cap: 25 },
  { field: "submarket", label: "Submarket", cap: 20 },
  { field: "tags", label: "Tags", cap: 15 },
  { field: "full_address", label: "Address", cap: 10 },
]

// Exported so callers (e.g. the "Best Match" badge in LeadInsights.tsx) can
// convert a raw score into a percentage without hardcoding/duplicating this
// cap and risking drift if it's ever tuned.
export const LOCATION_FILTER_MAX_SCORE = 25
const OVERALL_LOCATION_CAP = LOCATION_FILTER_MAX_SCORE

export function runLocationFilter(lead: any, property: any): FilterResult {
  const leadText = [lead?.neighborhoods, lead?.desired_areas, lead?.notes]
    .filter(Boolean)
    .join(" ")
  const leadKeywords = stripCityStopwords(extractKeywords(leadText))

  const reasons: string[] = []
  let rawTotal = 0

  for (const tier of LOCATION_TIERS) {
    const fieldKeywords = stripCityStopwords(extractKeywords(property?.[tier.field] || ""))
    const tierMatches = fieldKeywords.filter((kw) => leadKeywords.includes(kw))
    const tierScore = tierMatches.length > 0 ? Math.min(tier.cap, tierMatches.length * 10) : 0

    if (tierScore > 0) {
      reasons.push(`${tier.label} matched: ${[...new Set(tierMatches)].join(", ")} (+${tierScore})`)
    }
    rawTotal += tierScore
  }

  const score = Math.min(OVERALL_LOCATION_CAP, rawTotal)

  if (reasons.length === 0) {
    reasons.push("No location match")
  }

  return { score, reasons, status: "ok" }
}
