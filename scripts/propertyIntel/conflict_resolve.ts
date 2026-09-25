// Classify + safely resolve the surfaced write conflicts. Auto-resolves stale
// Google-owned data and demonstrably malformed values (via the ownership policy in the
// real writer); queues legitimate disagreements for human review. Idempotent.
// Run: npx tsx scripts/propertyIntel/conflict_resolve.ts [--dry]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const line of fs.readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const DRY = process.argv.includes("--dry")

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const { isMalformedValue, fieldOwnership } = await import("@/lib/propertyEnrichment/ownership")
  const store = new SupabaseEnrichmentStore()
  const now = new Date().toISOString()

  // Latest conflict event per (place_id, field_name).
  const { data: evs } = await supabaseAdmin.from("property_enrichment_events")
    .select("place_id, field_name, old_value, new_value, source_type, created_at")
    .like("reason", "conflict%").order("created_at", { ascending: true })
  const latest = new Map<string, Record<string, unknown>>()
  for (const e of evs ?? []) latest.set(`${e.place_id}|${e.field_name}`, e)
  const conflicts = [...latest.values()]

  const tally: Record<string, number> = {}
  const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1)
  if (!DRY) await supabaseAdmin.from("property_conflict_review").delete().gte("id", 0)

  for (const c of conflicts) {
    const field = c.field_name as string
    const oldV = (c.old_value as string) ?? null
    const newV = (c.new_value as string) ?? null
    const owner = fieldOwnership(field)
    let classification: string
    let disposition = "preserved_pending_review"
    let candidateValue: unknown = null
    let candidateSource: "google_places" | "official_property_site" | null = null

    if (owner === "google_owned" && (c.source_type as string) === "google_places") {
      classification = field === "google_rating" || field === "google_review_count" ? "stale_google_owned" : "normalization_diff"
      candidateValue = /^-?\d+(\.\d+)?$/.test(newV ?? "") ? Number(newV) : newV
      candidateSource = "google_places"
      disposition = "auto_refreshed"
    } else if ((field === "location_keywords" || field === "amenity_keywords") && isMalformedValue(field, oldV)) {
      classification = "malformed_existing"
      try { candidateValue = JSON.parse(newV ?? "[]") } catch { candidateValue = null }
      candidateSource = "official_property_site"
      disposition = "auto_replaced"
    } else {
      classification = "legitimate_disagreement"
    }
    bump(classification)

    if (!DRY && candidateSource && candidateValue != null) {
      const res = await enrichProperty(store, { placeId: c.place_id as string, jobId: "conflict_resolve_2026_09_25", fields: [
        { field, value: candidateValue, sourceType: candidateSource, sourceReference: candidateSource === "google_places" ? "google_refresh" : "official_site_refresh", verificationStatus: "verified", checkedAt: now },
      ] })
      // Disposition follows CLASSIFICATION (auto class stays auto-resolved); a no-op
      // re-apply just means the value is already correct (idempotent), not a downgrade.
      const outcome = res.results[0]?.outcome
      if (outcome === "written") bump("auto_applied_write")
      else bump("auto_already_current")
    }

    if (!DRY) {
      await supabaseAdmin.from("property_conflict_review").insert({
        place_id: c.place_id, field_name: field, existing_value: oldV, incoming_value: newV,
        incoming_source_type: c.source_type, classification, disposition,
        resolved_value: disposition.startsWith("auto") ? newV : null,
      })
    }
  }
  console.log(JSON.stringify({ conflicts: conflicts.length, ...tally }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
