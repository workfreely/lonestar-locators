// Apply qualification identity-resolution results. ACCEPTED + in catalog → attach to
// property_approval_policy (preserve caveat). ACCEPTED + not in catalog → route to
// property_review_candidates (qualification-research discovery) and RETAIN the research
// in property_qualification_review (do NOT auto-admit). Ambiguous/no-match → stay pending.
// Records a durable ledger. Idempotent. Run: npx tsx scripts/propertyIntel/qual_apply.ts [--dry]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const line of fs.readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const DRY = process.argv.includes("--dry")
const JOB = "qual_resolution_2026_09_25"

// criterion label → approval-policy field + value + optional note field
const MAP: Record<string, { field: string; value: string; note?: string }> = {
  "Bad Credit": { field: "credit_flexibility", value: "Flexible", note: "credit_score_notes" },
  "550 Credit Score or Lower ": { field: "credit_flexibility", value: "Very Flexible", note: "credit_score_notes" },
  "Broken Lease": { field: "broken_lease_policy", value: "Conditional", note: "broken_lease_notes" },
  "Eviction": { field: "eviction_policy", value: "Conditional", note: "eviction_notes" },
  "Repo": { field: "repo_flexibility", value: "Flexible" },
  "Felony * Confirm based on charge": { field: "felony_policy", value: "Case-by-Case", note: "felony_restrictions" },
  "Misdemeanor": { field: "misdemeanor_policy", value: "Case-by-Case", note: "misdemeanor_restrictions" },
  "Same Day Move-in": { field: "same_day_move_in", value: "Yes" },
  "Takes Letters/Bank Statements": { field: "bank_statements_accepted", value: "Yes" },
  "Will take unemployment as income": { field: "alternative_income_accepted", value: "Yes" },
  "Matricula/Mexica ID Card/ VISA Passport/No SS#": { field: "no_ssn_accepted", value: "Yes" },
}
const AFFORDABLE: Record<string, string> = {
  "Section 8 - Low Income Properties ": "section_8", "Essential Housing Programs": "essential_housing",
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { writeWideRow } = await import("@/lib/propertyIntel/wideWriter")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store = new SupabaseEnrichmentStore()
  const now = new Date().toISOString()
  const recs = fs.readFileSync(`${S}/qual_resolution.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  const t: Record<string, number> = {}; const bump = (k: string, n = 1) => (t[k] = (t[k] ?? 0) + n)

  for (const r of recs) {
    // Durable ledger row for every attempt.
    if (!DRY) await supabaseAdmin.from("property_place_id_resolution").insert({
      batch_label: JOB, source_file: (r.source_files?.[0] ?? "bad_credit"), source_row_id: `qual:${r.name}`.slice(0, 200),
      market: r.market, source_name: r.name, place_id: r.place_id ?? null,
      google_name: r.gname ?? null, google_address: r.gaddr ?? null, latitude: r.lat ?? null, longitude: r.lng ?? null,
      classification: r.classification, reason: r.reason ?? null, sku_tier: "Pro",
    }).then(() => {}, () => {}) // ignore unique-conflict on re-run

    if (r.classification !== "ACCEPTED_HIGH_CONFIDENCE") {
      if (!DRY) await supabaseAdmin.from("property_qualification_review").update({
        match_confidence: r.classification === "AMBIGUOUS_MULTIPLE_MATCHES" ? "weak" : "none",
        match_evidence: `google:${r.classification}${r.reason ? " — " + r.reason : ""}`,
      }).in("id", r.ids)
      bump(r.classification.toLowerCase()); continue
    }

    bump("accepted")
    // Build approval fields + affordable flags from this property's criteria.
    const appr: Record<string, { value: unknown; sourceType: "manual_verified"; sourceReference: string; verificationStatus: "verified" | "inferred"; checkedAt: string }> = {}
    const affordable = new Set<string>()
    for (const c of r.criteria as { criterion: string; value: string }[]) {
      const m = MAP[c.criterion]
      if (m) {
        appr[m.field] = { value: m.value, sourceType: "manual_verified", sourceReference: (r.source_files?.[0] ?? "bad_credit"), verificationStatus: "inferred", checkedAt: now }
        if (m.note && (c.value.includes("\n") || c.value.length > 20)) appr[m.note] = { value: c.value, sourceType: "manual_verified", sourceReference: (r.source_files?.[0] ?? "bad_credit"), verificationStatus: "inferred", checkedAt: now }
        const num = /\b(4\d\d|5\d\d|6\d\d)\b/.exec(c.value)
        if (m.field === "credit_flexibility" && num) appr["min_credit_score_observed"] = { value: num[1], sourceType: "manual_verified", sourceReference: (r.source_files?.[0] ?? "bad_credit"), verificationStatus: "inferred", checkedAt: now }
      }
      if (AFFORDABLE[c.criterion]) affordable.add(AFFORDABLE[c.criterion])
    }
    appr["approval_priority_source"] = { value: "manual_locator", sourceType: "manual_verified", sourceReference: "bad_credit", verificationStatus: "inferred", checkedAt: now }
    appr["approval_confidence_status"] = { value: "needs_research", sourceType: "manual_verified", sourceReference: "bad_credit", verificationStatus: "inferred", checkedAt: now }
    appr["approval_last_verified"] = { value: now.slice(0, 10), sourceType: "manual_verified", sourceReference: "bad_credit", verificationStatus: "inferred", checkedAt: now }

    if (r.in_catalog) {
      bump("accepted_in_catalog")
      if (!DRY) {
        const res = await writeWideRow("property_approval_policy", r.place_id, appr, { jobId: JOB, eventPrefix: "approval", dryRun: false })
        bump("approval_fields_written", res.written.length); if (res.written.length) bump("approval_policies_attached")
        if (affordable.size) await enrichProperty(store, { placeId: r.place_id, jobId: JOB, fields: [{ field: "affordable_program", value: [...affordable], sourceType: "trusted_locator_source", sourceReference: "bad_credit", verificationStatus: "verified", checkedAt: now }] })
        await supabaseAdmin.from("property_qualification_review").update({ status: "matched", matched_place_id: r.place_id, candidate_place_id: r.place_id, candidate_name: r.gname, match_confidence: "exact", match_evidence: `google name=${r.name_score}`, matched_at: now, matched_by: "google_resolution" }).in("id", r.ids)
      }
    } else {
      bump("accepted_not_in_catalog")
      if (!DRY) {
        // Route to review candidates as a qualification-research discovery (NOT auto-admitted).
        await supabaseAdmin.from("property_review_candidates").upsert({
          place_id: r.place_id, property_name: r.gname, formatted_address: r.gaddr, market: r.market,
          latitude: r.lat ?? null, longitude: r.lng ?? null, source_files: r.source_files ?? [],
          source_category: "qualification_research", review_status: "pending", locator_status: "unknown",
          resolution_evidence: { source: "bad_credit_qualification", name_score: r.name_score, criteria: (r.criteria || []).map((c: { criterion: string }) => c.criterion) },
          review_reason: "Discovered via qualification (Bad Credit) research; approval intelligence retained in property_qualification_review pending admission.",
        }, { onConflict: "place_id", ignoreDuplicates: true })
        // Retain research + link (do NOT write approval_policy — property not admitted).
        await supabaseAdmin.from("property_qualification_review").update({ status: "matched", matched_place_id: r.place_id, candidate_place_id: r.place_id, candidate_name: r.gname, match_confidence: "exact", match_evidence: `google name=${r.name_score} (not in catalog → review candidate)`, matched_at: now, matched_by: "google_resolution" }).in("id", r.ids)
        bump("review_candidates_created")
      }
    }
  }
  console.log(`${DRY ? "[DRY] " : ""}` + JSON.stringify(t, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
