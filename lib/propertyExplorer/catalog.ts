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
  /** Second-ranked verified first-party photo (property_catalog.property_image_url_backup);
   *  the card tries this if the primary fails to load, before the neutral fallback. */
  imageUrlBackup: string | null
  /** Verified current special, VERBATIM master text (property_catalog.current_special).
   *  Cards normalize it to a short badge via normalizeShortSpecial; never shown raw. */
  currentSpecial: string | null
  /** Locator commission, verbatim trusted-master text (never web-inferred). Shown only
   *  on locator surfaces (Map + Companion), NEVER on the client /r page. */
  sendCommission: string | null
  escortCommission: string | null
  bonusFlat: string | null
  /** Google review count (property_catalog.google_review_count); display-only, null until populated. */
  googleReviewCount: number | null
  /** Record verification time (property_catalog.verified_at) — the special-freshness gate. */
  verifiedAt: string | null
  // Tour Assist URLs (property_catalog) for the FUTURE Schedule Tour autofill —
  // carried through the read path so the workflow can use them later. Market-agnostic
  // (per place_id); no UI reads them yet. Null until populated.
  tourUrl: string | null
  applyUrl: string | null
  availabilityUrl: string | null
  /**
   * Owner-entered bedroom starting rents (property_catalog). The SHARED record — Social
   * Beast's Property Research form writes the same columns, so a price entered in either
   * product is read by both with no synchronisation.
   *
   * Null = not entered. The Recommended Properties card derives "2BR from $1,400" from
   * these at RENDER time (lib/leads/bedroomPricing), so a corrected price is correct
   * everywhere on the next read and nothing is cached onto a client-property pair.
   */
  onebrStartingRent: number | null
  twobrStartingRent: number | null
  threebrStartingRent: number | null
  /** When the rents above were last checked. Display/staleness only; never gates rendering. */
  pricingLastVerified: string | null
}

// Catalog access goes through the ID-scoped SECURITY DEFINER RPC
// lb_property_catalog_by_ids (never a direct table SELECT — the broad
// authenticated read policy was removed to close bulk enumeration). The RPC
// hard-rejects >60 unique ids, which is the ceiling of the only legitimate
// browser Map operation; larger LEGITIMATE server sets (the /admin/leads
// workspace enrichment) are chunked here into ≤60-id batches so they still
// resolve without any privileged higher-cap path.
const CATALOG_ID_BATCH = 60

