import type { SupabaseClient } from "@supabase/supabase-js"
import { loadGoogleMaps } from "./loadMaps"
import type { ExplorerProperty } from "./types"
import { fetchCatalog, enrichProperties } from "./catalog"
import {
  nameSearchTextQuery,
  nameMatchesQuery,
  normalizePlace,
  selectInMarketMatch,
  shouldFetchSuggestions,
} from "./nameSearch"

/**
 * THE canonical Locator Beast property search.
 *
 * This is the Map / Explorer's own search orchestration, lifted out of
 * BeastPropertyExplorer verbatim so other surfaces can use the SAME engine
 * instead of approximating it. The Map now calls this; its behaviour is
 * unchanged by construction, because this IS its code.
 *
 * WHY THIS EXISTS. Add Favorites was wired to a thin Social-Autopilot helper that
 * also calls Place.searchByText, which looked like reuse and was not. Typing "ve"
 * in the Map returns Vue at Sonoma Verde, Vecina Apartment Villas, The View at
 * Westover Hills… and in Favorites returned NOTHING, because that helper has a
 * 3-character floor and no market bias. Three differences, all invisible from the
 * call site:
 *
 *   minimum query   Map 2 chars            helper 3 chars  → "ve" never searched
 *   locationBias    market bounds          helper none     → global results
 *   after the call  market-envelope filter,                → raw list, no catalog
 *                   name-relevance filter,                   identity, no ranking
 *                   catalog enrichment,
 *                   selectInMarketMatch
 *
 * The lesson is in the shape of this module: the ORCHESTRATION is the product, not
 * the Places call. Anything that only calls searchByText is not this search.
 */

/** The minimum typed length that triggers a search. Mirrors the Map exactly. */
export const MIN_QUERY_CHARS = 2

export type PropertySearchResult = {
  /** Everything inside the market envelope, enriched from property_catalog. */
  inMarket: ExplorerProperty[]
  /** The subset that qualifies as a real property (apartment-typed or catalogued). */
  qualified: ExplorerProperty[]
  /** The single best in-market match, when one is unambiguous. */
  selected: ExplorerProperty | null
}

export type PropertySearchOptions = {
  /** What the locator typed, untouched. */
  query: string
  /**
   * SOFT bias so a bare name resolves in this metro — a bias, never a
   * restriction, so a strong match just past the edge still returns.
   */
  locationBias?: google.maps.places.SearchByTextRequest["locationBias"]
  /**
   * Catalog market slug; drives the market-envelope filter and ranking. Nullable
   * to match normalizePlace / selectInMarketMatch, which both accept null — a
   * surface with no market resolved still searches, it just isn't envelope-filtered.
   */
  marketSlug: string | null | undefined
  /** Browser Supabase client, for the property_catalog enrichment. */
  supabase: SupabaseClient
}

/** Should a query this short be sent at all? The Map's own 2-char rule. */
export function shouldSearch(query: string, lastResolvedName = ""): boolean {
  return shouldFetchSuggestions(query, lastResolvedName)
}

/**
 * One Places Text Search for a name → normalized, market-restricted, qualified and
 * catalog-enriched candidates.
 *
 * No map or component state is touched: callers decide what to do with the result.
 * Errors propagate, so a caller can distinguish "no matches" from "search failed".
 */
export async function searchProperties(opts: PropertySearchOptions): Promise<PropertySearchResult | null> {
  const { query, locationBias, marketSlug, supabase } = opts
  const name = query.trim()
  if (!name) return null

  const { places: placesLib } = await loadGoogleMaps()
  const { Place } = placesLib
  const { places } = await Place.searchByText({
    // Minimum fields, plus `types` so obvious non-apartment businesses (a
    // brokerage, a vacation rental, a restaurant) can be qualified out. NO hard
    // includedType — a community Google mistypes must still be findable by name.
    fields: ["id", "displayName", "formattedAddress", "location", "types"],
    // Apartment-context query so a bare brand ("Allora") returns communities
    // instead of a same-named restaurant. The user's input is untouched.
    textQuery: nameSearchTextQuery(name),
    ...(locationBias ? { locationBias } : {}),
    // Fetch a few extra since the relevance filter below trims noise.
    maxResultCount: 10,
  })

  const found: ExplorerProperty[] = (places ?? [])
    .map((p) => normalizePlace(p, marketSlug))
    .filter((p): p is ExplorerProperty => p !== null)
    // Drop what the broadened "…apartments" query drags in: a generic nearby
    // apartment when the brand has no local match, or a differently-spelled
    // place — keep only candidates whose NAME matches what was typed.
    .filter((p) => nameMatchesQuery(p.propertyName, name))

  const catalog = await fetchCatalog(
    found.map((f) => f.placeId),
    supabase,
  )
  const enriched = enrichProperties(found, catalog)
  const cataloguedIds = new Set(catalog.keys())
  return selectInMarketMatch(enriched, marketSlug, name, cataloguedIds)
}

/**
 * A market's search bias from its catalog bounds, with the Map's fallback.
 *
 * Surfaces without a live map (Favorites, Invoice) have no map centre to fall back
 * to, so they pass bounds or nothing — which is the correct degradation: an absent
 * bias widens the search rather than breaking it.
 */
export function biasFromBounds(
  bounds: google.maps.LatLngBoundsLiteral | null | undefined,
): google.maps.places.SearchByTextRequest["locationBias"] | undefined {
  return bounds ?? undefined
}
