// DESTINATION QUERY ALIASES — what we ASK Google, not what we show a human.
//
// ── WHY THIS IS A SEPARATE FILE FROM destinationAliases ─────────────────────────────────────
// lib/commute/destinationAliases is explicitly DISPLAY-ONLY: it decides what a person sees and
// states "never a routing input". That boundary is deliberate and stays intact. This map is the
// other direction — it rewrites the client's words BEFORE the Places lookup — so it lives apart
// and the two never consult each other.
//
// ── THE PROBLEM IT SOLVES, PRECISELY ────────────────────────────────────────────────────────
// resolveDestination refuses when Places returns candidates more than COHESION_RADIUS_KM (1 km)
// apart, because that usually means materially different places. Measured against the live API:
//
//     "Randolph AFB"              → 5 candidates, 3.31 km apart  → ambiguous, refused
//     "Randolph Air Force Base"   → 5 candidates, 1.39 km apart  → ambiguous, refused
//     "Joint Base San Antonio-Randolph" → 1 candidate            → resolved
//
// A military base genuinely SPANS several kilometres, so Places returns its gates, clinics and
// buildings and the cohesion rule correctly reads them as scattered. The threshold is not wrong —
// it was calibrated on intersections (0.13 km) versus hospitals (22 km), and a base simply falls
// in the gap. So we do not loosen the rule; we ask a better question.
//
// ── WHAT THIS DELIBERATELY IS NOT ───────────────────────────────────────────────────────────
// NOT a place-id table. Ids go stale silently when Google reissues them, and baking one in would
// bypass the confidence checks entirely. The alias is only a QUERY STRING — the answer still comes
// from Places and still has to survive every existing check, including cohesion. If Google starts
// returning something scattered for the canonical name, this resolves to nothing, exactly as it
// should.
//
// Growing this map is a deliberate act: each entry needs a canonical name VERIFIED to resolve
// uniquely against the live API, not a guess.

/** client words (normalised) → the canonical name Places resolves uniquely. */
const QUERY_ALIASES: Record<string, string> = {
  // Verified against the live Places API: resolves to a single "JBSA Randolph".
  "randolph afb": "Joint Base San Antonio-Randolph",
  "randolph air force base": "Joint Base San Antonio-Randolph",
  "jbsa randolph": "Joint Base San Antonio-Randolph",
  "joint base san antonio randolph": "Joint Base San Antonio-Randolph",
}

/**
 * Normalise for lookup: case, surrounding whitespace, internal runs of whitespace, and the
 * punctuation that separates the same name written three ways ("JBSA-Randolph", "JBSA Randolph",
 * "Randolph A.F.B."). Nothing else is touched — this is a key for a small dictionary, not a
 * general text cleaner.
 */
export function normalizeDestinationQuery(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")        // "A.F.B." → "afb"
    .replace(/[-–—/]/g, " ")     // "JBSA-Randolph" → "jbsa randolph"
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The string to send to Places.
 *
 * Returns the client's own words unchanged when there is no alias — the default is always to ask
 * exactly what they said.
 */
export function aliasDestinationQuery(raw: string): string {
  const key = normalizeDestinationQuery(raw)
  return QUERY_ALIASES[key] ?? String(raw ?? "").trim()
}

/** True when this query is one we rewrite. Exported for tests and diagnostics. */
export function hasDestinationAlias(raw: string): boolean {
  return normalizeDestinationQuery(raw) in QUERY_ALIASES
}
