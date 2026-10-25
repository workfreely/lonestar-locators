import { deriveWasherDryer, shouldPersistDerived, type WasherDryerDerivation } from "@/lib/propertyIntel/washerDryerResolver"
import { asWasherDryerStatus, type WasherDryerStatus } from "@/lib/leads/washerDryer"

/**
 * FILL IN THE WASHER/DRYER THE CATALOG ALREADY KNOWS, just before a share is prepared.
 *
 * The client's badge reads lead_property_reasons.washer_dryer_status and nothing else — the
 * snapshot SQL deliberately never looks at property_catalog, because a property-level answer is
 * not a promise about one client's floor plan. That rule stands. What changes here is only that
 * a pair left EMPTY gets the catalog's answer when the catalog conclusively settles it, so a
 * locator is not asked to retype a fact Property Intelligence already verified.
 *
 * ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────────────────────
 *   • It never touches a pair that already has a status. A person's confirmation is final, and
 *     "already correct" is a reason to write NOTHING rather than to write the same value again.
 *   • It never derives from "Select Units", "Specific Floor Plans", or connections-without-
 *     included. Those are the cases a person still has to answer.
 *   • It never touches a snapshot. Rows already frozen into client_recommendation_share_items
 *     are immutable and are not read here.
 *
 * ── AUTHORIZATION ───────────────────────────────────────────────────────────────────────────
 * The set of pairs comes from the CALLER'S OWN RLS-filtered read of lead_recommendations, and
 * the write goes back through that same connection. A caller who is not an active member of the
 * lead's workspace reads zero rows and therefore writes zero rows — the database decides, not
 * this function. Only property_catalog is read with the service role, the way every other
 * catalog read in the codebase is; it is shared reference data and carries no client's details.
 *
 * ── RETRIES AND REUSE ───────────────────────────────────────────────────────────────────────
 * Preparing twice is safe: the second run sees the statuses the first one wrote, finds nothing
 * empty, and writes nothing. That idempotence is what keeps share REUSE working — the reuse
 * hash includes coalesce(washer_dryer_status,''), so a run that wrote nothing cannot change the
 * hash, and an unsent snapshot is still reused. The FIRST run on a lead with derivable
 * properties does change that hash, which is correct: the list's contents genuinely changed, so
 * a new snapshot is minted rather than an outdated one reused.
 */

/** The minimum each client needs to look like; keeps this testable without the Supabase types. */
type Queryable = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: unknown }>
      in: (col: string, vals: readonly string[]) => Promise<{ data: unknown[] | null; error: unknown }>
    }
    upsert: (rows: unknown[], opts: { onConflict: string }) => Promise<{ error: unknown }>
  }
}

export type WasherDryerConflict = {
  canonicalPropertyKey: string
  manual: WasherDryerStatus
  derived: WasherDryerStatus
  basis: string
}

export type BackfillResult = {
  /** Pairs that received a derived status. */
  filled: { canonicalPropertyKey: string; status: WasherDryerStatus; basis: string }[]
  /** Pairs where a stored confirmation and a conclusive derivation DISAGREE. Nothing was
   *  changed for these — they are reported so a person can look. */
  conflicts: WasherDryerConflict[]
  /** True when a write was actually issued. A false here means the reuse hash cannot have
   *  moved, which is what makes an unsent snapshot reusable on a retry. */
  wrote: boolean
}

const EMPTY: BackfillResult = { filled: [], conflicts: [], wrote: false }

/** 'pid:ChIJ…' → 'ChIJ…'. Both collections store the prefixed form. */
function placeIdOf(canonicalPropertyKey: string): string {
  return String(canonicalPropertyKey ?? "").replace(/^pid:/, "")
}

/**
 * The decision half, with no I/O — this is what the tests exercise.
 *
 * Given the pairs on a list, the statuses already stored, and what the catalog holds for each
 * property, work out which pairs should be written and which disagree.
 */
