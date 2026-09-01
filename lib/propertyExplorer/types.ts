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
  /** The property's OWN website (not the Google Maps link above). Optional and
   *  nullable: absent on Google Places results today — no source populates it yet
   *  and this checkpoint adds no request to fetch it — so the card's "Visit
   *  Website" link stays hidden until a real value arrives from an existing
   *  source (e.g. a future property_catalog column). Never invented. */
  websiteUrl?: string | null
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

  // ── Structured geography from Property Intelligence (property_catalog) ──────
  // Attached by placeId when a catalog record exists; ABSENT for plain Google
  // Places results, which keep working exactly as before. ZIP is carried through
  // the data contract but is NOT used for matching in this checkpoint.
  /** Specific locator search area, when catalogued. */
  neighborhood?: string | null
  /** Broad side of town, when catalogued. */
  location?: string | null
  /** Up to 3 locator search keywords, when catalogued. */
  locationKeywords?: string[]
  /** ZIP from the catalog. Carried, not yet matched. */
  zip?: string | null
  /** Google Places star rating (0.0–5.0), from property_catalog.google_rating by
   *  Place ID. Real and verified, never fabricated; ABSENT when the catalog has
   *  none, so the card omits it. Display-only — never affects ranking or search. */
  googleRating?: number | null

  // ── Future-ready display fields ─────────────────────────────────────────────
  // ADDITIVE and OPTIONAL: absent on every Google Places result today, so nothing
  // that already builds an ExplorerProperty changes. Nothing populates these in
  // this checkpoint — no new data source, no fetch. The card renders each ONLY
  // when a real value is present, and omits it entirely otherwise.
  /** A real client-fit percentage (0–100) from the future client-fit engine.
   *  NEVER inferred from the location-fit tier or Beast Suggestion state. */
  matchScore?: number | null
  /** Locator commission, when known. Structured so it can later carry a percent
   *  and/or flat/bonus dollars without committing to one display format now. */
  commission?: PropertyCommission | null
  /** A current concession/special (e.g. "1 month free"), when known. */
  currentSpecial?: string | null
}

/**
 * Locator commission for a property. Every field is optional so a source can
 * express commission however it actually has it — a percentage, a flat payout, a
 * bonus, or a ready-made label — without forcing a single shape prematurely.
 */
export type PropertyCommission = {
  /** Commission as a percentage (e.g. 100 = one month's rent). */
  percent?: number | null
  /** Flat dollar payout. */
  flat?: number | null
  /** Additional bonus dollars on top of percent/flat. */
  bonus?: number | null
  /** A pre-formatted locator-facing label, used verbatim when the source has one. */
  label?: string | null
}

/**
 * Display-only: drop a trailing country from a formatted address (Google appends
 * ", USA"). Returns a NEW string — the stored address, Places result and any DB
 * value are never mutated. Only the exact trailing country token is removed.
 */
export function displayAddress(address: string | null | undefined): string {
  return (address ?? "").replace(/,\s*USA\s*$/i, "")
}

/**
 * Display-only: a concise locator-facing commission string, or null when there is
 * nothing real to show. A ready `label` wins; otherwise percent/flat/bonus are
 * joined compactly. Never fabricates a value.
 */
export function formatCommission(c: PropertyCommission | null | undefined): string | null {
  if (!c) return null
  if (c.label && c.label.trim()) return c.label.trim()
  const parts: string[] = []
  if (c.percent != null) parts.push(`${c.percent}%`)
  if (c.flat != null) parts.push(`$${c.flat.toLocaleString()}`)
  if (c.bonus != null) parts.push(`+$${c.bonus.toLocaleString()} bonus`)
  return parts.length ? parts.join(" ") : null
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
    // Real Google rating (0.0–5.0) when catalogued, else null — carried so the
    // Companion Current Property card can show the same rating as the CRM card.
    // Never fabricated; the receiver omits the rating when null.
    googleRating: p.googleRating ?? null,
  }
}

/** Canonical Google Maps URL for a place. Documented, stable, not fabricated. */
export function placeUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
}
