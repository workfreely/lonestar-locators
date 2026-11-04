export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runQuickMatch, loadQuickMatchCollection, DEFAULT_COLLECTION } from "@/lib/quickMatch"
import { resolveClientNeeds } from "@/lib/quickMatch/needs"
import { persistQuickMatch, markQuickMatchRun, QUICK_MATCH_ORIGIN } from "@/lib/quickMatch/persist"

// /api/admin/quick-match/[leadId] — the Quick Match draft for one client.
//
//   GET   compute and return. Writes NOTHING. Used to show the agent what a run would produce.
//   POST  compute and PERSIST into the existing lead_recommendations collection.
//
// ── AUTH ────────────────────────────────────────────────────────────────────────────────────
// Runs under the caller's OWN session, never the service role. The lead read is subject to the
// leads RLS policy, so another workspace's client simply is not found; the insert is stamped
// with that agent's workspace by the existing set_workspace_ownership trigger; and
// lb_quick_match_candidates is granted to `authenticated` only, so the screening data this
// touches can never be reached by the anonymous client-facing share page.
//
// ── WHAT POST WILL AND WILL NOT DO ──────────────────────────────────────────────────────────
// It adds up to six rows to Recommended Properties and stamps `leads.quick_match_at`. It sends
// no message, creates no share, schedules nothing, and touches no row the agent picked or kept
// (see lib/quickMatch/persist.ts for the three-way scope on every delete). The automatic mode
// clears nothing at all.
//
// ── IT DEGRADES INSTEAD OF FAILING ──────────────────────────────────────────────────────────
// The three migrations this needs are PREPARED, not applied. Until they are, the route answers
// 200 with `readPathMissing` / `writePathMissing` and an empty list, so the workspace can say
// plainly that Quick Match has not shipped yet. "Not installed" and "no matches" must never
// look the same.

/** PostgREST's answer when a column in the body is not in its cached schema. */
const isMissingColumn = (msg: string | null | undefined, code?: string) =>
  code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(String(msg ?? ""))

/** The columns the engine reads off the lead. Named, not `*`: a lead row is wide and most of it
 *  is irrelevant here, and an explicit list makes the engine's inputs auditable. */
const LEAD_COLUMNS = [
  "id", "beds", "desired_rent", "city", "neighborhoods", "submarkets",
  "destination_zip", "commute_max_minutes", "commute_anchor_label",
  "credit_score", "credit_history",
  "broken_lease_age", "broken_lease_amount", "eviction_age", "eviction_balance", "eviction_court",
  "criminal_background", "criminal_charge", "felony_age", "misdemeanor_age",
].join(", ")

/** Columns that only exist once the prepared migrations are applied. Asked for separately so a
 *  missing one degrades instead of failing the whole read. */
const LEAD_PENDING_COLUMNS = "broken_lease_paid, eviction_paid, rental_debt_status, quick_match_at"

type Loaded = {
  lead: Record<string, unknown>
  /** False when lead_screening_resolution has not been applied. */
  resolutionColumns: boolean
}

async function loadLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<{ ok: true; value: Loaded } | { ok: false; response: NextResponse }> {
  const base = await supabase.from("leads").select(LEAD_COLUMNS).eq("id", leadId).maybeSingle()
  if (base.error) {
    return { ok: false, response: NextResponse.json({ error: base.error.message }, { status: 500 }) }
  }
  if (!base.data) {
    return { ok: false, response: NextResponse.json({ error: "lead not found" }, { status: 404 }) }
  }
  const extra = await supabase
    .from("leads").select(LEAD_PENDING_COLUMNS).eq("id", leadId).maybeSingle()
  if (extra.error && !isMissingColumn(extra.error.message, extra.error.code)) {
    return { ok: false, response: NextResponse.json({ error: extra.error.message }, { status: 500 }) }
  }
  return {
    ok: true,
    value: {
      // Both casts go through `unknown`: PostgREST types a selected-column result as a union
      // that includes its own error shape, and the two reads are merged into one plain row.
      lead: {
        ...(base.data as unknown as Record<string, unknown>),
        ...((extra.data ?? {}) as unknown as Record<string, unknown>),
      },
      resolutionColumns: !extra.error,
    },
  }
}

/** The shared compute step. Pure once the two reads are done. */
async function compute(supabase: Awaited<ReturnType<typeof createClient>>, lead: Record<string, unknown>) {
  const load = await loadQuickMatchCollection(supabase, DEFAULT_COLLECTION)
  if (load.error) return { error: load.error as string }
  if (load.readPathMissing) return { readPathMissing: true as const }

  const needs = resolveClientNeeds(lead)
  // TRAVEL TIMES are deliberately empty. A stated commute limit is reported as MET only when a
  // real estimate says so, and this route does not call the routing service — so the engine
  // lists the limit as unconfirmed rather than letting a nearby ZIP stand in for a drive time.
  // Supplying real minutes is a separate step; the engine already accepts them.
  const result = runQuickMatch({ lead, properties: load.properties, needs, travelMinutes: {} })
  return { result, needs }
}

