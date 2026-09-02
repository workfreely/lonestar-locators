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
  /** Google place type tags (e.g. "apartment_complex", "lodging",
   *  "real_estate_agency"). Used to qualify apartment/community candidates and
   *  reject obvious non-apartment businesses in name search. */
  types?: string[] | null
}

/** Google place types that mark a real apartment community. Google frequently sets
 *  a community's PRIMARY type to real_estate_agency (its leasing office) while still
 *  listing apartment_complex in `types`, so we look at the whole `types` array. */
const APARTMENT_TYPES = new Set(["apartment_complex", "apartment_building"])

/** True when a candidate carries a Google apartment/community type. */
export function hasApartmentType(p: ExplorerProperty): boolean {
  return (p.googleTypes ?? []).some((t) => APARTMENT_TYPES.has(t))
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
    googleTypes: Array.isArray(p.types) ? p.types : [],
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
 * in Google's relevance order, choose the SINGLE strongest valid apartment-community
 * candidate for an individual property search:
 *
 *   1. keep only candidates whose real coordinates lie inside the selected market's
 *      envelope (Dallas/Fort Worth share the DFW box; others own theirs);
 *   2. QUALIFY the apartment/community candidates — catalogued OR carrying a Google
 *      apartment type. This rejects the obvious non-apartment noise a bare name
 *      search drags in (brokerages, vacation/short-term rentals, restaurants, home
 *      builders — none catalogued, none apartment-typed) WITHOUT a hard includedType
 *      that would drop catalogued apartments Google mistypes (e.g. Oasis Stone Oak =
 *      real_estate_agency, no apartment type);
 *   3. rank the qualified survivors:
 *        a. exact normalized name match that is CATALOGUED,
 *        b. exact normalized name match with an apartment/community type,
 *        c. strongest in-market apartment/community candidate — catalogued first,
 *           else Google's top-relevance qualified candidate.
 *
 * Returns the in-market list, the qualified subset, and the single chosen property
 * (or `selected: null` when nothing in-market qualifies — the caller then surfaces
 * NO property and never falls back to noise or an out-of-market result). A candidate
 * without real coordinates cannot be verified and is dropped.
 *
 * `cataloguedIds` is the set of Place IDs present in property_catalog (resolved by
 * the caller's existing enrichment lookup — no extra request). Catalog membership is
 * a PREFERENCE, never a requirement: a legitimate uncatalogued apartment with an
 * apartment type still qualifies and can win.
 *
 * When `marketSlug` resolves to no bounds (unknown/unconfigured), `isInsideMarket`
 * returns true for every point, so the search is unrestricted rather than trapped —
 * the same "never trap an unconfigured account" rule the map itself uses.
 */
export function selectInMarketMatch<T extends ExplorerProperty>(
  candidates: T[],
  marketSlug: string | null | undefined,
  query: string,
  cataloguedIds?: Set<string>,
): { inMarket: T[]; qualified: T[]; selected: T | null } {
  const inMarket = candidates.filter(
    (p) => hasCoordinates(p) && isInsideMarket({ lat: p.lat, lng: p.lng }, marketSlug),
  )
  const cat = cataloguedIds ?? new Set<string>()
  const isCat = (p: T) => cat.has(p.placeId)
  const isApt = (p: T) => hasApartmentType(p)
  // A real apartment/community: catalogued OR apartment-typed. Everything else
  // (brokerage, lodging/vacation rental, restaurant, general contractor, …) is
  // rejected here.
  const qualified = inMarket.filter((p) => isCat(p) || isApt(p))
  if (qualified.length === 0) return { inMarket, qualified, selected: null }
  const q = normalizeName(query)
  const isExact = (p: T) => q.length > 0 && normalizeName(p.propertyName) === q
  const selected =
    qualified.find((p) => isExact(p) && isCat(p)) ?? // 3a exact + catalogued
    qualified.find((p) => isExact(p) && isApt(p)) ?? // 3b exact + apartment type
    qualified.find((p) => isCat(p)) ?? //              3c strongest catalogued
    qualified[0] ?? //                                 3c strongest apartment (relevance)
    null
  return { inMarket, qualified, selected }
}

/**
 * The text SENT to Places for a name search — not what the agent sees. A bare brand
 * word (e.g. "Allora") often loses to a more "prominent" unrelated place (Google
 * returns an "Allora" restaurant) and yields no apartment communities. Appending an
 * apartment context term biases Text Search toward communities WITHOUT a hard
 * includedType and without touching the user's input. Market geography is already
 * handled by the locationBias + the market-envelope filter, so no market name is
 * injected. Trimmed, so a trailing space never changes the query.
 */
export function nameSearchTextQuery(rawName: string): string {
  const name = rawName.trim()
  return name ? `${name} apartments` : ""
}

/**
 * A candidate is relevant to a NAME search when its name contains the meaningful
 * tokens the agent typed. This drops the noise the broadened "…apartments" query
 * can pull in — a generic nearby apartment when the brand has no local match, or a
 * differently-spelled community — while keeping every real match. Tokens shorter
 * than 4 chars (articles/particles like "the"/"at") are ignored; if nothing
 * meaningful remains (a very short query), fall back to a whole-query substring test.
 */
export function nameMatchesQuery(candidateName: string, query: string): boolean {
  const nn = normalizeName(candidateName)
  const toks = normalizeName(query)
    .split(" ")
    .filter((t) => t.length >= 4)
  if (toks.length === 0) return nn.includes(normalizeName(query))
  return toks.every((t) => nn.includes(t))
}

/**
 * Autocomplete trigger eligibility: fetch suggestions once the query is at least 2
 * characters, EXCEPT when it equals a canonical name we just resolved (a picker
 * click / market reset filled the input) — so the picker doesn't refetch/reopen for
 * text the user didn't type. Pure, so the exact threshold is testable.
 */
export function shouldFetchSuggestions(query: string, lastResolvedName: string): boolean {
  const name = query.trim()
  if (name.length < 2) return false
  if (lastResolvedName && normalizeName(name) === normalizeName(lastResolvedName)) return false
  return true
}

/**
 * The set of properties that must render as map markers: the live substring filter
 * over loaded results, UNIONED with the name-search matches AND the current
 * selection. A name-search hit (or the selected property) must show even when the
 * substring filter would hide it — the filter fragment the agent typed is often not
 * a contiguous substring of the real name ("standard legacy" vs "The Standard at
 * Legacy"), and a picker click fills the input with the canonical name. Guarantees
 * the clicked/selected property is always marker-visible while it is in `results`.
 */
export function computeVisible<T extends ExplorerProperty>(
  results: T[],
  query: string,
  nameMatchIds: Set<string>,
  selectedPlaceId?: string | null,
): T[] {
  const q = query.trim().toLowerCase()
  const base = q ? results.filter((p) => p.propertyName.toLowerCase().includes(q)) : results
  const forced = selectedPlaceId ? new Set(nameMatchIds).add(selectedPlaceId) : nameMatchIds
  if (forced.size === 0) return base
  const inBase = new Set(base.map((p) => p.placeId))
  const extra = results.filter((p) => forced.has(p.placeId) && !inBase.has(p.placeId))
  return extra.length ? [...base, ...extra] : base
}

/**
 * What the map should DO with a completed name search — the pure decision, split
 * out so both the success and the empty (no in-market) outcomes are testable
 * without React or Google Maps.
 */
export type NameSearchDecision<T extends ExplorerProperty> = {
  /** The property/ies to MERGE into the existing pins (existing win on overlap). For
   *  an individual property search this is EXACTLY the one selected property — never
   *  every in-market survivor — so unrelated Text Search results never become pins.
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
  result: { selected: T | null },
  prior: { selectedPlaceId: string | null; nameMatchIds: Set<string> },
): NameSearchDecision<T> {
  if (result.selected) {
    // ONLY the selected property contributes — not every in-market survivor — so a
    // name search adds exactly one pin (its card, marker and focus all share this
    // one Place ID). Existing area/Unleash pins are untouched.
    return {
      addResults: [result.selected],
      nameMatchIds: new Set([result.selected.placeId]),
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
