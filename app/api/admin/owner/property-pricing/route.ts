export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { enrichProperty } from "@/lib/propertyEnrichment/writer"
import { SupabaseEnrichmentStore } from "@/lib/propertyEnrichment/stores/supabaseStore"
import type { FieldCandidate, VerificationStatus } from "@/lib/propertyEnrichment/types"

/**
 * OWNER-ONLY property pricing — the editor behind the pencil on a Recommended Properties card.
 *
 * ── THE AUTHORIZATION BOUNDARY IS HERE ──────────────────────────────────────────────────
 * requirePlatformAdmin() is the ONLY thing that decides whether an edit is allowed. Hiding
 * the pencil in the UI is presentation, not security: this route is reachable directly and
 * must stand on its own, so it re-checks on every call and never trusts a client claim.
 *
 * ── IT DOES NOT WRITE THE DATABASE ITSELF ───────────────────────────────────────────────
 * Every mutation goes through lib/propertyEnrichment/writer.ts, the single canonical write
 * path for property_catalog. That is deliberate, and it is what gives this editor — for free
 * and without a second implementation:
 *   • the commission firewall (an owner cannot edit commission here, by construction);
 *   • the allowlist, so a crafted body cannot reach a column this editor has no business in;
 *   • optimistic concurrency on updated_at;
 *   • the append-only audit trail in property_enrichment_events recording the PREVIOUS value,
 *     the new value, the source and the timestamp of every correction.
 *
 * ── PARTIAL BY CONSTRUCTION ─────────────────────────────────────────────────────────────
 * Only keys PRESENT in the body become candidates, so saving a 1BR price cannot touch the
 * 2BR or 3BR values. An omitted or blank field is "leave it alone", never "clear it" — the
 * writer refuses a null candidate (`no_value`), so there is no request shape that erases an
 * existing price. Clearing a price is deliberately not supported from this editor.
 *
 * ── HONEST LABELLING ────────────────────────────────────────────────────────────────────
 * An owner value is only recorded as `verified` when a supporting source was supplied with
 * it; without one it is recorded as `inferred`. The correction is applied either way — the
 * source decides the LABEL, not whether the owner is allowed to fix a stale price.
 */

/** The editor's fields → their property_catalog columns. The editor may touch nothing else. */
const RENT_FIELDS: Record<string, string> = {
  onebr: "onebr_starting_rent",
  twobr: "twobr_starting_rent",
  threebr: "threebr_starting_rent",
}

const READ_COLUMNS =
  "place_id, property_name, onebr_starting_rent, twobr_starting_rent, threebr_starting_rent, " +
  "current_special, current_special_source, current_special_checked_at, pricing_last_verified"

function cleanPlaceId(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : ""
  // Google place ids are opaque; accept a conservative charset rather than anything at all.
  return s && /^[A-Za-z0-9_-]{10,255}$/.test(s) ? s : null
}

/**
 * A rent as a positive integer, or null when the field was not supplied / was blank.
 *
 * Returns `undefined` for "present but unusable" so the caller can REJECT the request
 * instead of silently dropping a value the owner typed — a save that quietly ignores one of
 * three inputs is worse than one that fails.
 */
function parseRent(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null
  const s = String(v).trim().replace(/[$,\s]/g, "")
  if (s === "") return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return undefined
  return Math.round(n)
}

/** GET ?placeId=… — the editor's current values. */
export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  const placeId = cleanPlaceId(req.nextUrl.searchParams.get("placeId"))
  if (!placeId) return NextResponse.json({ error: "bad_place_id" }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from("property_catalog")
    .select(READ_COLUMNS)
    .eq("place_id", placeId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 })
  // No catalog row ⇒ the property is not confidently identified. Say so rather than
  // offering an editor that would write nothing.
  if (!data) return NextResponse.json({ error: "property_not_found" }, { status: 404 })

  // Through `unknown`: PostgREST's generated row type does not carry an index signature,
  // so a direct cast is rejected. Same shape the enrichment store reads.
  const row = data as unknown as Record<string, unknown>
  const num = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v))
  return NextResponse.json({
    placeId,
    propertyName: (row.property_name as string | null) ?? null,
    onebr: num(row.onebr_starting_rent),
    twobr: num(row.twobr_starting_rent),
    threebr: num(row.threebr_starting_rent),
    currentSpecial: (row.current_special as string | null) ?? null,
    pricingSource: (row.current_special_source as string | null) ?? null,
    checkedAt: (row.pricing_last_verified as string | null) ?? null,
  })
}

