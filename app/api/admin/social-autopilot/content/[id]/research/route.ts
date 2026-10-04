export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

/**
 * SOCIAL BEAST — property research observations for ONE video.
 *
 * GET  loads what was observed, so reopening the editor shows it.
 * PUT  saves the whole research form as observations.
 *
 * ── WHAT THIS ROUTE CANNOT DO ───────────────────────────────────────────────
 * It writes exactly two tables: social_property_observations and
 * social_floorplan_observations. It never touches property_catalog,
 * property_floor_plans, property_attributes or property_specials, and it stamps
 * no freshness field (pricing_last_verified, verified_at, intel_enriched_at are
 * Mini Beast's). Social Beast is a provenance SOURCE; Mini Beast remains the only
 * writer of authoritative Property Intelligence, and nothing consumes these yet.
 *
 * It also never touches the video's own marketing fields. The overlay price
 * (social_content.budget_range + price_label_mode) and the research price are
 * deliberately separate concepts that may legitimately disagree.
 *
 * ── BLANKS ARE NOT OBSERVATIONS ─────────────────────────────────────────────
 * An empty input means "I didn't find this", which is not a fact worth storing.
 * Empty fields are DELETED rather than written as "", so clearing a value in the
 * form removes the observation instead of leaving a hollow row behind.
 */

/** The property-level fields the Phase 1 form can observe — authoritative
 *  property_catalog column names, so a later comparison is a field lookup.
 *  fivebr_plus_starting_rent exists in the catalog but is out of the Phase 1 UI. */
const PROPERTY_FIELDS = new Set([
  "studio_starting_rent",
  "onebr_starting_rent",
  "twobr_starting_rent",
  "threebr_starting_rent",
  "fourbr_starting_rent",
  "townhome_starting_rent",
  "loft_starting_rent",
  "penthouse_starting_rent",
  "current_special",
  "observed_features",
])

const PRICE_CONTEXTS = new Set(["starting_at", "exact_unit"])
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const text = (v: unknown, max = 500): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""
  return s ? s.slice(0, max) : null
}
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const s = typeof v === "string" ? v.replace(/[^0-9.]/g, "") : ""
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  const [obs, plan] = await Promise.all([
    guard.supabase
      .from("social_property_observations")
      .select("field, value, source_url, observed_at")
      .eq("social_content_id", id),
    guard.supabase
      .from("social_floorplan_observations")
      .select("plan_name, beds, baths, sqft, observed_price, price_context, source_url, observed_at")
      .eq("social_content_id", id)
      .maybeSingle(),
  ])

  const fields: Record<string, string> = {}
  for (const r of (obs.data ?? []) as { field: string; value: string }[]) fields[r.field] = r.value

  return NextResponse.json({
    fields,
    floorPlan: plan.data ?? null,
    // Provenance is per-observation, but the form edits one set at a time, so
    // surface the most recent for prefill.
    sourceUrl:
      (plan.data as { source_url?: string | null } | null)?.source_url ??
      ((obs.data ?? [])[0] as { source_url?: string | null } | undefined)?.source_url ??
      null,
    observedAt:
      (plan.data as { observed_at?: string | null } | null)?.observed_at ??
      ((obs.data ?? [])[0] as { observed_at?: string | null } | undefined)?.observed_at ??
      null,
  })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { id } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // place_id comes from the SOURCE ROW, never the request. The research is only
  // meaningful against the property the video is actually matched to, and a
  // client-supplied id could attach observations to someone else's property.
  const { data: src } = await guard.supabase
    .from("social_content")
    .select("id, place_id")
    .eq("id", id)
    .maybeSingle()
  const placeId = (src as { place_id: string | null } | null)?.place_id ?? null
  if (!src) return NextResponse.json({ error: "Video not found" }, { status: 404 })
  if (!placeId) {
    return NextResponse.json({ error: "Match a property before saving research" }, { status: 400 })
  }

  const observedAt = DATE_ONLY.test(String(body.observedAt ?? ""))
    ? (body.observedAt as string)
    : new Date().toISOString().slice(0, 10)
  const sourceUrl = text(body.sourceUrl, 2000)

  // ── Property-level observations ───────────────────────────────────────────
  const incoming = (body.fields ?? {}) as Record<string, unknown>
  const upserts: Record<string, unknown>[] = []
  const clears: string[] = []
  for (const field of PROPERTY_FIELDS) {
    if (!(field in incoming)) continue
    const value = text(incoming[field])
    if (value === null) { clears.push(field); continue } // blank → remove, never store ""
    upserts.push({
      place_id: placeId,
      social_content_id: id,
      observed_by: guard.userId,
      field,
      value,
      source_url: sourceUrl,
      observed_at: observedAt,
      updated_at: new Date().toISOString(),
    })
  }

  if (clears.length) {
    const { error } = await guard.supabase
      .from("social_property_observations")
      .delete()
      .eq("social_content_id", id)
      .in("field", clears)
    if (error) {
      console.error("[research] clear failed:", error.message)
      return NextResponse.json({ error: "Could not save research" }, { status: 500 })
    }
  }
  if (upserts.length) {
    // onConflict on the (social_content_id, field) unique key: re-saving UPDATES
    // the existing observation rather than appending a duplicate.
    const { data, error } = await guard.supabase
      .from("social_property_observations")
      .upsert(upserts, { onConflict: "social_content_id,field" })
      .select("id")
    if (error) {
      console.error("[research] upsert failed:", error.message)
      return NextResponse.json({ error: "Could not save research" }, { status: 500 })
    }
    // A write that affects no row is NOT an error to PostgREST. Without this an
    // RLS-blocked save would return 200 having stored nothing — the exact silent
    // failure that shipped once on public.workspaces.
    if (!data || data.length !== upserts.length) {
      console.error(`[research] upsert wrote ${data?.length ?? 0}/${upserts.length} rows`)
      return NextResponse.json({ error: "Could not save research" }, { status: 500 })
    }
  }

  // ── Video-specific floor plan ─────────────────────────────────────────────
  const fp = (body.floorPlan ?? {}) as Record<string, unknown>
  const plan = {
    plan_name: text(fp.planName, 60),
    beds: num(fp.beds),
    baths: num(fp.baths),
    sqft: num(fp.sqft) === null ? null : Math.round(num(fp.sqft)!),
    observed_price: text(fp.observedPrice, 60),
    price_context: PRICE_CONTEXTS.has(String(fp.priceContext)) ? (fp.priceContext as string) : null,
  }
  const planEmpty = Object.values(plan).every((v) => v === null)

  if (planEmpty) {
    // Nothing observed about the unit shown → remove any prior row rather than
    // keeping an all-null record.
    const { error } = await guard.supabase
      .from("social_floorplan_observations")
      .delete()
      .eq("social_content_id", id)
    if (error) {
      console.error("[research] floor plan clear failed:", error.message)
      return NextResponse.json({ error: "Could not save research" }, { status: 500 })
    }
  } else {
    const { data, error } = await guard.supabase
      .from("social_floorplan_observations")
      .upsert(
        {
          social_content_id: id,
          place_id: placeId,
          observed_by: guard.userId,
          ...plan,
          source_url: sourceUrl,
          observed_at: observedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "social_content_id" },
      )
      .select("social_content_id")
    if (error || !data || data.length !== 1) {
      console.error("[research] floor plan upsert failed:", error?.message ?? "0 rows")
      return NextResponse.json({ error: "Could not save research" }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, saved: upserts.length, cleared: clears.length, floorPlan: !planEmpty })
}
