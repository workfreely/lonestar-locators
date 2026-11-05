// Quick Match — writing a draft into the EXISTING Recommended Properties collection.
//
// There is no second table and no parallel list. A Quick Match result becomes ordinary
// `lead_recommendations` rows, which is why it shows up in the Client Workspace, in the Beast
// Companion and in the share flow with no further wiring: one dataset, the interfaces it already
// has.
//
// ── THE FOUR RULES THIS FILE ENFORCES ───────────────────────────────────────────────────────
// 1. A HAND-PICKED ROW IS NEVER TOUCHED. Every delete is scoped to
//    `origin = 'quick_match' and reviewed_at is null`. A row the agent added (origin NULL for
//    everything that existed before this feature, or 'agent') is outside every statement here.
// 2. A ROW THE AGENT HAS REVIEWED IS NEVER TOUCHED EITHER. `reviewed_at` is what makes a safe
//    refresh possible: without it a refresh cannot tell its own previous output from the
//    agent's deliberate keeps, so it would either destroy their work or never be able to
//    replace anything.
// 3. A PROPERTY IS NEVER DUPLICATED. The insert is an upsert on the database's own unique index
//    (lead_id, canonical_property_key) with ignoreDuplicates — so a property the agent already
//    recommended keeps THEIR row, with their reasons and their arrangement, and Quick Match
//    silently stands down on it.
// 4. SIX, AT MOST. The engine caps its list; this file writes what it is given and nothing more.
//
// ── WHY sort_order IS LEFT NULL ─────────────────────────────────────────────────────────────
// The canonical order is `sort_order asc nulls last, created_at, id`. Leaving it NULL puts a
// generated row AFTER every row the agent has arranged, and after older unarranged ones, which
// is where a draft belongs. Writing a number would renumber the agent's list.
//
// ── WHY THE SCREENING DETAIL IS A COLUMN AND NOT `reasons` ──────────────────────────────────
// `lead_recommendations.reasons` is legacy, and the CLIENT-FACING reasons come from
// lead_property_reasons (see lb_create_client_share). Screening findings must never be in line
// to reach a renter's page — "evictions accepted only if the balance is paid off" is internal
// locator intelligence about a property, and some of it is about the client themself. So it goes
// in `screening`, a column both share functions are blind to because they name their columns.
import type { SupabaseClient } from "@supabase/supabase-js"
import { placeUrl } from "@/lib/propertyExplorer/types"
import type { Recommendation } from "./ranking"
import type { DisplayTier } from "./types"

/** The agent-facing screening record stored on the row. Never read by any client-facing path. */
export type StoredScreening = {
  tier: DisplayTier
  reasons: string[]
  unverified: string[]
  conflicts: string[]
  conditions: string[]
  /**
   * Does the property state ANY requirement bearing on this client's situation?
   *
   * Stored rather than inferred from the tier, because a row with nothing on record wears the
   * Needs Verification label and must still be distinguishable from one whose policies are
   * recorded and merely incomplete. The chip's detail leads with this.
   */
  policyOnRecord: boolean
  /** Where it sits relative to what the client asked for, in the agent's words. */
  geography: string | null
  /** When the draft was computed, so a stale one is recognisable. */
  computedAt: string
  /** The collection it was drawn from. */
  collection: string
}

export const QUICK_MATCH_ORIGIN = "quick_match"

export type PersistResult = {
  inserted: number
  /** Rows skipped because the agent already had that property. */
  alreadyPresent: number
  /** Unreviewed Quick Match rows cleared before the write (a refresh only). */
  replaced: number
  error: string | null
}

/** One recommendation → the row shape lead_recommendations takes. */
export function toRecommendationRow(
  leadId: number | string,
  r: Recommendation,
  collection: string,
  computedAt: string,
): Record<string, unknown> {
  const screening: StoredScreening = {
    tier: r.tier,
    policyOnRecord: r.policyOnRecord,
    geography: r.geo.reason,
    reasons: r.reasons,
    unverified: r.unverified,
    conflicts: r.conflicts,
    conditions: r.conditions,
    computedAt,
    collection,
  }
  return {
    lead_id: leadId,
    property_name: r.property.propertyName ?? r.property.placeId,
    // The canonical identity carrier. canonical_property_key is GENERATED from this as
    // 'pid:<place id>', which is what makes the dedupe index and the read-side catalog
    // enrichment (rating, website, image, special) work with no extra columns.
    property_url: placeUrl(r.property.placeId),
    property_address: r.property.address ?? null,
    // NULL on purpose: a place_id row resolves its image from property_catalog read-side, and
    // the CRM's own add path nulls it for exactly the same reason. Copying a thumbnail here
    // would freeze an image we do not hold verified.
    property_image_url: null,
    origin: QUICK_MATCH_ORIGIN,
    screening,
  }
}

/**
 * Write a Quick Match draft for one client.
 *
 * `mode: "initial"` is the automatic first run: it adds rows and clears nothing, so it cannot
 * disturb anything already in the section. `mode: "refresh"` is an explicit agent action: it
 * first clears the Quick Match rows IT owns and the agent has not reviewed, then writes the new
 * draft.
 *
 * Takes the caller's own Supabase client, never the service role: the insert runs under the
 * agent's session so `set_workspace_ownership` stamps the right workspace and RLS applies.
 */
export async function persistQuickMatch(
  supabase: SupabaseClient,
  args: {
    leadId: number | string
    recommendations: Recommendation[]
    collection: string
    mode: "initial" | "refresh"
    computedAt?: string
  },
): Promise<PersistResult> {
  const { leadId, recommendations, collection, mode } = args
  const computedAt = args.computedAt ?? new Date().toISOString()
  let replaced = 0

  if (mode === "refresh") {
    // SCOPED THREE WAYS: this lead, our own origin, and not reviewed. A hand-picked row has a
    // different origin and a kept row has a reviewed_at, so neither is in range.
    const { data: cleared, error: delErr } = await supabase
      .from("lead_recommendations")
      .delete()
      .eq("lead_id", leadId)
      .eq("origin", QUICK_MATCH_ORIGIN)
      .is("reviewed_at", null)
      .select("id")
    if (delErr) return { inserted: 0, alreadyPresent: 0, replaced: 0, error: delErr.message }
    replaced = (cleared ?? []).length
  }

  if (recommendations.length === 0) {
    return { inserted: 0, alreadyPresent: 0, replaced, error: null }
  }

  const rows = recommendations.map((r) => toRecommendationRow(leadId, r, collection, computedAt))
  const { data, error } = await supabase
    .from("lead_recommendations")
    .upsert(rows, { onConflict: "lead_id,canonical_property_key", ignoreDuplicates: true })
    .select("id")
  if (error) return { inserted: 0, alreadyPresent: 0, replaced, error: error.message }

  const inserted = (data ?? []).length
  return { inserted, alreadyPresent: rows.length - inserted, replaced, error: null }
}

/**
 * Stamp the run on the lead, so the automatic pass happens ONCE.
 *
 * This is what stops a property the agent deliberately removed from reappearing the next time
 * they open the client. After the stamp, only an explicit refresh re-runs the draft.
 */
export async function markQuickMatchRun(
  supabase: SupabaseClient,
  leadId: number | string,
  at?: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("leads")
    .update({ quick_match_at: at ?? new Date().toISOString() })
    .eq("id", leadId)
  return error ? error.message : null
}
