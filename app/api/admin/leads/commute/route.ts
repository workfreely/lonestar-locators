import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { driveTimesToAnchor, RoutesConfigError } from "@/lib/commute/routes"
import { applyCommuteReason, needsCommute } from "@/lib/commute/commuteReason"
import { displayDestinationLabel } from "@/lib/commute/destinationAliases"

// POST /api/admin/leads/commute  { leadId }
//
// Computes the drive time from every property in this client's Favorites AND
// Recommendations to their saved Commute / Destination, caches it on the canonical
// lead_property_reasons row, and writes the "12 min to Fort Sam" reason.
//
// AUTH: the caller's OWN Supabase session, never the service role (same model as
// /api/admin/client-shares). The leads read is RLS-scoped, and the
// lead_property_reasons policy is is_active_workspace_member, so another workspace's
// client can neither be read nor written. Using the caller's identity also matters
// for a second reason: new rows get workspace_id/owner_user_id from the
// set_workspace_ownership trigger, which derives them from auth.uid() — under the
// service role that is null and the rows would be unscoped.
//
// IDEMPOTENT AND CHEAP TO CALL. It computes ONLY pairs whose cache is missing or was
// built against a different anchor, so the common case does no Google work at all
// and returns { computed: 0 }. That is what lets the client call it when a lead is
// opened without this becoming a per-render calculation: the guard is the anchor
// mismatch, never a timer.
//
// The commute result lives on the SAME row as the reasons it produced, so a property
// moved between Favorites and Recommendations keeps both — there is no second
// commute store anywhere.

export const runtime = "nodejs"

type PairRow = { canonical_property_key: string | null }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const leadId = Number((body as { leadId?: unknown } | null)?.leadId)
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "valid leadId required" }, { status: 400 })
  }

  // ── The client's destination ───────────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, commute_anchor_label, commute_anchor_place_id")
    .eq("id", leadId)
    .maybeSingle()
  if (leadErr) return NextResponse.json({ error: "lead_read_failed" }, { status: 500 })
  // RLS makes a cross-workspace lead indistinguishable from a missing one, which is
  // the correct answer to give either way.
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const anchorPlaceId = (lead.commute_anchor_place_id ?? "").trim()
  // The alias bank applies HERE, not at render: the label is baked into the reason
  // string that is stored on the canonical row, and Favorites, Recommendations and
  // every minted Preview / Send List snapshot read that string — not the label.
  // Aliasing anywhere else would leave those four surfaces showing Google's long name.
  const anchorLabel = displayDestinationLabel(lead.commute_anchor_label)
  // No destination saved → nothing to compute. Deliberately NOT an error: most
  // clients have no anchor, and the caller fires this on every lead open.
  if (!anchorPlaceId || !anchorLabel) {
    return NextResponse.json({ ok: true, skipped: "no_anchor", computed: 0, rows: [] })
  }

  // ── Every property this client has, in either collection ───────────────────
  const [recs, favs] = await Promise.all([
    supabase.from("lead_recommendations").select("canonical_property_key").eq("lead_id", leadId),
    supabase.from("lead_favorites").select("canonical_property_key").eq("lead_id", leadId),
  ])
  if (recs.error || favs.error) {
    return NextResponse.json({ error: "properties_read_failed" }, { status: 500 })
  }
  // Deduplicated: 7 pairs currently sit in BOTH collections, and they share one
  // canonical row, so computing per collection would be paying Google twice for one
  // answer.
  const keys = [
    ...new Set(
      [...(recs.data ?? []), ...(favs.data ?? [])]
        .map((r: PairRow) => (r.canonical_property_key ?? "").trim())
        // ONLY 'pid:' keys. canonical_property_key is a generated column that falls
        // back to 'url:<property_url>' when a property's URL carries no place_id (an
        // unresolved external-site listing). Passing that to Routes as a placeId
        // would be a guaranteed error for the whole batch, taking every good
        // property down with it. Those properties simply get no commute.
        .filter((k) => k.startsWith("pid:")),
    ),
  ]
  if (keys.length === 0) {
    return NextResponse.json({ ok: true, computed: 0, upToDate: 0, rows: [] })
  }

  // ── What is already cached ─────────────────────────────────────────────────
  const { data: existing, error: exErr } = await supabase
    .from("lead_property_reasons")
    .select("canonical_property_key, reasons, commute_minutes, commute_anchor_place_id, commute_computed_at")
    .eq("lead_id", leadId)
  if (exErr) return NextResponse.json({ error: "reasons_read_failed" }, { status: 500 })

  const byKey = new Map((existing ?? []).map((r) => [r.canonical_property_key, r]))
  const stale = keys.filter((k) => needsCommute(byKey.get(k), anchorPlaceId))
  if (stale.length === 0) {
    return NextResponse.json({ ok: true, computed: 0, upToDate: keys.length, rows: [] })
  }

  // ── Google ─────────────────────────────────────────────────────────────────
  let results
  try {
    results = await driveTimesToAnchor(stale, anchorPlaceId)
  } catch (err) {
    if (err instanceof RoutesConfigError) {
      return NextResponse.json({ error: "routes_not_configured" }, { status: 500 })
    }
    console.error("[commute] Routes failed:", err)
    return NextResponse.json({ error: "routes_failed" }, { status: 502 })
  }

  // ── Persist: the cache always, the reason only when the rules allow ────────
  const computedAt = new Date().toISOString()
  const upserts = results.map(({ propertyKey, minutes }) => {
    const prior = byKey.get(propertyKey)
    const priorReasons = Array.isArray(prior?.reasons) ? (prior!.reasons as string[]) : []
    // minutes === null means Routes found no drivable route. The cache row is still
    // written — with the anchor and the timestamp — so the failure is remembered and
    // the pair is not re-sent to Google on every later call. No reason is invented.
    const { reasons, outcome } =
      minutes == null
        ? { reasons: priorReasons, outcome: "no_route" as const }
        : applyCommuteReason(priorReasons, minutes, anchorLabel)
    return {
      row: {
        lead_id: leadId,
        canonical_property_key: propertyKey,
        reasons,
        commute_minutes: minutes,
        commute_anchor_place_id: anchorPlaceId,
        commute_computed_at: computedAt,
        updated_at: computedAt,
      },
      outcome,
      minutes,
    }
  })

  const { data: saved, error: saveErr } = await supabase
    .from("lead_property_reasons")
    .upsert(
      upserts.map((u) => u.row),
      { onConflict: "lead_id,canonical_property_key" },
    )
    .select("canonical_property_key, reasons, commute_minutes, commute_anchor_place_id")
  if (saveErr) {
    console.error("[commute] save failed:", saveErr.message)
    return NextResponse.json({ error: "save_failed", detail: saveErr.message }, { status: 500 })
  }

  const tally = upserts.reduce<Record<string, number>>((a, u) => ({ ...a, [u.outcome]: (a[u.outcome] ?? 0) + 1 }), {})
  return NextResponse.json({
    ok: true,
    computed: results.length,
    upToDate: keys.length - stale.length,
    outcomes: tally,
    anchorLabel,
    // Returned so the caller can merge into its reasons map without a refetch.
    rows: saved ?? [],
  })
}
