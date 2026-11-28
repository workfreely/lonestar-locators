/**
 * PROPERTY-LEVEL washer/dryer — the read path, and the legacy columns it still understands.
 *
 * ── THE VOCABULARY MOVED OUT OF HERE ────────────────────────────────────────────────────────
 * This module used to define a SECOND vocabulary — washer_dryer_included (Yes · No · Select
 * Units · Specific Floor Plans) and washer_dryer_connections (Yes · No · Select Units) — kept
 * deliberately apart from the client-facing pair in lib/leads/washerDryer.ts. The two could not
 * talk to each other: a status confirmed for a client left the map's Edit Property panel
 * reading "Not verified".
 *
 * There is now ONE vocabulary, in lib/leads/washerDryer.ts, stored in
 * property_catalog.washer_dryer_status as well as on the pair. The map, the reasons editor, the
 * Lead Board card and the client list all read and write that.
 *
 * ── THE TWO LEGACY COLUMNS ARE STILL READ ───────────────────────────────────────────────────
 * They were not collapsed, because 107 properties hold a distinct fact in each. The constants
 * below describe what those columns contain so the card can still fall back to them for a row
 * whose unified status was never derived or set, and so a migration or a repair script can map
 * them. Nothing WRITES them any more: both editors now write the unified column.
 */

/**
 * The stored vocabulary for property_catalog.washer_dryer_included. Verbatim — these strings
 * are the values already in the column.
 *
 * NO LONGER A MENU. It described one of the two dropdowns the map used to render; both are now
 * a single control over the shared vocabulary. What is left is a description of what the column
 * CONTAINS, which the validator and the legacy fallback still need. The empty entry is kept so
 * the set round-trips an unset value rather than rejecting it.
 */
export const CATALOG_WD_INCLUDED_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
  { value: "Select Units", label: "Select Units" },
  { value: "Specific Floor Plans", label: "Specific Floor Plans" },
  { value: "", label: "Not Verified" },
] as const

/** The stored vocabulary for property_catalog.washer_dryer_connections — likewise a description
 *  of the column, not a menu. It has no "Specific Floor Plans": the column never held one. */
export const CATALOG_WD_CONNECTIONS_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
  { value: "Select Units", label: "Select Units" },
  { value: "", label: "Not Verified" },
] as const

const INCLUDED = new Set(CATALOG_WD_INCLUDED_OPTIONS.map((o) => o.value).filter(Boolean))
const CONNECTIONS = new Set(CATALOG_WD_CONNECTIONS_OPTIONS.map((o) => o.value).filter(Boolean))

/** Exactly one of the stored values, or null. Fails closed, like the client-facing validator. */
export function asCatalogWasherDryerIncluded(v: unknown): string | null {
  return typeof v === "string" && INCLUDED.has(v as never) ? v : null
}
export function asCatalogWasherDryerConnections(v: unknown): string | null {
  return typeof v === "string" && CONNECTIONS.has(v as never) ? v : null
}

// ── THE READ PATH, AND WHAT IT IS ALLOWED TO SAY ────────────────────────────────────────────
// One ID-scoped batch through lb_property_washer_dryer_by_ids — the same shape and the same
// 60-id cap as lb_property_catalog_by_ids, which this deliberately does NOT widen. The caller
// chunks; the function rejects an over-cap request rather than truncating it.
//
// DEGRADES HONESTLY. Until the function exists in a database, the lookup returns an empty map
// rather than throwing, so the card renders exactly as it does today instead of breaking. An
// empty map is "nothing is known", which renders no line — never "no washer/dryer".
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  WASHER_DRYER_LABEL, asWasherDryerStatus, deriveWasherDryerStatus, type WasherDryerStatus,
} from "@/lib/leads/washerDryer"

/**
 * What the catalog holds for one property: the unified status, plus the two legacy columns the
 * fallback still understands. Any of the three may be null.
 */
export type CatalogWasherDryer = {
  status: WasherDryerStatus | null
  included: string | null
  connections: string | null
}

const CATALOG_WD_BATCH = 60

export async function loadCatalogWasherDryer(
  supabase: SupabaseClient,
  placeIds: string[],
): Promise<Map<string, CatalogWasherDryer>> {
  const out = new Map<string, CatalogWasherDryer>()
  const ids = [...new Set(placeIds)].filter(Boolean)
  for (let i = 0; i < ids.length; i += CATALOG_WD_BATCH) {
    const { data, error } = await supabase.rpc("lb_property_washer_dryer_by_ids", {
      p_place_ids: ids.slice(i, i + CATALOG_WD_BATCH),
    })
    // A missing function, a permission error, anything: this is an amenity line, and a failure
    // here must never cost the locator the rest of the card.
    if (error || !data) continue
    for (const r of data as Array<Record<string, unknown>>) {
      out.set(String(r.place_id), {
        // A database that predates the unified column returns undefined here, which validates
        // to null and leaves the legacy fallback below in charge — the same honest degradation
        // as a missing function.
        status: asWasherDryerStatus(r.washer_dryer_status),
        included: asCatalogWasherDryerIncluded(r.washer_dryer_included),
        connections: asCatalogWasherDryerConnections(r.washer_dryer_connections),
      })
    }
  }
  return out
}

/**
 * THE ONE LINE THE CARD SHOWS, and the precedence behind it.
 *
 * A status CONFIRMED for this client and this property outranks everything: a person checked
 * the floor plan this client would lease, which is the question a property-level answer cannot
 * settle. Only when there is no confirmation does the property speak.
 *
 * Three sources, in order:
 *   1. the pair's confirmed status
 *   2. property_catalog.washer_dryer_status — the unified property-level answer
 *   3. the two legacy columns, derived — for a row whose status was never set
 *
 * (3) exists so this degrades honestly against a database where the unified column is missing
 * or a property was added after the one-time derivation. It applies the same precedence the
 * derivation does, so a card's wording does not change when a row is finally stamped.
 *
 * Null everywhere → null here → no line at all. Silence is never mistaken for "no washer".
 */
export function washerDryerCardLine(
  confirmed: WasherDryerStatus | null | undefined,
  catalog: CatalogWasherDryer | null | undefined,
): { text: string; confirmed: boolean } | null {
  if (confirmed) return { text: WASHER_DRYER_LABEL[confirmed], confirmed: true }
  const stored = catalog?.status
    ?? deriveWasherDryerStatus(catalog?.included ?? null, catalog?.connections ?? null)
  return stored ? { text: WASHER_DRYER_LABEL[stored], confirmed: false } : null
}
