// Social Autopilot — approved hashtag bank, organized by the exact SA market taxonomy
// (Austin · Dallas · DFW · Houston · San Antonio). Dallas and DFW are DISTINCT — never
// merged. Deterministic selection only (NO AI generation yet): market-specific tags first,
// then general apartment-locator tags, deduped, order preserved, capped 7–10.

import { normalizeSocialMarket } from "@/lib/social/markets"

// Always-relevant tags (service + leasing), regardless of property type.
const BASE: readonly string[] = ["#nowleasing", "#apartmentlocator", "#forrent"]
// Property-type-specific tags so a townhome isn't tagged with apartment terms.
// Keyed by CANONICAL property types (lib/formOptions.ts).
const TYPE_TAGS: Record<string, readonly string[]> = {
  Townhome: ["#townhomes", "#townhouseliving", "#townhomeliving", "#townhometour"],
  "Rental Home": ["#rentalhome", "#homeforrent", "#houseforrent", "#hometour"],
  // Apartment-family (Apartment / High-Rise / Studio / Penthouse / Open to All / default)
  Apartment: ["#apartmenthunting", "#apartmentliving", "#luxuryapartments", "#apartmenttour"],
}
function typeTags(propertyType: string | null | undefined): readonly string[] {
  if (propertyType && TYPE_TAGS[propertyType]) return TYPE_TAGS[propertyType]!
  return TYPE_TAGS.Apartment
}

/** Market-specific approved tags. Keys are the SA market labels (verbatim). */
const BY_MARKET: Record<string, readonly string[]> = {
  Austin: ["#austinapartments", "#atxapartments", "#austintx", "#atxliving", "#austinrealestate"],
  Dallas: ["#dallasapartments", "#dallastx", "#dallasliving", "#dallasrealestate", "#uptowndallas"],
  DFW: ["#dfwapartments", "#dfwrealestate", "#dfwliving", "#fortworthapartments", "#dallasfortworth"],
  Houston: ["#houstonapartments", "#htxapartments", "#houstontx", "#htxliving", "#houstonrealestate"],
  "San Antonio": ["#sanantonioapartments", "#satxapartments", "#sanantoniotx", "#satxliving", "#sanantoniorealestate"],
}

/** All market labels that have a curated bank (for reference/UI). */
export const HASHTAG_MARKETS = Object.keys(BY_MARKET)

/**
 * Build an ORDERED list of 7–10 approved hashtags for a market: market-specific first, then
 * general, deduped case-insensitively. Returns [] for an unknown/empty market's specifics but
 * still fills from general so the list is never empty when a count is requested.
 */
export function buildHashtags(market: string | null | undefined, target = 8, propertyType?: string | null): string[] {
  const clamp = Math.max(7, Math.min(10, target))
  const label = normalizeSocialMarket(market) // keeps Dallas/DFW distinct
  const marketTags = BY_MARKET[label] ?? []
  const out: string[] = []
  const seen = new Set<string>()
  // Market-specific first, then type-specific, then base leasing/service tags.
  for (const tag of [...marketTags, ...typeTags(propertyType), ...BASE]) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= clamp) break
  }
  return out
}

/** Normalize a user-entered tag to a single #token (letters/digits/underscore). */
export function normalizeHashtag(raw: string): string {
  const t = (raw || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")
  return t ? `#${t}` : ""
}