export async function fetchCatalog(
  placeIds: string[],
  supabase: SupabaseClient,
): Promise<Map<string, CatalogRecord>> {
  const out = new Map<string, CatalogRecord>()
  const ids = [...new Set(placeIds)].filter(Boolean)
  if (ids.length === 0) return out

  const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
  // Postgres `numeric` arrives over PostgREST as a string ("1400.00"), so Number() is
  // required; anything non-finite is treated as "not entered" rather than surfacing NaN.
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  // One RPC call per ≤60-id batch; a failure of any batch is swallowed (the
  // search/enrichment must never break — unenriched rows keep their behavior).
  for (let i = 0; i < ids.length; i += CATALOG_ID_BATCH) {
    const batch = ids.slice(i, i + CATALOG_ID_BATCH)
    const { data, error } = await supabase.rpc("lb_property_catalog_by_ids", {
      p_place_ids: batch,
    })
    if (error || !data) continue
    for (const r of data as Array<Record<string, unknown>>) {
      out.set(String(r.place_id), {
        neighborhood: (r.neighborhood as string) ?? null,
        location: (r.location as string) ?? null,
        locationKeywords: Array.isArray(r.location_keywords) ? (r.location_keywords as string[]) : [],
        zip: (r.zip as string) ?? null,
        websiteUrl: (r.website_url as string) ?? null,
        googleRating: r.google_rating == null ? null : Number(r.google_rating),
        imageUrl: s(r.property_image_url),
        imageUrlBackup: s(r.property_image_url_backup),
        currentSpecial: s(r.current_special),
        sendCommission: s(r.send_commission),
        escortCommission: s(r.escort_commission),
        bonusFlat: s(r.bonus_flat),
        googleReviewCount: r.google_review_count == null ? null : Number(r.google_review_count),
        verifiedAt: s(r.verified_at),
        tourUrl: s(r.tour_url),
        applyUrl: s(r.apply_url),
        availabilityUrl: s(r.availability_url),
        // numeric → number. A non-finite or absent value becomes null rather than NaN, so
        // the pricing layer's "not entered" branch is the one that fires.
        onebrStartingRent: num(r.onebr_starting_rent),
        twobrStartingRent: num(r.twobr_starting_rent),
        threebrStartingRent: num(r.threebr_starting_rent),
        pricingLastVerified: s(r.pricing_last_verified),
      })
    }
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
): Promise<(T & { google_rating: number | null; property_image_url: string | null; website_url: string | null; tour_url: string | null; apply_url: string | null; availability_url: string | null; current_special: string | null; send_commission: string | null; escort_commission: string | null; bonus_flat: string | null; verified_at: string | null; onebr_starting_rent: number | null; twobr_starting_rent: number | null; threebr_starting_rent: number | null; pricing_last_verified: string | null })[]> {
  const placeIds = rows.map((r) => placeIdFromPropertyUrl(r.property_url))
  const catalog = await fetchCatalog(
    placeIds.filter((v): v is string => !!v),
    supabase,
  )
  return rows.map((r, i) => {
    const pid = placeIds[i]
    const rec = pid ? catalog.get(pid) : undefined
    // Image resolution mirrors the rating: read-side from property_catalog. A row's
    // OWN image (a pasted Favorite / external-site-detected one) takes precedence; otherwise
    // the catalog's selected image fills in. Null → PropertyThumb's building icon.
    const ownImage = typeof r.property_image_url === "string" && r.property_image_url ? r.property_image_url : null
    return {
      ...r,
      google_rating: rec?.googleRating ?? null,
      property_image_url: ownImage ?? rec?.imageUrl ?? null,
      // The real property website (property_catalog.website_url), read-side. The ONLY
      // URL a property-name/thumbnail link may open — never the placeUrl (Google Maps).
      website_url: rec?.websiteUrl ?? null,
      // Tour Assist URLs (property_catalog), read-side — carried for the FUTURE
      // Schedule Tour workflow. Not used by any UI yet; null until populated.
      tour_url: rec?.tourUrl ?? null,
      apply_url: rec?.applyUrl ?? null,
      availability_url: rec?.availabilityUrl ?? null,
      // Locator-facing canonical status fields (property_catalog), read-side — the
      // Recommended Property row renders the special (blue) + commission (green) pills.
      // Verbatim master text; the row normalizes/classifies them for display.
      current_special: rec?.currentSpecial ?? null,
      send_commission: rec?.sendCommission ?? null,
      escort_commission: rec?.escortCommission ?? null,
      bonus_flat: rec?.bonusFlat ?? null,
      verified_at: rec?.verifiedAt ?? null,
      // Owner-entered bedroom pricing, read-side like every other catalog field. NEVER
      // stored on lead_recommendations / lead_favorites — property_catalog stays the single
      // source of truth, so a price correction is reflected without touching a lead row.
      onebr_starting_rent: rec?.onebrStartingRent ?? null,
      twobr_starting_rent: rec?.twobrStartingRent ?? null,
      threebr_starting_rent: rec?.threebrStartingRent ?? null,
      pricing_last_verified: rec?.pricingLastVerified ?? null,
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
      ? { ...p, neighborhood: c.neighborhood, location: c.location, locationKeywords: c.locationKeywords, zip: c.zip, websiteUrl: c.websiteUrl, googleRating: c.googleRating, imageUrl: c.imageUrl, imageUrlBackup: c.imageUrlBackup, currentSpecial: c.currentSpecial, sendCommission: c.sendCommission, escortCommission: c.escortCommission, bonusFlat: c.bonusFlat, googleReviewCount: c.googleReviewCount, verifiedAt: c.verifiedAt, tourUrl: c.tourUrl, applyUrl: c.applyUrl, availabilityUrl: c.availabilityUrl }
      : p
  })
}
