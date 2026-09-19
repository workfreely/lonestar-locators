// Recommendation ↔ Favorite — the two states of ONE progression for a client's
// property. A property must never occupy both at once, so every transition is a MOVE
// (insert into the destination, then delete the source) rather than an add.
//
// This module is the PURE decision layer: identity, duplicate resolution, and the
// safety guard for moving a Favorite backwards. It performs no I/O so both the CRM
// mutation handler and the Companion's row controls can share one set of rules, and
// so the rules are unit-testable without a database.

import { isClientFavorite } from "@/lib/leads/favoriteOrigin"

/** The stable identity of a saved property inside one client's collections. The SAD
 *  ViewProperty URL embeds the propertyID, so it is the same key both tables dedupe on. */
export function propertyKey(row: { property_url?: string | null } | null | undefined): string {
  return String(row?.property_url ?? "").trim()
}

function sameLead(row: { lead_id?: unknown }, leadId: unknown): boolean {
  return String(row?.lead_id ?? "") === String(leadId ?? "")
}

/**
 * Legacy duplicates (a property saved to BOTH tables before the states were made
 * mutually exclusive) resolve VISUALLY in favour of Favorites — the later, stronger
 * stage — so the Companion never renders the same property twice.
 *
 * Nothing is deleted here. The stray recommendation row stays untouched until the next
 * deliberate move resolves it through the normal path.
 */
export function visibleRecommendations<T extends { lead_id?: unknown; property_url?: string | null }>(
  recommendations: T[],
  favorites: { lead_id?: unknown; property_url?: string | null; origin?: string | null }[],
  leadId: unknown,
): T[] {
  // Only GENUINE Client Favorites suppress a matching Recommendation. An application-
  // only identity row (origin='application') is a hidden workflow anchor, not a
  // favorite, so it must NOT hide a real Recommendation of the same property.
  const favouredKeys = new Set(
    (favorites || []).filter((f) => sameLead(f, leadId) && isClientFavorite(f)).map(propertyKey).filter(Boolean),
  )
  return (recommendations || []).filter((r) => {
    const key = propertyKey(r)
    return !key || !favouredKeys.has(key)
  })
}

/** Does this client's collection already hold this property? */
export function alreadyInCollection(
  collection: { lead_id?: unknown; property_url?: string | null }[],
  leadId: unknown,
  url: string,
): boolean {
  const key = String(url ?? "").trim()
  if (!key) return false
  return (collection || []).some((r) => sameLead(r, leadId) && propertyKey(r) === key)
}

export type MoveBlock = {
  /** Short reason shown to the agent. Null when the move is allowed. */
  reason: string | null
}

/**
 * Favorite → Recommendation safety. Removing a `lead_favorites` row is NOT inert: other
 * records point at that row id, and letting the move proceed would silently break them —
 *   • `leads.top_pick_favorite_id` would dangle (invoice + guest-card flows read it)
 *   • `lead_tours.property_id` is `on delete set null`, so a scheduled tour would
 *     quietly lose its property
 *   • `lead_next_actions.property_id` scopes guest cards and tour follow-ups to a
 *     favorite, and a workflow `tour_follow_up` is required to carry one
 *
 * So the move is BLOCKED (never silently nulled) whenever the favorite still carries a
 * downstream dependency. Recommendation → Favorite has no such dependents and is
 * always allowed.
 */
export function favoriteMoveBlock(input: {
  favorite: { id?: unknown } | null | undefined
  lead: { top_pick_favorite_id?: unknown } | null | undefined
  tours?: { property_id?: unknown; status?: string | null }[]
  nextActions?: { property_id?: unknown; completed?: boolean; status?: string | null }[]
}): MoveBlock {
  const favId = String(input.favorite?.id ?? "")
  if (!favId) return { reason: "This property can't be identified." }

  if (String(input.lead?.top_pick_favorite_id ?? "") === favId) {
    return { reason: "It's this client's Top Pick." }
  }

  const linkedTour = (input.tours || []).some(
    (t) => String(t?.property_id ?? "") === favId && String(t?.status ?? "") !== "canceled",
  )
  if (linkedTour) return { reason: "A tour is scheduled for it." }

  const openAction = (input.nextActions || []).some(
    (a) =>
      String(a?.property_id ?? "") === favId &&
      a?.completed !== true &&
      String(a?.status ?? "") !== "completed",
  )
  if (openAction) return { reason: "It has an open action." }

  return { reason: null }
}

/**
 * Canonical collection policy for the "+ Recommend"/"+ Favorite" verbs.
 *
 * Recommendations and Favorites are INDEPENDENT collections: the same property may
 * exist in BOTH for one lead. Therefore the "+ Recommend" action (`add-recommendation`)
 * is NON-DESTRUCTIVE — it creates the recommendation (or no-ops if one already exists)
 * and NEVER moves, converts, deletes, or otherwise mutates an existing Favorite (and so
 * never touches the favorite's live references: Guest Card actions, tours, Top Pick,
 * application state).
 *
 * The explicit relocation verbs keep their prior semantics: `move-to-recommendation`
 * (the × on a Favorite) still runs the favoriteMoveBlock/convert-or-move path, and the
 * favorite-dest verbs (`add-favorite` / `move-to-favorite`) still relocate a matching
 * recommendation. Returns true when the verb is allowed to mutate the opposite
 * (source) collection; false ONLY for `add-recommendation`.
 */
export function recommendationAddMutatesOpposite(verb: string): boolean {
  return verb !== "add-recommendation"
}
