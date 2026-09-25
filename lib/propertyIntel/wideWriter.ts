// Preserve-by-default writer for the wide one-row-per-property Property Intelligence
// tables (property_approval_policy, property_specials) plus small entity helpers
// (management_companies, property_floor_plans). Same safety posture as the scalar
// enrichment writer: fill empty, preserve populated curated values, surface conflicts
// (never silently overwrite), and audit every decision into property_enrichment_events.
// Server-side (service role) — used by the curated import + canary.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { decideFieldWrite, toStoredText } from "@/lib/propertyEnrichment/policy"
import type { SourceType, VerificationStatus } from "@/lib/propertyEnrichment/types"

export type WideCandidate = {
  value: unknown
  sourceType: SourceType
  sourceReference?: string | null
  verificationStatus: VerificationStatus
  checkedAt?: string | null
}
export type WideResult = {
  written: string[]
  skipped: { field: string; reason: string }[]
  conflicts: { field: string; existing: string | null; incoming: string | null; reason: string }[]
}

async function recordEvents(rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const { error } = await supabaseAdmin.from("property_enrichment_events").insert(rows)
  if (error) console.error("[wideWriter] recordEvents:", error.message)
}

/**
 * Fill/patch a single wide row (table has a `place_id` PK). Preserve-by-default:
 * empty→fill, equal→skip, populated+conflicting verified authoritative→conflict (no
 * overwrite). `eventPrefix` namespaces the field in the shared audit trail
 * (e.g. "approval", "special").
 */
export async function writeWideRow(
  table: string,
  placeId: string,
  candidates: Record<string, WideCandidate>,
  opts: { jobId: string; eventPrefix: string; dryRun?: boolean },
): Promise<WideResult> {
  const dryRun = opts.dryRun === true
  const res: WideResult = { written: [], skipped: [], conflicts: [] }
  const { data: existing } = await supabaseAdmin.from(table).select("*").eq("place_id", placeId).maybeSingle()
  const cur = (existing ?? {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  const events: Record<string, unknown>[] = []

  for (const [field, cand] of Object.entries(candidates)) {
    const currentText = toStoredText(cur[field])
    const candidateText = toStoredText(cand.value)
    const d = decideFieldWrite({
      field,
      candidateText,
      candidateSourceType: cand.sourceType,
      candidateVerification: cand.verificationStatus,
      currentText,
      currentProvenance: null, // wide-table provenance lives in the events trail
    })
    if (d.outcome === "write") {
      patch[field] = cand.value
      res.written.push(field)
    } else {
      res.skipped.push({ field, reason: d.reason })
      if (d.reason.startsWith("conflict")) {
        res.conflicts.push({ field, existing: currentText, incoming: candidateText, reason: d.reason })
      }
    }
    events.push({
      job_id: opts.jobId,
      place_id: placeId,
      field_name: `${opts.eventPrefix}:${field}`,
      action: d.outcome === "write" ? "written" : "skipped",
      old_value: currentText,
      new_value: candidateText,
      source_type: cand.sourceType,
      source_reference: cand.sourceReference ?? null,
      verification_status: cand.verificationStatus,
      reason: d.reason,
      checked_at: cand.checkedAt ?? null,
    })
  }

  if (!dryRun && Object.keys(patch).length > 0) {
    const row = { place_id: placeId, ...patch }
    const { error } = await supabaseAdmin.from(table).upsert(row, { onConflict: "place_id" })
    if (error) {
      console.error(`[wideWriter] ${table} upsert:`, error.message)
      return { written: [], skipped: res.skipped, conflicts: res.conflicts }
    }
  }
  if (!dryRun) await recordEvents(events)
  return res
}

/** Upsert a management company by name; returns its id. */
export async function upsertManagementCompany(
  name: string,
  fields: Record<string, unknown> = {},
): Promise<string | null> {
  const clean = (name || "").trim()
  if (!clean) return null
  const { data: found } = await supabaseAdmin
    .from("management_companies").select("id").eq("name", clean).maybeSingle()
  if (found?.id) {
    if (Object.keys(fields).length) {
      // fill-empty only: do not overwrite existing tendencies
      const { data: cur } = await supabaseAdmin.from("management_companies").select("*").eq("id", found.id).maybeSingle()
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v != null && (cur as Record<string, unknown>)?.[k] == null) patch[k] = v
      }
      if (Object.keys(patch).length) await supabaseAdmin.from("management_companies").update(patch).eq("id", found.id)
    }
    return found.id as string
  }
  const { data: ins, error } = await supabaseAdmin
    .from("management_companies").insert({ name: clean, ...fields }).select("id").maybeSingle()
  if (error) { console.error("[wideWriter] mgmt insert:", error.message); return null }
  return (ins?.id as string) ?? null
}

/** Append a floorplan fact row (deduped by place_id + name). Fill-only. */
export async function insertFloorPlan(placeId: string, fp: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("property_floor_plans")
    .upsert({ place_id: placeId, ...fp }, { onConflict: "place_id,name" })
  if (error) { console.error("[wideWriter] floorplan upsert:", error.message); return false }
  return true
}
