// Guest Card objective aggregation — the canonical, schema-free derivation of the
// lead's OUTSTANDING Guest Card work for its GENUINE Client Favorites.
//
// The individual property-scoped email_guest_card actions remain the source of truth
// in the data model (one per property). This module only *reads* them to decide how
// the single Primary Next Action should present the objective:
//   • 1 outstanding  → "Send Guest Card · {Property}"
//   • 2+ outstanding → "Send Guest Cards · {N} properties"
// It recalculates from what actually remains, so completing cards collapses the
// aggregate 3 → 2 → 1 → none with no stored state.
//
// STRICT scope: only OPEN email_guest_card actions whose property_id is a GENUINE
// Client Favorite (isClientFavorite) are aggregated. Application-only identity rows
// (origin='application') and guest cards for non-Favorite properties are excluded, so
// this never pulls unrelated/stale work into the Favorite bulk workflow.

import { isClientFavorite } from "./favoriteOrigin"

export type GuestCardItem = {
  propertyId: number | string
  propertyName: string
  actionId: number | string
}

type ActionRow = {
  id?: number | string
  lead_id?: number | string
  action_key?: string | null
  title?: string | null
  property_id?: number | string | null
  property_name?: string | null
  completed?: boolean | null
  status?: string | null
}
type FavoriteRow = { id?: number | string; lead_id?: number | string; property_name?: string | null; origin?: string | null }

const isOpen = (a: ActionRow) =>
  a.completed !== true && String(a.status ?? "").toLowerCase() !== "completed" && String(a.status ?? "").toLowerCase() !== "canceled"

const isGuestCardAction = (a: ActionRow) =>
  String(a.action_key ?? "") === "email_guest_card" || String(a.title ?? "").trim().toLowerCase() === "email guest card"

/**
 * The lead's outstanding genuine-Favorite Guest Cards, one entry per property
 * (deduped by property_id), in the order encountered. Empty when none.
 */
export function outstandingFavoriteGuestCards(
  leadId: number | string,
  actions: ActionRow[],
  favorites: FavoriteRow[],
): GuestCardItem[] {
  const genuineFav = new Map<string, FavoriteRow>()
  for (const f of favorites ?? []) {
    if (String(f.lead_id ?? "") !== String(leadId)) continue
    if (!isClientFavorite(f)) continue // exclude origin='application' identity rows
    if (f.id != null) genuineFav.set(String(f.id), f)
  }
  const seen = new Set<string>()
  const out: GuestCardItem[] = []
  for (const a of actions ?? []) {
    if (String(a.lead_id ?? "") !== String(leadId)) continue
    if (!isGuestCardAction(a) || !isOpen(a)) continue
    const pid = String(a.property_id ?? "")
    if (!pid) continue
    const fav = genuineFav.get(pid)
    if (!fav) continue // property_id must be a GENUINE Client Favorite
    if (seen.has(pid)) continue
    seen.add(pid)
    out.push({
      propertyId: a.property_id as number | string,
      propertyName: (fav.property_name || a.property_name || "Property").toString(),
      actionId: a.id as number | string,
    })
  }
  return out
}

/** Display label for the outstanding Guest Card objective (null when none). */
export function guestCardObjectiveLabel(items: GuestCardItem[]): { title: string; detail: string } | null {
  if (!items || items.length === 0) return null
  if (items.length === 1) return { title: "Send Guest Card", detail: items[0].propertyName }
  return { title: "Send Guest Cards", detail: `${items.length} properties` }
}

/**
 * Is this ranked/primary action a genuine-Favorite Guest Card (so the surface should
 * present the aggregated objective instead of the single row)? Used by the display
 * surfaces to decide whether to swap in the aggregate label + bulk dispatch.
 */
export function isFavoriteGuestCardAction(
  action: ActionRow | null | undefined,
  leadId: number | string,
  favorites: FavoriteRow[],
): boolean {
  if (!action || !isGuestCardAction(action)) return false
  const pid = String(action.property_id ?? "")
  if (!pid) return false
  return (favorites ?? []).some(
    (f) => String(f.lead_id ?? "") === String(leadId) && String(f.id ?? "") === pid && isClientFavorite(f),
  )
}
