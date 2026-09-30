import { supabase } from "@/lib/supabase/client"

// The canonical client-property reasons layer.
//
// "Why I chose this for you" belongs to the (client, property) RELATIONSHIP, not to
// the Favorites or Recommendations section that happens to be showing it. Both
// collections read and write the same lead_property_reasons row, so:
//
//   • an edit in Favorites is immediately the edit in Recommendations (same row)
//   • a property may sit in both collections at once with no divergence
//   • removing it from either collection does not erase the reasons
//   • re-adding it later restores them
//   • lead_id is half the identity, so reasons can never leak between clients
//
// Before this, reasons lived on lead_recommendations.reasons — and every move
// between collections HARD-DELETES the source row, so moving a property to
// Favorites destroyed its reasons and Favorites had nowhere to store them at all.

/** 'pid:<google place id>' — present on 100% of rows in BOTH collections. */
export type PropertyKey = string

export type PropertyReasonsRow = {
  lead_id: number | string
  canonical_property_key: PropertyKey
  reasons: string[]
  commute_minutes: number | null
  commute_anchor_place_id: string | null
}

/** Stable map key. Never just the property — the client is half the identity. */
export function pairKey(leadId: number | string, propertyKey: PropertyKey | null | undefined): string {
  return `${leadId}|${propertyKey ?? ""}`
}

export type ReasonsMap = Map<string, PropertyReasonsRow>

/** Every canonical row for one client, as a map both collections can read. */
export async function loadReasonsForLead(leadId: number | string): Promise<ReasonsMap> {
  const map: ReasonsMap = new Map()
  const { data, error } = await supabase
    .from("lead_property_reasons")
    .select("lead_id, canonical_property_key, reasons, commute_minutes, commute_anchor_place_id")
    .eq("lead_id", leadId)
  if (error) {
    console.error("[property-reasons] load failed:", error.message)
    return map
  }
  for (const row of (data ?? []) as PropertyReasonsRow[]) {
    map.set(pairKey(row.lead_id, row.canonical_property_key), {
      ...row,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
    })
  }
  return map
}

/** Reasons for one pair, or [] when the pair has none yet. */
export function reasonsFor(map: ReasonsMap, leadId: number | string, propertyKey: PropertyKey | null | undefined): string[] {
  return map.get(pairKey(leadId, propertyKey))?.reasons ?? []
}

/**
 * Write the reasons for ONE client-property pair.
 *
 * Upsert on the (lead_id, canonical_property_key) unique index, so the first edit
 * from EITHER collection creates the row and every later edit from EITHER updates
 * the same one. There is deliberately no "which collection am I in" parameter — the
 * section doing the editing is irrelevant to where the value lives.
 *
 * Saving an empty array is valid: the client page hides the section entirely, and
 * the row is kept so any commute cache on it survives.
 */
export async function saveReasons(
  leadId: number | string,
  propertyKey: PropertyKey | null | undefined,
  reasons: string[],
): Promise<boolean> {
  if (!propertyKey) {
    // Without the canonical key there is no client-property identity to write to.
    // Refusing beats writing a row that neither collection could ever find again.
    console.error("[property-reasons] refusing to save: no canonical_property_key")
    return false
  }
  const { error } = await supabase
    .from("lead_property_reasons")
    .upsert(
      { lead_id: leadId, canonical_property_key: propertyKey, reasons, updated_at: new Date().toISOString() },
      { onConflict: "lead_id,canonical_property_key" },
    )
  if (error) {
    console.error("[property-reasons] save failed:", error.message)
    return false
  }
  return true
}
