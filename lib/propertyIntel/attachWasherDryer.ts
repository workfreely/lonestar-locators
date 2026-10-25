import { supabaseAdmin } from "@/lib/supabase/admin"
import { placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"

/**
 * CARRY THE TWO WASHER/DRYER COLUMNS ONTO ROWS THAT ALREADY CARRY THE REST OF THE CATALOG.
 *
 * The Recommended Property card shows a washer/dryer badge, and the status behind it is resolved
 * from property_catalog when no per-client confirmation exists. Those two columns were the only
 * catalog fields the card could not see.
 *
 * ── WHY NOT THE EXISTING RPC ────────────────────────────────────────────────────────────────
 * attachCatalogRatings reads through lb_property_catalog_by_ids, which returns a fixed list of
 * 27 columns and does not include these two. Adding them means altering that function — a
 * migration, which this change is explicitly not allowed to introduce. So this is a second,
 * narrow batched read of the same table for exactly two columns, run beside the existing one.
 *
 * ── WHAT IT READS, AND WITH WHAT ────────────────────────────────────────────────────────────
 * Two columns of shared property reference data, the same way every other catalog read in this
 * codebase works. It carries no client's details, writes nothing, and a failure yields nulls —
 * which render no badge, which is where the card already was.
 */

export type WasherDryerCatalogFields = {
  washer_dryer_included: string | null
  washer_dryer_connections: string | null
}

const BATCH = 200

export async function attachWasherDryer<T extends { property_url?: string | null }>(
  rows: T[],
): Promise<(T & WasherDryerCatalogFields)[]> {
  const blank = (r: T) => ({ ...r, washer_dryer_included: null, washer_dryer_connections: null })
  try {
    const placeIds = rows.map((r) => placeIdFromPropertyUrl(r.property_url))
    const ids = [...new Set(placeIds.filter((v): v is string => !!v))]
    if (ids.length === 0) return rows.map(blank)

    const byId = new Map<string, WasherDryerCatalogFields>()
    for (let i = 0; i < ids.length; i += BATCH) {
      const { data, error } = await supabaseAdmin
        .from("property_catalog")
        .select("place_id, washer_dryer_included, washer_dryer_connections")
        .in("place_id", ids.slice(i, i + BATCH))
      // A failed batch is skipped, not fatal — the rows it covered simply keep their nulls.
      if (error || !data) continue
      for (const r of data as Array<Record<string, unknown>>) {
        byId.set(String(r.place_id), {
          washer_dryer_included: (r.washer_dryer_included as string) ?? null,
          washer_dryer_connections: (r.washer_dryer_connections as string) ?? null,
        })
      }
    }

    return rows.map((r, i) => {
      const pid = placeIds[i]
      const hit = pid ? byId.get(pid) : undefined
      return { ...r, ...(hit ?? { washer_dryer_included: null, washer_dryer_connections: null }) }
    })
  } catch {
    return rows.map(blank)
  }
}
