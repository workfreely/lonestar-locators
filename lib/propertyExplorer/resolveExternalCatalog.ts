import type { SupabaseClient } from "@supabase/supabase-js"
import { loadGoogleMaps } from "./loadMaps"
import { normalizePlace, nameMatchesQuery } from "./nameSearch"
import { fetchCatalog } from "./catalog"
import type { ExplorerProperty } from "./types"

/**
 * Catalog enrichment for a property that has NO Google Place ID yet — i.e. a Smart
 * Apartment Data property (name + address only). Google is used ONLY to resolve
 * IDENTITY (name + full address → place_id), via the SAME browser Places call the
 * Map name-search already uses (`Place.searchByText`). The returned rating / image /
 * website come SOLELY from OUR `property_catalog` — never from the live Google
 * result. Browser-only: `loadGoogleMaps` needs `window`, so this runs in the CRM
 * client (DashboardClient), never on the server.
 *
 * Confidence gate: the resolved place's NAME must match the the external site name (every ≥4-char
 * token present, the same `nameMatchesQuery` the name-search uses). An ambiguous or
 * low-confidence hit resolves nothing, so we never enrich the wrong property.
 *
 * Returns:
 *   • `null` when no confident place matches (keep the the external site identity, unenriched);
 *   • `{ placeId, googleRating, propertyImageUrl, websiteUrl }` when a place matches
 *     — the three catalog fields are `null` when the resolved place_id has no
 *     `property_catalog` row (unknown stays unknown; the place_id is still returned
 *     so callers can adopt the canonical identity carrier).
 */
export type ExternalCatalogEnrichment = {
  placeId: string
  googleRating: number | null
  propertyImageUrl: string | null
  /** Canonical backup photo — the Companion card tries this if the primary fails to load. */
  propertyImageUrlBackup: string | null
  websiteUrl: string | null
  /** Verified current special, VERBATIM master text; the card normalizes it to a short badge. */
  currentSpecial: string | null
  /** Locator commission, verbatim trusted-master text (never web-inferred). Locator surface only. */
  sendCommission: string | null
  escortCommission: string | null
  bonusFlat: string | null
  /** property_catalog.verified_at — the special-freshness gate. */
  verifiedAt: string | null
}

export async function resolveExternalCatalog(
  name: string,
  address: string | null | undefined,
  supabase: SupabaseClient,
): Promise<ExternalCatalogEnrichment | null> {
  const cleanName = (name ?? "").trim()
  if (!cleanName) return null
  // Name + full address makes the Places match precise; the confidence gate below
  // still requires the resolved place's NAME to match, so an address-led or
  // ambiguous hit can never enrich a different property.
  const textQuery = [cleanName, (address ?? "").trim()].filter(Boolean).join(", ")

  const { places: placesLib } = await loadGoogleMaps()
  const { Place } = placesLib
  const { places } = await Place.searchByText({
    fields: ["id", "displayName", "formattedAddress", "location", "types"],
    textQuery,
    maxResultCount: 5,
  })

  const candidates: ExplorerProperty[] = (places ?? [])
    .map((p) => normalizePlace(p, null))
    .filter((p): p is ExplorerProperty => p !== null)

  const match = candidates.find((c) => nameMatchesQuery(c.propertyName, cleanName))
  if (!match) return null

  // Identity resolved → look up OUR catalog for the display-only enrichment.
  const catalog = await fetchCatalog([match.placeId], supabase)
  const rec = catalog.get(match.placeId)
  return {
    placeId: match.placeId,
    googleRating: rec?.googleRating ?? null,
    propertyImageUrl: rec?.imageUrl ?? null,
    propertyImageUrlBackup: rec?.imageUrlBackup ?? null,
    websiteUrl: rec?.websiteUrl ?? null,
    currentSpecial: rec?.currentSpecial ?? null,
    sendCommission: rec?.sendCommission ?? null,
    escortCommission: rec?.escortCommission ?? null,
    bonusFlat: rec?.bonusFlat ?? null,
    verifiedAt: rec?.verifiedAt ?? null,
  }
}
