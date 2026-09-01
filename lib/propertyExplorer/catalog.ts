import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExplorerProperty } from "./types"

/**
 * Property Catalog enrichment — attaches structured Property Intelligence
 * geography to Google Places results by Google Place ID.
 *
 * A Places result whose placeId has no catalog row is returned UNCHANGED, so
 * unenriched properties keep their exact existing behavior. ZIP is carried
 * through but not used for matching in this checkpoint.
 */
export type CatalogRecord = {
  neighborhood: string | null
  location: string | null
  locationKeywords: string[]
  zip: string | null
  /** The property's own website (property_catalog.website_url), when catalogued. */
  websiteUrl: string | null
  /** Google Places star rating 0.0–5.0 (property_catalog.google_rating), when
   *  catalogued. Display-only; never affects ranking or search. */
  googleRating: number | null
}

export async function fetchCatalog(
  placeIds: string[],
  supabase: SupabaseClient,
): Promise<Map<string, CatalogRecord>> {
  const out = new Map<string, CatalogRecord>()
  const ids = [...new Set(placeIds)].filter(Boolean)
  if (ids.length === 0) return out
  const { data, error } = await supabase
    .from("property_catalog")
    .select("place_id, neighborhood, location, location_keywords, zip, website_url, google_rating")
    .in("place_id", ids)
  // A lookup failure must never break the search — fall back to unenriched.
  if (error || !data) return out
  for (const r of data as Array<Record<string, unknown>>) {
    out.set(String(r.place_id), {
      neighborhood: (r.neighborhood as string) ?? null,
      location: (r.location as string) ?? null,
      locationKeywords: Array.isArray(r.location_keywords) ? (r.location_keywords as string[]) : [],
      zip: (r.zip as string) ?? null,
      websiteUrl: (r.website_url as string) ?? null,
      googleRating: r.google_rating == null ? null : Number(r.google_rating),
    })
  }
  return out
}

/** Returns copies enriched where a catalog record exists; others unchanged. */
export function enrichProperties(
  properties: ExplorerProperty[],
  catalog: Map<string, CatalogRecord>,
): ExplorerProperty[] {
  if (catalog.size === 0) return properties
  return properties.map((p) => {
    const c = catalog.get(p.placeId)
    return c
      ? { ...p, neighborhood: c.neighborhood, location: c.location, locationKeywords: c.locationKeywords, zip: c.zip, websiteUrl: c.websiteUrl, googleRating: c.googleRating }
      : p
  })
}
