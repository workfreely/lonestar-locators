import { isInsideMarket } from "@/lib/markets/catalog"
import { hasCoordinates, placeUrl, type ExplorerProperty } from "./types"

/**
 * The minimal shape of a Google Places (New) result we read. `location` is a
 * `LatLng` whose `lat()`/`lng()` are METHODS (verified against the live SDK), so we
 * accept exactly that structural type — which also lets the normalizer be unit
 * tested with a plain mock, no Google SDK required.
 */
export type PlaceLike = {
  id?: string | null
  displayName?: string | null
  formattedAddress?: string | null
  location?: { lat(): number; lng(): number } | null
}

/**
 * Normalize a Places result into an ExplorerProperty, reading the real coordinates
 * through `location.lat()`/`.lng()` EXACTLY — no rounding, no default, no market
 * center fallback. Returns `null` when the place has no id/location or the
 * coordinates aren't finite, so a place that cannot be mapped is DROPPED rather
 * than pinned at a fake/center point.
 */
export function normalizePlace(
  p: PlaceLike,
  marketSlug: string | null | undefined,
): ExplorerProperty | null {
  if (!p.id || !p.location) return null
  const lat = p.location.lat()
  const lng = p.location.lng()
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    placeId: p.id,
    propertyId: p.id,
    propertyName: p.displayName ?? "Unnamed property",
    propertyAddress: p.formattedAddress ?? null,
    propertyUrl: placeUrl(p.id),
    lat,
    lng,
    source: "google_places",
    marketSlug: marketSlug ?? null,
    searchCenter: null,
  }
}

/**
 * Individual property (name) search — the market-restriction + selection core,
 * split out of BeastPropertyExplorer so it is unit-testable WITHOUT React or the
 * Google Maps SDK.
 *
 * Name search runs a Places Text Search (a soft locationBias may steer result
 * QUALITY toward the current market), but the returned COORDINATES are treated as
 * authoritative: a candidate is only valid when it lands inside the selected
 * market's own navigation/search envelope — the SAME `boundsForMarket` box the map
 * pans within. Dallas and Fort Worth share one DFW envelope, so a Dallas-selected
 * search still finds Fort Worth (and vice-versa); San Antonio and Austin have their
 * own boxes, so a strong exact-name match in the other metro is rejected rather
 * than surfaced. There is no apartment-type gate anywhere in this path.
 */

/**
 * Normalize a community name for EXACT-match comparison: lowercase, collapse
 * internal whitespace, trim. Deliberately conservative — it does not strip
 * "The"/"Apartments"/punctuation, so an "exact" match means the same name the
 * agent typed, never a fuzzy guess.
 */
export function normalizeName(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * From raw (already normalized-to-ExplorerProperty) Places Text Search candidates,
 * in Google's relevance order, keep only those whose real coordinates lie inside
 * the selected market's envelope, then pick the strongest:
 *   1. an exact normalized name match (preferred over relevance rank), else
 *   2. the top relevance-ranked in-market candidate.
 * Returns the surviving in-market list plus the chosen property, or `selected:
 * null` when NOTHING is in-market — the caller then surfaces no property and never
 * falls back to an out-of-market result. A candidate with no real coordinates
 * cannot be geographically verified, so it is dropped.
 *
 * When `marketSlug` resolves to no bounds (unknown/unconfigured), `isInsideMarket`
 * returns true for every point, so the search is unrestricted rather than trapped —
 * the same "never trap an unconfigured account" rule the map itself uses.
 */
export function selectInMarketMatch<T extends ExplorerProperty>(
  candidates: T[],
  marketSlug: string | null | undefined,
  query: string,
): { inMarket: T[]; selected: T | null } {
  const inMarket = candidates.filter(
    (p) => hasCoordinates(p) && isInsideMarket({ lat: p.lat, lng: p.lng }, marketSlug),
  )
  if (inMarket.length === 0) return { inMarket, selected: null }
  const q = normalizeName(query)
  const exact = q ? inMarket.find((p) => normalizeName(p.propertyName) === q) : undefined
  return { inMarket, selected: exact ?? inMarket[0] }
}

/**
 * What the map should DO with a completed name search — the pure decision, split
 * out so both the success and the empty (no in-market) outcomes are testable
 * without React or Google Maps.
 */
export type NameSearchDecision<T extends ExplorerProperty> = {
  /** In-market properties to MERGE into the existing pins (existing win on overlap).
   *  Empty on a failed search, so normal/area pins are never disturbed. */
  addResults: T[]
  /** The next `nameMatchIds` set — the in-market hits, or empty on a failed search
   *  (clearing the prior name-search focus). */
  nameMatchIds: Set<string>
  /** The property to select + center on (pan/zoom). `null` means DO NOT move the
   *  camera and select nothing new — the case on a failed search. */
  focus: T | null
  /** On a failed search, clear an existing selection ONLY when it was itself a prior
   *  name-search result, so a stale Property A can't masquerade as this search's
   *  result. A card opened by clicking a normal/area pin is left alone. */
  clearPriorSelection: boolean
}

/**
 * Decide how to apply a `selectInMarketMatch` result to map state.
 *   • in-market match found → merge the in-market hits, set them as the name-match
 *     focus, and select + center the chosen property.
 *   • nothing in-market → add nothing (pins intact), clear `nameMatchIds`, move NO
 *     camera, and clear the current selection only if it came from a prior name
 *     search. Never falls back to an out-of-market property.
 */
export function decideNameSearch<T extends ExplorerProperty>(
  result: { inMarket: T[]; selected: T | null },
  prior: { selectedPlaceId: string | null; nameMatchIds: Set<string> },
): NameSearchDecision<T> {
  if (result.selected) {
    return {
      addResults: result.inMarket,
      nameMatchIds: new Set(result.inMarket.map((p) => p.placeId)),
      focus: result.selected,
      clearPriorSelection: false,
    }
  }
  return {
    addResults: [],
    nameMatchIds: new Set(),
    focus: null,
    clearPriorSelection:
      prior.selectedPlaceId != null && prior.nameMatchIds.has(prior.selectedPlaceId),
  }
}
