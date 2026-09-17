// Favorite provenance helpers — the ONE place that decides whether a lead_favorites
// row is a genuine Client Favorite or an application-only property-identity anchor.
//
// See migration 20260917000000_lead_favorites_origin.sql. `origin` is:
//   • null / "favorite"  → a genuine Client Favorite (shown in Favorite Properties).
//   • "application"       → a property-identity anchor for an Applied/guest-card
//                           workflow (hidden from Favorite Properties; still the
//                           target of every property_id FK).
//
// Pure + dependency-free so display filters, the Companion DTO, the Applied write
// path, and unit tests can all share exactly one rule.

export const FAVORITE_ORIGIN = {
  favorite: "favorite",
  application: "application",
} as const

export type FavoriteOrigin = (typeof FAVORITE_ORIGIN)[keyof typeof FAVORITE_ORIGIN]

/** A genuine Client Favorite — shown in Favorite Properties. Legacy rows (origin
 *  null/undefined) count as genuine favorites, preserving pre-migration behavior. */
export function isClientFavorite(row: { origin?: string | null } | null | undefined): boolean {
  const o = row?.origin ?? null
  return o == null || o === FAVORITE_ORIGIN.favorite
}

/** An application-only property-identity anchor — hidden from Favorite Properties. */
export function isApplicationIdentity(row: { origin?: string | null } | null | undefined): boolean {
  return (row?.origin ?? null) === FAVORITE_ORIGIN.application
}
