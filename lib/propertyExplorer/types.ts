/**
 * Beast Property Explorer — the normalized property a map result becomes.
 *
 * Field names deliberately mirror the Companion's CurrentProperty (and therefore
 * FavoriteDTO / RecommendationDTO), so a property discovered on the map is
 * directly compatible with the EXISTING Current Property → Recommendation →
 * Favorite workflow with no remapping and no parallel Google-specific state.
 *
 * `propertyUrl` is the canonical Google Maps place URL derived from the Place ID.
 * The existing add-recommendation / add-favorite verbs treat propertyUrl as the
 * primary identity, so supplying a real, stable URL is what lets a map property
 * flow into the workflow later without changing it.
 *
 * lat/lng, placeId, source and the search context are retained so richer geo
 * intelligence can be layered on later without rebuilding this foundation. V1
 * does nothing geometric with them.
 */
export type ExplorerProperty = {
  /** Google Place ID — stable external identity for the place. */
  placeId: string
  /** Mirrors CurrentProperty.propertyId so the shapes line up. */
  propertyId: string
  propertyName: string
  propertyAddress: string | null
  /** Canonical Google Maps place URL, derived from the Place ID. */
  propertyUrl: string
  lat: number
  lng: number
  /** Where this came from. Lets a future SAD-sourced property coexist. */
  source: "google_places"
  /** The market context the search ran in, when known (catalog slug). */
  marketSlug: string | null
  /** The map center the search was issued from — audit trail for the result set. */
  searchCenter: { lat: number; lng: number } | null
}

/** Canonical Google Maps URL for a place. Documented, stable, not fabricated. */
export function placeUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
}