/** PUT — apply an owner correction through the enrichment writer. */
export async function PUT(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 })
  }

  const placeId = cleanPlaceId(body.placeId)
  if (!placeId) return NextResponse.json({ error: "bad_place_id" }, { status: 400 })

  // The supporting source decides the LABEL, not the permission.
  const sourceRef = typeof body.pricingSource === "string" && body.pricingSource.trim()
    ? body.pricingSource.trim().slice(0, 500)
    : null
  const verificationStatus: VerificationStatus = sourceRef ? "verified" : "inferred"

  const candidates: FieldCandidate[] = []
  const rejected: string[] = []

  // Date checked — supplied by the editor (auto-populated to today) or stamped here.
  const checkedAtRaw = typeof body.checkedAt === "string" && body.checkedAt.trim() ? body.checkedAt.trim() : null
  const checkedAt = checkedAtRaw && !Number.isNaN(new Date(checkedAtRaw).getTime())
    ? new Date(checkedAtRaw).toISOString()
    : new Date().toISOString()

  const add = (field: string, value: unknown) =>
    candidates.push({
      field,
      value,
      sourceType: "manual_verified",
      sourceReference: sourceRef,
      verificationStatus,
      checkedAt,
      // The explicit, narrow exception to preserve-by-default. See policy.decideFieldWrite.
      ownerOverride: true,
    })

  for (const [key, column] of Object.entries(RENT_FIELDS)) {
    if (!(key in body)) continue // absent ⇒ untouched
    const rent = parseRent(body[key])
    if (rent === undefined) { rejected.push(key); continue }
    if (rent === null) continue // blank ⇒ leave the stored value alone, never clear it
    add(column, rent)
  }

  if ("currentSpecial" in body) {
    const s = typeof body.currentSpecial === "string" ? body.currentSpecial.trim().slice(0, 500) : ""
    if (s) add("current_special", s)
  }

  // A pricing edit always restamps when it was checked, so a card can show the age of the
  // number it is displaying. Only when something was actually supplied.
  //
  // DATE-ONLY on purpose: property_catalog.pricing_last_verified is a `date`. Sending a full
  // ISO timestamp would still store correctly (Postgres truncates) but would never compare
  // equal to the stored value, so the writer's idempotency check would miss and every save
  // would log a spurious change. The candidate's own `checkedAt` provenance stays full ISO.
  if (candidates.length > 0) add("pricing_last_verified", checkedAt.slice(0, 10))

  if (rejected.length > 0) {
    return NextResponse.json({ error: "bad_value", fields: rejected }, { status: 400 })
  }
  if (candidates.length === 0) {
    return NextResponse.json({ error: "nothing_to_save" }, { status: 400 })
  }

  const result = await enrichProperty(new SupabaseEnrichmentStore(), {
    placeId,
    // Ties every audit row to the owner who made the change and when.
    jobId: `owner:${guard.userId}:${Date.now()}`,
    fields: candidates,
  })

  if (result.results.every((r) => r.reason === "property_not_found")) {
    return NextResponse.json({ error: "property_not_found" }, { status: 404 })
  }
  if (!result.applied) {
    // Another writer moved updated_at mid-flight. Nothing was overwritten; the caller
    // should re-read and try again rather than be told it saved.
    return NextResponse.json({ error: "conflict_retry" }, { status: 409 })
  }

  return NextResponse.json({
    ok: true,
    written: result.results.filter((r) => r.outcome === "written").map((r) => r.field),
    // Returned so a skip is visible to the operator rather than looking like a save.
    skipped: result.results.filter((r) => r.outcome !== "written").map((r) => ({ field: r.field, reason: r.reason })),
    verificationStatus,
  })
}
