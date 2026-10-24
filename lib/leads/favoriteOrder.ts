/**
 * THE ORDER OF FAVORITE PROPERTIES.
 *
 *     sort_order ASC NULLS LAST, created_at ASC, id ASC
 *
 * The same rule as Recommended Properties, and deliberately the same FUNCTION — this module
 * re-exports that comparator rather than restating it. Two lists that order by the same rule
 * should not have two implementations of it: the second one is where the drift starts, and a
 * list the locator arranges must render identically everywhere it is read.
 *
 * What is NOT shared is the DATA. lead_favorites.sort_order and lead_recommendations.sort_order
 * are different columns on different tables, so a property can sit first in Favorites and fourth
 * in Recommended. The rule is common; the positions are independent.
 *
 * NULLS LAST is what made the column additive: a favorite that has never been dragged keeps
 * sort_order NULL and therefore its exact created_at position, so every existing list renders
 * unchanged until someone actually reorders it.
 *
 * THE TOP PICK IS NOT PART OF THIS. It lives on leads.top_pick_favorite_id as a pointer to one
 * favorite, not a position in a list, so ordering cannot move it and reordering cannot change it.
 */
import { compareRecommendations, type OrderableRecommendation } from "./recommendationOrder"

/** A favorite needs exactly what a recommendation needs to be ordered. */
export type OrderableFavorite = OrderableRecommendation

export const compareFavorites = compareRecommendations

/** Stable, non-mutating sort — the caller's array is never reordered in place. */
export function sortFavorites<T extends OrderableFavorite>(rows: readonly T[]): T[] {
  return [...rows].sort(compareFavorites)
}
