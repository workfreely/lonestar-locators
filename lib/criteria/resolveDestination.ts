import { displayDestinationLabel } from "@/lib/commute/destinationAliases"
import type { ResolvedDestination } from "./reconcileLocation"

/**
 * DESTINATION RESOLUTION — free text the client said → a canonical Google place.
 *
 * Commute Mode routes from `commute_anchor_place_id`, so a destination is only
 * usable once it has a real place id. A label alone would be a destination
 * nothing can measure to.
 *
 * ── WHY ITS OWN RESOLVER ────────────────────────────────────────────────────
 * lib/propertyExplorer/propertySearch.ts sends the query through
 * nameSearchTextQuery, which APPENDS "apartments" to bias Text Search toward
 * communities. That is right there and catastrophic here: "Lackland AFB" must
 * find a military base, not an apartment complex near one. The same reasoning
 * already produced CommuteDestinationField as a sibling rather than a flag on the
 * shared control — this is that component's server-side counterpart, and it
 * deliberately sends the client's words UNMODIFIED.
 *
 * SERVER ONLY. NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is referer-restricted and would be
 * rejected; GOOGLE_PLACES_API_KEY is the unrestricted server key, the same one
 * lib/commute/routes.ts uses.
 *
 * ── AMBIGUITY IS A REFUSAL, NOT A GUESS ─────────────────────────────────────
 * Returns a destination only when the answer is unambiguous. Several plausible
 * matches ("Methodist Hospital" in a city with five) returns null, and
 * reconciliation then writes nothing and flags it for review. Writing the wrong
 * anchor would silently point a client's entire search at the wrong place.
 */

export type ResolveOutcome =
  | { status: "resolved"; destination: ResolvedDestination }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string }

type PlaceCandidate = { id: string; name: string; address: string }

/** Bias toward the market we operate in so a bare "Methodist Hospital" resolves locally. */
const DEFAULT_BIAS = { rectangle: {
  low: { latitude: 29.1, longitude: -98.9 },
  high: { latitude: 29.8, longitude: -98.2 },
} }

/**
 * Two names are "the same place" for disambiguation when one contains the other
 * after normalization — Google often returns a base and its visitor center, or a
 * hospital and its campus, as separate results for one real destination.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

export async function resolveDestination(
  query: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ResolveOutcome> {
  const textQuery = String(query ?? "").trim()
  if (textQuery.length < 3) return { status: "not_found" }

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return { status: "unavailable", reason: "GOOGLE_PLACES_API_KEY is not set" }

  let res: Response
  try {
    res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      // The client's words, UNMODIFIED. No includedType and no appended context
      // term — a destination may be an address, an employer, a base, a school, a
      // hospital or a landmark, and either would exclude most of those.
      body: JSON.stringify({ textQuery, maxResultCount: 5, locationBias: DEFAULT_BIAS }),
      signal: opts.signal,
    })
  } catch (e) {
    return { status: "unavailable", reason: e instanceof Error ? e.message : "network error" }
  }

  if (!res.ok) {
    return { status: "unavailable", reason: `places searchText ${res.status}` }
  }

  const json = (await res.json()) as {
    places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string }>
  }
  const candidates: PlaceCandidate[] = (json.places ?? [])
    .map((p) => ({ id: String(p.id ?? ""), name: String(p.displayName?.text ?? ""), address: String(p.formattedAddress ?? "") }))
    .filter((p) => p.id && p.name)

  if (candidates.length === 0) return { status: "not_found" }

  // One result, or several that are all the same real place → unambiguous.
  const first = candidates[0]
  const distinct = candidates.filter((c) => {
    const a = normalize(c.name)
    const b = normalize(first.name)
    return !(a.includes(b) || b.includes(a))
  })
  if (distinct.length > 0) {
    return { status: "ambiguous", candidates: candidates.slice(0, 5).map((c) => `${c.name} — ${c.address}`) }
  }

  return {
    status: "resolved",
    // The SAME alias bank the CRM and Companion display through, so a
    // conversation-resolved anchor reads identically to a locator-chosen one
    // ("Joint Base San Antonio: Fort Sam Houston" → "Fort Sam").
    destination: { label: displayDestinationLabel(first.name), placeId: first.id },
  }
}
