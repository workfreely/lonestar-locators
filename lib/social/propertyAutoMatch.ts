// Social Autopilot — filename → canonical property AUTO-RESOLUTION (decision core, pure).
//
// After filename inference produces a likely property name + market, we run the SAME read-only
// Map/Explorer property search (Google Places) headlessly and decide whether the results contain
// ONE clearly-dominant match we can safely auto-apply (canonical name + place_id + "Matched"),
// or whether they're ambiguous — in which case we leave the inferred text and let the operator
// pick from suggestions. This module is the pure, unit-testable decision; the Google search
// itself lives in the client resolver that feeds candidates in.
//
// SAFETY BIAS: we NEVER auto-apply an ambiguous or weak match. Generic property nouns
// (apartments/townhomes/…) and geographic/market suffixes (San Antonio, Medical Center, TX)
// must not, on their own, count as evidence — matching keys off the DISTINCTIVE brand tokens.
import { detectMarket } from "@/lib/social/filenameInference"

export type AutoMatchCandidate = { placeId: string; name: string; address: string | null }
export type AutoMatchResult = {
  /** The single high-confidence match to auto-apply, or null when nothing is safe to apply. */
  match: AutoMatchCandidate | null
  /** True when we declined because 2+ plausible candidates share the brand (operator should
   *  choose). Purely informational — the caller shows suggestions either way. */
  ambiguous: boolean
}

// Generic property-type nouns + leasing/marketing filler + state/country tokens. These carry NO
// brand identity, so they never anchor a match (a bare "Luxury Apartments" resolves to nothing).
const STOP = new Set([
  // articles / connectors
  "the", "at", "of", "and", "in", "on", "by", "for", "to", "a", "an",
  // property-type nouns (all canonical + common variants/plurals)
  "apartment", "apartments", "apt", "apts", "townhome", "townhomes", "townhouse", "townhouses",
  "home", "homes", "house", "houses", "studio", "studios", "penthouse", "penthouses",
  "highrise", "high", "rise", "loft", "lofts", "villa", "villas", "flat", "flats",
  "residence", "residences", "condo", "condos", "condominium", "condominiums",
  "community", "communities", "living", "luxury", "lofts",
  // markets / state / country (market geography is handled separately, never brand evidence)
  "san", "antonio", "dallas", "dfw", "fort", "worth", "houston", "austin", "tx", "texas", "usa",
])

/** Distinctive brand tokens of a property name, in order: lowercased alnum words ≥3 chars that
 *  aren't stop words or pure numbers. "Botanica Hills Townhomes" → ["botanica","hills"]. */
export function coreTokens(name: string | null | undefined): string[] {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))
}

function eq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}

/**
 * Decide whether the search candidates contain ONE dominant match for the inferred property.
 *
 * Rules (conservative by design):
 *   1. Reduce the inferred name to its distinctive brand tokens; if none remain (all generic),
 *      never auto-match.
 *   2. When a market is known, drop candidates whose address resolves to a DIFFERENT SA market
 *      (a candidate whose market can't be read from its address is kept — we can't disprove it).
 *   3. The brand anchor is the inferred name's lead distinctive token. Exactly ONE surviving
 *      candidate may contain it; 2+ → ambiguous, don't auto-apply.
 *   4. That sole brand-sharer is applied only when it's a STRONG match: identical brand tokens,
 *      full containment of the inferred tokens, or ≥2 shared brand tokens (which lets
 *      "Botanica Hills" resolve to canonical "Botanica Oak Hills" while a lone shared common
 *      word never does).
 */
export function decideAutoMatch(
  inferredName: string | null | undefined,
  market: string | null | undefined,
  candidates: AutoMatchCandidate[],
): AutoMatchResult {
  const inferredCore = coreTokens(inferredName)
  if (inferredCore.length === 0) return { match: null, ambiguous: false }
  const brand = inferredCore[0]

  const mkt = (market ?? "").trim()
  // In-market filter: keep candidates whose address market is unknown or equals the target.
  const pool = mkt
    ? candidates.filter((c) => {
        const am = detectMarket(c.address ?? "")
        return !am || am === mkt
      })
    : candidates

  const brandHits = pool.filter((c) => coreTokens(c.name).includes(brand))
  if (brandHits.length === 0) return { match: null, ambiguous: false }
  if (brandHits.length > 1) return { match: null, ambiguous: true }

  const winner = brandHits[0]
  const wCore = coreTokens(winner.name)
  const shared = inferredCore.filter((t) => wCore.includes(t))
  const strong =
    eq(inferredCore, wCore) || // identical brand tokens
    inferredCore.every((t) => wCore.includes(t)) || // inferred fully contained in candidate
    wCore.every((t) => inferredCore.includes(t)) || // candidate fully contained in inferred
    shared.length >= 2 // ≥2 shared distinctive tokens (brand + one more)
  if (!strong) return { match: null, ambiguous: false }
  return { match: { placeId: winner.placeId, name: winner.name, address: winner.address }, ambiguous: false }
}
