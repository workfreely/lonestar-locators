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
import type { ScreeningFacts } from "./eligibility"
import { quickMatchHighlights } from "./highlights"

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

/** One pair's client-facing lines, for the workspace to show without a refetch. */
export type HighlightRow = { canonical_property_key: string; reasons: string[] }

/**
 * Why a pair that was offered to the highlight writer was left exactly as it was.
 *
 * Reported rather than counted, because "we left it alone" and "there was nothing to leave
 * alone" are different answers and a locator asking why a card is still blank deserves the
 * real one.
 */
export type HighlightSkip = {
  canonical_property_key: string
  reason:
    /** The pair already carries words. A locator wrote them; nothing here may touch them. */
    | "has_saved_reasons"
    /** The engine produced no supportable line for this pair, so the slots stay open. */
    | "nothing_supportable"
    /** Backfill only: the row is in the collection but the engine does not currently rank it,
     *  so there is no band and no screening assessment to word a highlight from. */
    | "not_currently_ranked"
}

export type PersistResult = {
  inserted: number
  /** Rows skipped because the agent already had that property. */
  alreadyPresent: number
  /** Unreviewed Quick Match rows cleared before the write (a refresh only). */
  replaced: number
  /** Pairs whose "Why I chose this for you" lines this draft wrote. Empty is a normal outcome. */
  highlights: HighlightRow[]
  error: string | null
}

/** lead_recommendations.canonical_property_key is GENERATED as 'pid:<place id>' from
 *  property_url. Rebuilding it here is how an inserted row is matched back to the
 *  recommendation that produced it, with no extra round trip. */
const canonicalKey = (placeId: string): string => `pid:${placeId}`

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
    /** The client's own screening answers, for the third highlight. Read from the lead row the
     *  caller already holds; nothing here re-queries it. */
    facts: ScreeningFacts
    computedAt?: string
  },
): Promise<PersistResult> {
  const { leadId, recommendations, collection, mode, facts } = args
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
    if (delErr) return { inserted: 0, alreadyPresent: 0, replaced: 0, highlights: [], error: delErr.message }
    replaced = (cleared ?? []).length
  }

  if (recommendations.length === 0) {
    return { inserted: 0, alreadyPresent: 0, replaced, highlights: [], error: null }
  }

  const rows = recommendations.map((r) => toRecommendationRow(leadId, r, collection, computedAt))
  const { data, error } = await supabase
    .from("lead_recommendations")
    .upsert(rows, { onConflict: "lead_id,canonical_property_key", ignoreDuplicates: true })
    // canonical_property_key, not just id: with ignoreDuplicates these rows are EXACTLY the pairs
    // this draft created, so a property the agent already had is absent and its reasons are out
    // of reach by construction rather than by a check that could be forgotten.
    .select("id, canonical_property_key")
  if (error) return { inserted: 0, alreadyPresent: 0, replaced, highlights: [], error: error.message }

  const inserted = (data ?? []).length
  const { written } = await writeHighlights(supabase, leadId, recommendations, data ?? [], facts)
  return { inserted, alreadyPresent: rows.length - inserted, replaced, highlights: written, error: null }
}

/**
 * Write "Why I chose this for you" for a set of pairs the caller has vouched for.
 *
 * ── ONE WRITE PATH, TWO CALLERS ─────────────────────────────────────────────────────────────
 * `persistQuickMatch` offers the pairs its upsert just created; `backfillQuickMatchHighlights`
 * offers the Quick Match rows a client already has. They differ ONLY in which keys they vouch
 * for — the three guards below are not re-implemented anywhere, because a second copy of them
 * is a second thing to keep correct.
 *
 * ── THREE GUARDS, AND THE FIRST IS STRUCTURAL ───────────────────────────────────────────────
 * 1. Only pairs in `eligibleRows`. Each caller narrows this to keys it has established are its
 *    own to write: the draft's are exactly the rows its ignoreDuplicates upsert returned, so a
 *    property the agent already recommended is absent by construction; the backfill's are read
 *    back under `origin = 'quick_match'`, so a hand-picked row is absent for the same reason.
 * 2. Only pairs whose reasons row is absent or blank. A lead_property_reasons row OUTLIVES
 *    removal from either collection — that is the point of the table — so a pair Quick Match has
 *    just inserted can still carry words a locator wrote months ago. Those are never touched.
 * 3. Only the `reasons` column is sent. Supabase updates the columns supplied, exactly as
 *    saveReasons and saveWasherDryer each send only their own, so the commute cache, the
 *    washer/dryer status and the average-rent figures cannot be disturbed by this write.
 *
 * IDEMPOTENT BY GUARD 2 ALONE. A second run finds the lines it wrote the first time and counts
 * them as a locator's — they are indistinguishable at this layer, and that is the safe way round.
 * So running it again writes nothing and duplicates nothing.
 *
 * NEVER FAILS ITS CALLER. The recommendations are already written and are useful without their
 * highlights; a locator can type three lines by hand. So every failure path here returns empty
 * and logs, and the caller reports success.
 */
