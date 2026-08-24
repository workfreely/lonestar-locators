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
 *
 * COORDINATES ARE NULLABLE ON PURPOSE. Google Places returns a location for
 * every result we keep, but this shape is the provider-agnostic contract, not a
 * Google one. Forcing `lat: number` would mean a provider without reliable
 * coordinates could only satisfy the type by inventing them — a fabricated
 * coordinate is worse than an absent one, because nothing downstream can tell
 * the difference. `null` says "unknown" honestly, and callers that need a real
 * point use `hasCoordinates` rather than trusting the field.
 */
/**
 * Where a normalized property came from. A union rather than a literal so a
 * second provider normalizes INTO this shape instead of growing a parallel one.
 * Adding a member is all a new provider should need on the type side.
 */
export type PropertySource = "google_places" | "smart_apartment_data"

export type ExplorerProperty = {
  /** Google Place ID — stable external identity for the place. */
  placeId: string
  /** Mirrors CurrentProperty.propertyId so the shapes line up. */
  propertyId: string
  propertyName: string
  propertyAddress: string | null
  /** Canonical Google Maps place URL, derived from the Place ID. */
  propertyUrl: string
  /** Real latitude, or null when the provider exposes none. NEVER estimated. */
  lat: number | null
  /** Real longitude, or null when the provider exposes none. NEVER estimated. */
  lng: number | null
  /** Where this came from. Lets a future SAD-sourced property coexist. */
  source: PropertySource
  /** The market context the search ran in, when known (catalog slug). */
  marketSlug: string | null
  /** The map center the search was issued from — audit trail for the result set. */
  searchCenter: { lat: number; lng: number } | null
}

/** A property whose coordinates are known to be real numbers. */
export type LocatedProperty = ExplorerProperty & { lat: number; lng: number }

/**
 * Narrows to a property that genuinely has coordinates.
 *
 * This is the ONLY sanctioned way to get a plottable point out of the model:
 * anything that draws, measures or centres must pass through it, so a property
 * with unknown coordinates is skipped rather than defaulted to 0,0 — which is a
 * real location in the Gulf of Guinea and would look like data.
 */
export function hasCoordinates(p: ExplorerProperty): p is LocatedProperty {
  return typeof p.lat === "number" && Number.isFinite(p.lat)
    && typeof p.lng === "number" && Number.isFinite(p.lng)
}

/**
 * The normalized property as it crosses into Current Property / Companion
 * context. Deliberately a plain, serialisable object: it travels by
 * postMessage, so it carries no class instances and no Google objects.
 *
 * Coordinates are passed through EXACTLY as held — including null. The receiver
 * decides what to do without a coordinate; this layer never substitutes one.
 */
export function toCompanionProperty(p: ExplorerProperty) {
  return {
    propertyId: p.propertyId,
    propertyName: p.propertyName,
    propertyAddress: p.propertyAddress,
    propertyUrl: p.propertyUrl,
    lat: p.lat,
    lng: p.lng,
    placeId: p.placeId,
    source: p.source,
    marketSlug: p.marketSlug,
  }
}

/** Canonical Google Maps URL for a place. Documented, stable, not fabricated. */
export function placeUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
}