export function planWasherDryerBackfill(
  pairs: readonly { canonicalPropertyKey: string }[],
  storedByKey: ReadonlyMap<string, WasherDryerStatus | null>,
  catalogByPlaceId: ReadonlyMap<string, { included: unknown; connections: unknown }>,
): BackfillResult {
  const filled: BackfillResult["filled"] = []
  const conflicts: WasherDryerConflict[] = []
  const seen = new Set<string>()

  for (const p of pairs) {
    const key = String(p.canonicalPropertyKey ?? "")
    if (!key || seen.has(key)) continue // one verdict per pair, however many rows name it
    seen.add(key)

    const cat = catalogByPlaceId.get(placeIdOf(key))
    if (!cat) continue // no catalog row ⇒ nothing verified ⇒ nothing to reuse

    const manual = asWasherDryerStatus(storedByKey.get(key) ?? null)
    const derivation: WasherDryerDerivation = deriveWasherDryer(cat.included, cat.connections)

    if (manual) {
      // A PERSON'S ANSWER IS FINAL. Report a disagreement, change nothing.
      if (derivation.conclusive && derivation.status && derivation.status !== manual) {
        conflicts.push({ canonicalPropertyKey: key, manual, derived: derivation.status, basis: derivation.basis })
      }
      continue
    }
    if (shouldPersistDerived(manual, derivation)) {
      filled.push({ canonicalPropertyKey: key, status: derivation.status as WasherDryerStatus, basis: derivation.basis })
    }
  }

  return { filled, conflicts, wrote: false }
}

/**
 * Read what is needed, plan, and write only what is missing.
 *
 * Every failure is swallowed into "nothing to do". This runs immediately before a share is
 * prepared, and preparing the share is the thing the locator asked for — a catalog read that
 * times out must not cost them their list. The worst case is the status stays empty, which is
 * exactly where it was.
 */
export async function backfillDerivedWasherDryer(
  caller: Queryable,
  admin: Queryable,
  leadId: number,
): Promise<BackfillResult> {
  try {
    const recs = await caller.from("lead_recommendations").select("canonical_property_key").eq("lead_id", leadId)
    const pairs = ((recs.data ?? []) as { canonical_property_key?: unknown }[])
      .map((r) => ({ canonicalPropertyKey: String(r.canonical_property_key ?? "") }))
      .filter((p) => p.canonicalPropertyKey)
    if (recs.error || pairs.length === 0) return EMPTY

    const stored = await caller
      .from("lead_property_reasons")
      .select("canonical_property_key, washer_dryer_status")
      .eq("lead_id", leadId)
    const storedByKey = new Map<string, WasherDryerStatus | null>(
      ((stored.data ?? []) as { canonical_property_key?: unknown; washer_dryer_status?: unknown }[]).map((r) => [
        String(r.canonical_property_key ?? ""),
        asWasherDryerStatus(r.washer_dryer_status),
      ]),
    )

    const placeIds = [...new Set(pairs.map((p) => placeIdOf(p.canonicalPropertyKey)).filter(Boolean))]
    if (placeIds.length === 0) return EMPTY
    const cat = await admin
      .from("property_catalog")
      .select("place_id, washer_dryer_included, washer_dryer_connections")
      .in("place_id", placeIds)
    const catalogByPlaceId = new Map<string, { included: unknown; connections: unknown }>(
      ((cat.data ?? []) as { place_id?: unknown; washer_dryer_included?: unknown; washer_dryer_connections?: unknown }[]).map((r) => [
        String(r.place_id ?? ""),
        { included: r.washer_dryer_included, connections: r.washer_dryer_connections },
      ]),
    )

    const plan = planWasherDryerBackfill(pairs, storedByKey, catalogByPlaceId)
    if (plan.filled.length === 0) return plan // NO WRITE ⇒ the reuse hash cannot move

    const { error } = await caller.from("lead_property_reasons").upsert(
      plan.filled.map((f) => ({
        lead_id: leadId,
        canonical_property_key: f.canonicalPropertyKey,
        washer_dryer_status: f.status,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "lead_id,canonical_property_key" },
    )
    if (error) return { ...plan, filled: [], wrote: false }
    return { ...plan, wrote: true }
  } catch {
    return EMPTY
  }
}
