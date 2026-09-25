// Controlled CURATED normalization/import — runs the extracted candidates through the
// safe writers (preserve-by-default, conflict surfacing, provenance). Lossless raw first.
// Run: npx tsx scripts/propertyIntel/import.ts [--dry]
import fs from "node:fs"
import path from "node:path"

// Load .env.local into process.env (tsx does not auto-load it).
;(() => {
  const p = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
})()

const DRY = process.argv.includes("--dry")
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const JOB = "curated_import_2026_09_25"

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { writeAttributes } = await import("@/lib/propertyEnrichment/attributes")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const { writeWideRow, upsertManagementCompany } = await import("@/lib/propertyIntel/wideWriter")
  const store = new SupabaseEnrichmentStore()
  const read = (f: string) => fs.existsSync(`${S}/${f}`) ? fs.readFileSync(`${S}/${f}`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []
  const nowIso = new Date().toISOString()
  const tally: Record<string, number> = {}
  const bump = (k: string, n = 1) => (tally[k] = (tally[k] ?? 0) + n)

  // 1) LOSSLESS raw preservation (idempotent-ish: clear this job's prior raw, then insert).
  const raw = read("raw.jsonl")
  if (!DRY) {
    await supabaseAdmin.from("property_source_raw").delete().gte("id", 0) // fresh load of curated sources
    for (let i = 0; i < raw.length; i += 1000) {
      const batch = raw.slice(i, i + 1000).map((r) => ({
        place_id: r.place_id ?? null, market: r.market ?? null, source_file: r.source_file,
        source_sheet: r.source_sheet ?? null, source_row: String(r.source_row ?? ""),
        column_label: r.column_label, raw_value: r.raw_value ?? null,
        category: null, mapped_to: null,
      }))
      const { error } = await supabaseAdmin.from("property_source_raw").insert(batch)
      if (error) { console.error("raw insert:", error.message); break }
      bump("raw_preserved", batch.length)
    }
  } else bump("raw_preserved", raw.length)
  console.log(`[1] raw preserved: ${tally.raw_preserved}`)

  // 2) CATALOG scalars + keywords merged per place_id → one enrichProperty call.
  const scalars: Record<string, { fields: Record<string, unknown>; ref: string }> = {}
  for (const r of read("catalog.jsonl")) {
    scalars[r.place_id] ??= { fields: {}, ref: r.ref }
    Object.assign(scalars[r.place_id].fields, r.fields)
  }
  for (const r of read("keywords.jsonl")) {
    scalars[r.place_id] ??= { fields: {}, ref: r.ref }
    if (r.amenity_keywords?.length) scalars[r.place_id].fields.amenity_keywords = r.amenity_keywords.slice(0, 3)
    if (r.location_keywords?.length) scalars[r.place_id].fields.location_keywords = r.location_keywords.slice(0, 3)
  }
  let n = 0
  for (const [placeId, { fields, ref }] of Object.entries(scalars)) {
    const candidates = Object.entries(fields).map(([field, value]) => ({
      field, value, sourceType: "trusted_locator_source" as const, sourceReference: ref,
      verificationStatus: "verified" as const, checkedAt: nowIso,
    }))
    const res = await enrichProperty(store, { placeId, jobId: JOB, fields: candidates, dryRun: DRY })
    for (const fr of res.results) {
      if (fr.outcome === "written" || fr.outcome === "would_write") bump("catalog_fields_written")
      else if (fr.reason.startsWith("conflict")) bump("catalog_conflicts")
      else bump("catalog_fields_skipped")
    }
    if (++n % 150 === 0) console.log(`  [2] catalog ${n}/${Object.keys(scalars).length}`)
  }
  console.log(`[2] catalog: written=${tally.catalog_fields_written ?? 0} skipped=${tally.catalog_fields_skipped ?? 0} conflicts=${tally.catalog_conflicts ?? 0}`)

  // 3) ATTRIBUTES (features) with applicability.
  for (const r of read("attributes.jsonl")) {
    const attributes = r.attrs.map((a: Record<string, unknown>) => ({
      attributeKey: a.attributeKey, value: a.value, valueText: a.valueText, applicability: a.applicability,
      sourceType: "trusted_locator_source" as const, sourceReference: r.ref,
      verificationStatus: "verified" as const, checkedAt: nowIso,
    }))
    const res = await writeAttributes(store, { placeId: r.place_id, jobId: JOB, attributes, dryRun: DRY })
    for (const ar of res.results) {
      if (ar.outcome === "written" || ar.outcome === "would_write") bump("attrs_written")
      else if (ar.reason.startsWith("conflict")) bump("attr_conflicts")
      else bump("attrs_skipped")
    }
  }
  console.log(`[3] attributes: written=${tally.attrs_written ?? 0} skipped=${tally.attrs_skipped ?? 0} conflicts=${tally.attr_conflicts ?? 0}`)

  // 4) MANAGEMENT companies → entity + catalog link (fill-empty).
  const seenMgmt = new Set<string>()
  for (const r of read("mgmt.jsonl")) {
    if (DRY) { bump("mgmt_linked"); continue }
    const id = await upsertManagementCompany(r.name)
    if (id) {
      await enrichProperty(store, { placeId: r.place_id, jobId: JOB, fields: [
        { field: "management_company_id", value: id, sourceType: "trusted_locator_source", sourceReference: r.name, verificationStatus: "verified", checkedAt: nowIso },
        { field: "management_company", value: r.name, sourceType: "trusted_locator_source", sourceReference: r.name, verificationStatus: "verified", checkedAt: nowIso },
      ], dryRun: false })
      if (!seenMgmt.has(r.name)) { seenMgmt.add(r.name); bump("mgmt_companies") }
      bump("mgmt_linked")
    }
  }
  console.log(`[4] management: companies=${tally.mgmt_companies ?? 0} linked=${tally.mgmt_linked ?? 0}`)

  // 5) SPECIALS (parsed, time-sensitive).
  for (const r of read("specials.jsonl")) {
    const cands: Record<string, { value: unknown; sourceType: "trusted_locator_source"; sourceReference: string; verificationStatus: "verified"; checkedAt: string }> = {}
    for (const [f, v] of Object.entries(r.fields)) cands[f] = { value: v, sourceType: "trusted_locator_source", sourceReference: r.ref, verificationStatus: "verified", checkedAt: nowIso }
    cands.special_last_verified = { value: nowIso.slice(0, 10), sourceType: "trusted_locator_source", sourceReference: r.ref, verificationStatus: "verified", checkedAt: nowIso }
    const res = await writeWideRow("property_specials", r.place_id, cands, { jobId: JOB, eventPrefix: "special", dryRun: DRY })
    bump("specials_fields_written", res.written.length); if (res.written.length) bump("specials_rows")
    bump("specials_conflicts", res.conflicts.length)
  }
  console.log(`[5] specials: rows=${tally.specials_rows ?? 0} fields=${tally.specials_fields_written ?? 0} conflicts=${tally.specials_conflicts ?? 0}`)

  // 6) APPROVAL / qualification (Bad Credit + SpecialPrograms). Route affordable/bills to catalog.
  for (const r of read("approval.jsonl")) {
    const verif = r.fields.approval_confidence_status === "verified" ? "verified" as const : "inferred" as const
    const appr: Record<string, { value: unknown; sourceType: "manual_verified"; sourceReference: string; verificationStatus: "verified" | "inferred"; checkedAt: string }> = {}
    const catFields: { field: string; value: unknown }[] = []
    for (const [f, v] of Object.entries(r.fields)) {
      if (f === "affordable_program") catFields.push({ field: "affordable_program", value: v })
      else if (f === "__bills_paid") catFields.push({ field: "all_bills_paid", value: v })
      else appr[f] = { value: v, sourceType: "manual_verified", sourceReference: r.source, verificationStatus: verif, checkedAt: nowIso }
    }
    if (Object.keys(appr).length) {
      const res = await writeWideRow("property_approval_policy", r.place_id, appr, { jobId: JOB, eventPrefix: "approval", dryRun: DRY })
      bump("approval_fields_written", res.written.length); if (res.written.length) bump("approval_rows")
      bump("approval_conflicts", res.conflicts.length)
    }
    if (catFields.length) {
      await enrichProperty(store, { placeId: r.place_id, jobId: JOB, fields: catFields.map((c) => ({ ...c, sourceType: "trusted_locator_source" as const, sourceReference: r.source, verificationStatus: "verified" as const, checkedAt: nowIso })), dryRun: DRY })
      bump("approval_affordable_to_catalog", catFields.length)
    }
  }
  console.log(`[6] approval: rows=${tally.approval_rows ?? 0} fields=${tally.approval_fields_written ?? 0} conflicts=${tally.approval_conflicts ?? 0} affordable→catalog=${tally.approval_affordable_to_catalog ?? 0}`)

  const ambiguous = read("ambiguous.jsonl").length
  console.log(`\n${DRY ? "[DRY] " : ""}IMPORT DONE`)
  console.log(JSON.stringify({ ...tally, ambiguous_qualification_cells: ambiguous }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
