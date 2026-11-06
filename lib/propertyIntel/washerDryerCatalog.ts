/**
 * PROPERTY-LEVEL washer/dryer — what property_catalog already records.
 *
 * SEPARATE FROM lib/leads/washerDryer.ts ON PURPOSE. That module is imported by the PUBLIC
 * client recommendation page for its pill; anything living beside it ships to every renter's
 * browser. These constants are Property Intelligence's own vocabulary and have no business
 * there, so they live here, where only the CRM editor and its API route import them.
 *
 * A DIFFERENT vocabulary from the client-facing pair, and deliberately so. The catalog models
 * two independent facts, each with a qualifier the client-facing status cannot express:
 *
 *   washer_dryer_included     Yes 971 · Select Units 224 · No 13 · Specific Floor Plans 3
 *   washer_dryer_connections  Yes 302 · Select Units 61  · No 5
 *
 * "Select Units" is exactly why the client-facing status is confirmed per client rather than
 * read from here: a property-level Yes is not a promise about the floor plan one client would
 * lease. These options exist so the editor can RECORD what was verified about the property;
 * nothing maps them onto a client's card automatically.
 */

/**
 * The stored vocabulary for property_catalog.washer_dryer_included. Verbatim — these strings
 * are the values already in the column, so an edit never orphans an existing row.
 *
 * MENU ORDER, not precedence: the answers a locator actually records lead, and "Not Verified"
 * sits at the end because it is the state they are leaving rather than one they choose. It is
 * still the SELECTED option for an unverified field — a <select> matches its value wherever
 * that option appears in the list, so last in the menu and current in the box are compatible.
 */
export const CATALOG_WD_INCLUDED_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
  { value: "Select Units", label: "Select Units" },
  { value: "Specific Floor Plans", label: "Specific Floor Plans" },
  { value: "", label: "Not Verified" },
] as const

/** The stored vocabulary for property_catalog.washer_dryer_connections. Same menu order; it has
 *  no "Specific Floor Plans" because the column has never held one. */
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
import { WASHER_DRYER_LABEL, type WasherDryerStatus } from "@/lib/leads/washerDryer"

/** The property-level pair, as recorded. Either side may be null. */
export type CatalogWasherDryer = { included: string | null; connections: string | null }

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
 * the floor plan this client would lease, which is the question the catalog cannot answer. Only
 * when there is no confirmation does the property-level record speak, and then it says exactly
 * what is recorded — including the two qualified states, which are the whole reason the
 * confirmation exists.
 *
 * A catalog "No" renders NOTHING. The line is a standard detail, not a verdict, and "this
 * property has no washer/dryer" is a claim worth making only where someone has confirmed it.
 * Null everywhere → null here → no line at all.
 */
export function washerDryerCardLine(
  confirmed: WasherDryerStatus | null | undefined,
  catalog: CatalogWasherDryer | null | undefined,
): { text: string; confirmed: boolean } | null {
  if (confirmed) return { text: WASHER_DRYER_LABEL[confirmed], confirmed: true }
  const included = catalog?.included ?? null
  const connections = catalog?.connections ?? null
  if (included === "Yes") return { text: WASHER_DRYER_LABEL.included, confirmed: false }
  if (connections === "Yes") return { text: "Washer & Dryer Connections", confirmed: false }
  // Qualified states, said as the catalog says them — never flattened into a flat "Included".
  if (included === "Select Units" || included === "Specific Floor Plans") {
    return { text: `Washer & Dryer — ${included}`, confirmed: false }
  }
  if (connections === "Select Units") return { text: "Washer & Dryer Connections — Select Units", confirmed: false }
  return null
}
