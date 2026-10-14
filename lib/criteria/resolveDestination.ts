import { displayDestinationLabel } from "@/lib/commute/destinationAliases"
import { aliasDestinationQuery } from "./destinationQueryAliases"
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
  | { status: "ambiguous"; candidates: string[]; spreadKm: number }
  | { status: "not_found" }
  | { status: "unavailable"; reason: string }

export type PlaceCandidate = { id: string; name: string; address: string; lat: number; lng: number }

/**
 * How far apart candidates may be and still describe ONE practical location.
 *
 * Measured, not guessed. "Potranco Rd & Loop 1604" returns two rows 0.13 km
 * apart — the north and south sides of a single interchange, which happens to
 * straddle a ZIP boundary. "Methodist Hospital" returns five facilities spread
 * 22 km. Two orders of magnitude separate "same place, labelled twice" from
 * "materially different places", so a plain radius separates them cleanly with
 * no scoring and no name matching.
 *
 * 1 km deliberately leaves "Bandera and 1604" (1.48 km) ambiguous: its
 * candidates are BUSINESSES near the intersection — a credit union, a grocery
 * store — not the intersection itself, so selecting one would anchor the client
 * on a bank. Resolving that case needs name cohesion, which is more machinery
 * than V1 should carry.
 */
export const COHESION_RADIUS_KM = 1

/** Great-circle distance in km. */
function distanceKm(a: PlaceCandidate, b: PlaceCandidate): number {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The widest gap between any two candidates. 0 for a single candidate. */
export function candidateSpreadKm(candidates: PlaceCandidate[]): number {
  let max = 0
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const d = distanceKm(candidates[i], candidates[j])
      if (d > max) max = d
    }
  }
  return max
}

export type CandidateChoice =
  | { kind: "pick"; candidate: PlaceCandidate; selection: "unique" | "best_match"; spreadKm: number }
  | { kind: "ambiguous"; spreadKm: number }

/**
 * Choose among candidates by GEOGRAPHIC COHESION alone.
 *
 * Exported and pure so the rule is testable without a network call — the
 * decision is the part worth pinning, not the HTTP.
 *
 * This deliberately replaced an earlier name-containment test, which asked
 * whether the candidates were "the same place by name". That was wrong in both
 * directions: a bare "Dave's Hot Chicken" returns four branches all sharing one
 * name, up to 146 km apart, and the name test accepted them — silently anchoring
 * a client on a different city. Distance answers the question the name was
 * standing in for.
 *
 * NOT a general "pick Google's first result": #1 is taken only once every
 * candidate has been shown to describe the same practical location.
 */
export function chooseCandidate(candidates: PlaceCandidate[]): CandidateChoice {
  if (candidates.length === 0) return { kind: "ambiguous", spreadKm: 0 }
  if (candidates.length === 1) return { kind: "pick", candidate: candidates[0], selection: "unique", spreadKm: 0 }
  const spreadKm = candidateSpreadKm(candidates)
  if (spreadKm > COHESION_RADIUS_KM) return { kind: "ambiguous", spreadKm }
  // Cohesive: one place, several rows. Google's ranking decides which row.
  return { kind: "pick", candidate: candidates[0], selection: "best_match", spreadKm }
}

/** Bias toward the market we operate in so a bare "Methodist Hospital" resolves locally. */
const DEFAULT_BIAS = { rectangle: {
  low: { latitude: 29.1, longitude: -98.9 },
  high: { latitude: 29.8, longitude: -98.2 },
} }


export async function resolveDestination(
  query: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ResolveOutcome> {
  // Normalise a recognised destination name to the one Places resolves uniquely, BEFORE the
  // lookup. Everything after this point is unchanged — same request, same cohesion check, same
  // refusal on ambiguity. An unrecognised destination is sent exactly as the client said it.
  const textQuery = aliasDestinationQuery(String(query ?? ""))
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
        // places.location is what the cohesion test measures.
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
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
    places?: Array<{
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
    }>
  }
  const candidates: PlaceCandidate[] = (json.places ?? [])
    .map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.displayName?.text ?? ""),
      address: String(p.formattedAddress ?? ""),
      lat: Number(p.location?.latitude),
      lng: Number(p.location?.longitude),
    }))
    // A candidate with no coordinates cannot be measured, so it cannot take part
    // in a cohesion decision.
    .filter((p) => p.id && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))

  if (candidates.length === 0) return { status: "not_found" }

  const choice = chooseCandidate(candidates)
  if (choice.kind === "ambiguous") {
    return {
      status: "ambiguous",
      candidates: candidates.slice(0, 5).map((c) => `${c.name} — ${c.address}`),
      spreadKm: choice.spreadKm,
    }
  }

  return {
    status: "resolved",
    destination: {
      // The SAME alias bank the CRM and Companion display through, so a
      // conversation-resolved anchor reads identically to a locator-chosen one
      // ("Joint Base San Antonio: Fort Sam Houston" → "Fort Sam").
      label: displayDestinationLabel(choice.candidate.name),
      placeId: choice.candidate.id,
      // Provenance: "best_match" means several cohesive rows were collapsed, not
      // that the answer was unique. Nothing downstream pretends otherwise.
      selection: choice.selection,
    },
  }
}