/** The agent-facing JSON for one recommendation. */
const asJson = (r: import("@/lib/quickMatch").Recommendation) => ({
  placeId: r.property.placeId,
  propertyName: r.property.propertyName,
  address: r.property.address,
  zip: r.property.zip,
  tier: r.tier,
  reasons: r.reasons,
  unverified: r.unverified,
  conflicts: r.conflicts,
  conditions: r.conditions,
  creditMinimumScore: r.property.creditMinimumScore,
  screeningRequirementsCheckedAt: r.property.screeningRequirementsCheckedAt,
})

export async function GET(_req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const loaded = await loadLead(supabase, leadId)
  if (!loaded.ok) return loaded.response
  const { lead, resolutionColumns } = loaded.value

  const c = await compute(supabase, lead)
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 500 })
  if ("readPathMissing" in c) {
    return NextResponse.json({
      readPathMissing: true,
      message: "The Quick Match read path (lb_quick_match_candidates) is not present in this database — its prepared migration has not been applied.",
      eligibility: null, recommendations: [],
    })
  }

  const { result, needs } = c
  return NextResponse.json({
    readPathMissing: false,
    resolutionColumns,
    alreadyRan: lead.quick_match_at ?? null,
    eligibility: result.eligibility,
    facts: result.facts,
    needs,
    consideredCount: result.consideredCount,
    tierCounts: result.tierCounts,
    excludedMismatches: result.excludedMismatches,
    recommendations: result.recommendations.map(asJson),
  })
}

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // `refresh` is the agent asking again. Anything else is the automatic first pass, which runs
  // once per client and only when nothing has run before.
  let wantRefresh = false
  try {
    const body = await req.json()
    wantRefresh = body?.mode === "refresh"
  } catch {
    // No body is the automatic pass.
  }

  const loaded = await loadLead(supabase, leadId)
  if (!loaded.ok) return loaded.response
  const { lead, resolutionColumns } = loaded.value

  const alreadyRan = lead.quick_match_at ?? null
  if (!wantRefresh && alreadyRan) {
    // ALREADY DONE. Re-running automatically is what would resurrect a property the agent
    // deliberately removed, so the stamp is respected and nothing is written.
    return NextResponse.json({
      skipped: "already_ran", alreadyRan, inserted: 0, replaced: 0, alreadyPresent: 0,
      recommendations: [],
    })
  }

  const c = await compute(supabase, lead)
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: 500 })
  if ("readPathMissing" in c) {
    return NextResponse.json({
      readPathMissing: true,
      message: "The Quick Match read path (lb_quick_match_candidates) is not present in this database — its prepared migration has not been applied.",
      eligibility: null, recommendations: [], inserted: 0,
    })
  }

  const { result } = c
  if (!result.eligibility.eligible) {
    // Not an error: Quick Match does not apply to this client. Nothing is written and nothing is
    // stamped, so if their situation is recorded later the automatic pass still runs.
    return NextResponse.json({
      eligibility: result.eligibility, recommendations: [], inserted: 0, replaced: 0,
      alreadyPresent: 0, skipped: "not_eligible",
    })
  }

  const persisted = await persistQuickMatch(supabase, {
    leadId,
    recommendations: result.recommendations,
    collection: DEFAULT_COLLECTION,
    mode: wantRefresh ? "refresh" : "initial",
  })
  if (persisted.error) {
    if (isMissingColumn(persisted.error)) {
      return NextResponse.json({
        writePathMissing: true,
        message: "lead_recommendations has no origin/screening column — the prepared Quick Match migration has not been applied, so a draft cannot be marked as generated and is not written at all.",
        eligibility: result.eligibility, recommendations: result.recommendations.map(asJson), inserted: 0,
      })
    }
    return NextResponse.json({ error: persisted.error }, { status: 500 })
  }

  // Stamp LAST, and only after a successful write: a stamp with no rows behind it would stop the
  // automatic pass from ever trying again.
  const stampError = await markQuickMatchRun(supabase, leadId)
  const stamped = stampError === null

  return NextResponse.json({
    readPathMissing: false,
    resolutionColumns,
    origin: QUICK_MATCH_ORIGIN,
    mode: wantRefresh ? "refresh" : "initial",
    eligibility: result.eligibility,
    consideredCount: result.consideredCount,
    tierCounts: result.tierCounts,
    excludedMismatches: result.excludedMismatches,
    inserted: persisted.inserted,
    alreadyPresent: persisted.alreadyPresent,
    replaced: persisted.replaced,
    stamped,
    stampError: stamped ? null : stampError,
    recommendations: result.recommendations.map(asJson),
  })
}