async function writeHighlights(
  supabase: SupabaseClient,
  leadId: number | string,
  recommendations: Recommendation[],
  eligibleRows: Array<Record<string, unknown>>,
  facts: ScreeningFacts,
): Promise<{ written: HighlightRow[]; skipped: HighlightSkip[] }> {
  const eligibleKeys = new Set(
    eligibleRows.map((row) => String(row.canonical_property_key ?? "")).filter(Boolean),
  )
  if (eligibleKeys.size === 0) return { written: [], skipped: [] }

  const { data: existing, error: readErr } = await supabase
    .from("lead_property_reasons")
    .select("canonical_property_key, reasons")
    .eq("lead_id", leadId)
  if (readErr) {
    console.error("[quick-match] highlights: reasons read failed:", readErr.message)
    return { written: [], skipped: [] }
  }
  // An all-blank array counts as empty: the editor stores [] when a locator clears every line,
  // and a row kept alive by its commute cache is not a row with something to say.
  const occupied = new Set(
    (existing ?? [])
      .filter((row) => ((row.reasons ?? []) as unknown[]).some((t) => String(t ?? "").trim() !== ""))
      .map((row) => String(row.canonical_property_key)),
  )

  const now = new Date().toISOString()
  const payload: Array<Record<string, unknown>> = []
  const skipped: HighlightSkip[] = []
  for (const r of recommendations) {
    const key = canonicalKey(r.property.placeId)
    if (!eligibleKeys.has(key)) continue
    if (occupied.has(key)) {
      skipped.push({ canonical_property_key: key, reason: "has_saved_reasons" })
      continue
    }
    const reasons = quickMatchHighlights(r, facts)
    // Nothing supportable to say about this property. The slot stays open for manual entry
    // rather than carrying a hedge.
    if (reasons.length === 0) {
      skipped.push({ canonical_property_key: key, reason: "nothing_supportable" })
      continue
    }
    payload.push({ lead_id: leadId, canonical_property_key: key, reasons, updated_at: now })
  }
  if (payload.length === 0) return { written: [], skipped }

  const { data: saved, error: saveErr } = await supabase
    .from("lead_property_reasons")
    .upsert(payload, { onConflict: "lead_id,canonical_property_key" })
    .select("canonical_property_key, reasons")
  if (saveErr) {
    console.error("[quick-match] highlights: save failed:", saveErr.message)
    return { written: [], skipped }
  }
  return {
    written: (saved ?? []).map((row) => ({
      canonical_property_key: String(row.canonical_property_key),
      reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    })),
    skipped,
  }
}

/** What a backfill did, and for every pair it did nothing to, why. */
export type BackfillResult = {
  /** Quick Match rows this client has — the whole population the backfill considered. */
  considered: number
  /** Pairs whose highlights were written by this run. */
  highlights: HighlightRow[]
  /** Pairs deliberately left exactly as they were, each with its reason. */
  skipped: HighlightSkip[]
  error: string | null
}

/**
 * Populate the missing highlights on Quick Match recommendations a client ALREADY HAS.
 *
 * ── IT WRITES TO ONE TABLE, AND lead_recommendations IS NOT IT ───────────────────────────────
 * There is no delete, no insert and no update against lead_recommendations anywhere in this
 * function. The existing rows therefore keep their id, their created_at, their sort_order, their
 * screening payload and their reviewed_at — the arrangement a locator left is untouched because
 * nothing here can reach it. The only statement that writes is writeHighlights' upsert into
 * lead_property_reasons, and guard 3 limits that to the `reasons` column.
 *
 * ── IT DOES NOT RE-SELECT, RE-RANK OR RE-STAMP ───────────────────────────────────────────────
 * The caller runs the engine to obtain the WORDING for properties already in the collection —
 * band, area label and screening assessment — and this function uses it for nothing else. A
 * property the engine now ranks that the client does not have is NOT added: `eligible` is read
 * from the client's own rows, so the engine's current list can only ever narrow what is written,
 * never widen the collection. `leads.quick_match_at` is not touched, so the automatic pass stays
 * exactly as decided.
 *
 * ── SCOPED TO origin = 'quick_match' ────────────────────────────────────────────────────────
 * A hand-picked row (origin NULL for everything from before the feature, or 'agent') is outside
 * the filter, so a property the locator chose themselves never receives generated wording. This
 * is rule 1 of this file applied to the read side.
 */
export async function backfillQuickMatchHighlights(
  supabase: SupabaseClient,
  args: {
    leadId: number | string
    /** The engine's current recommendations — the source of the WORDING, never of the list. */
    recommendations: Recommendation[]
    facts: ScreeningFacts
  },
): Promise<BackfillResult> {
  const { leadId, recommendations, facts } = args

  // The client's OWN Quick Match rows. This read is what defines the population; the engine
  // cannot add to it.
  const { data: owned, error: ownedErr } = await supabase
    .from("lead_recommendations")
    .select("canonical_property_key")
    .eq("lead_id", leadId)
    .eq("origin", QUICK_MATCH_ORIGIN)
  if (ownedErr) {
    return { considered: 0, highlights: [], skipped: [], error: ownedErr.message }
  }
  const ownedRows = (owned ?? []).filter((row) => String(row.canonical_property_key ?? "") !== "")
  if (ownedRows.length === 0) {
    return { considered: 0, highlights: [], skipped: [], error: null }
  }

  const { written, skipped } = await writeHighlights(supabase, leadId, recommendations, ownedRows, facts)

  // A row the engine does not currently rank has no band and no assessment behind it, so there is
  // nothing to word a highlight FROM. Reported rather than silently dropped: it is the one case
  // where a blank card is expected to stay blank, and the locator should know which.
  const ranked = new Set(recommendations.map((r) => canonicalKey(r.property.placeId)))
  const accountedFor = new Set([
    ...written.map((h) => h.canonical_property_key),
    ...skipped.map((s) => s.canonical_property_key),
  ])
  const unranked: HighlightSkip[] = ownedRows
    .map((row) => String(row.canonical_property_key))
    .filter((key) => !ranked.has(key) && !accountedFor.has(key))
    .map((key) => ({ canonical_property_key: key, reason: "not_currently_ranked" as const }))

  return { considered: ownedRows.length, highlights: written, skipped: [...skipped, ...unranked], error: null }
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
