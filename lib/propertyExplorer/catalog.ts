import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExplorerProperty } from "./types"
import { placeIdFromPropertyUrl } from "./types"

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
  /** Selected representative property image URL (property_catalog.property_image_url),
   *  when enriched. Display-only; drives the shared PropertyThumb, falls back to the
   *  building icon when null or broken. NEVER stored on lead rows — resolved here. */
  imageUrl: string | null
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
    .select("place_id, neighborhood, location, location_keywords, zip, website_url, google_rating, property_image_url")
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
      imageUrl: typeof r.property_image_url === "string" && r.property_image_url ? (r.property_image_url as string) : null,
    })
  }
  return out
}

/**
 * Attach `google_rating` (from property_catalog) to rows that carry a
 * `property_url`, resolving each row's Place ID from that URL. Option A: the
 * rating is NEVER stored on lead_recommendations/lead_favorites — property_catalog
 * stays the single source of truth, resolved read-side here. ONE batched catalog
 * query for the whole set (no N+1). A row whose URL yields no Place ID, or whose
 * Place ID has no catalog row, gets google_rating = null. Returns new row objects;
 * the source rows are untouched.
 */
export async function attachCatalogRatings<T extends { property_url?: string | null; property_image_url?: string | null }>(
  rows: T[],
  supabase: SupabaseClient,
): Promise<(T & { google_rating: number | null; property_image_url: string | null; website_url: string | null })[]> {
  const placeIds = rows.map((r) => placeIdFromPropertyUrl(r.property_url))
  const catalog = await fetchCatalog(
    placeIds.filter((v): v is string => !!v),
    supabase,
  )
  return rows.map((r, i) => {
    const pid = placeIds[i]
    const rec = pid ? catalog.get(pid) : undefined
    // Image resolution mirrors the rating: read-side from property_catalog. A row's
    // OWN image (a pasted Favorite / SAD-detected one) takes precedence; otherwise
    // the catalog's selected image fills in. Null → PropertyThumb's building icon.
    const ownImage = typeof r.property_image_url === "string" && r.property_image_url ? r.property_image_url : null
    return {
      ...r,
      google_rating: rec?.googleRating ?? null,
      property_image_url: ownImage ?? rec?.imageUrl ?? null,
      // The real property website (property_catalog.website_url), read-side. The ONLY
      // URL a property-name/thumbnail link may open — never the placeUrl (Google Maps).
      website_url: rec?.websiteUrl ?? null,
    }
  })
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
      ? { ...p, neighborhood: c.neighborhood, location: c.location, locationKeywords: c.locationKeywords, zip: c.zip, websiteUrl: c.websiteUrl, googleRating: c.googleRating, imageUrl: c.imageUrl }
      : p
  })
}
