/**
 * Property Search Agent — safe enrichment write foundation tests.
 *
 * Exercises the REAL writer (lib/propertyEnrichment/writer.ts) against the
 * in-memory store — no DB, no network. Proves provenance, PATCH-only safety,
 * commission firewall, and image persistence.
 *
 *   npx tsx scripts/tests/property-enrichment.test.ts
 */
import { enrichProperty } from "@/lib/propertyEnrichment/writer"
import { InMemoryEnrichmentStore } from "@/lib/propertyEnrichment/sim/inMemoryStore"
import type { FieldCandidate, ImageSelectionState } from "@/lib/propertyEnrichment/types"

let pass = 0
let fail = 0
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓ " + msg) } else { fail++; console.log("  ✗ " + msg) }
}
function section(t: string) { console.log("\n" + t) }

const PID = "ChIJtest0001"
function cand(field: string, value: unknown, sourceType: FieldCandidate["sourceType"], verificationStatus: FieldCandidate["verificationStatus"], sourceReference?: string): FieldCandidate {
  return { field, value, sourceType, verificationStatus, sourceReference }
}
function store(values: Record<string, unknown> = {}, imageState: ImageSelectionState = "keep", placeId = PID) {
  const s = new InMemoryEnrichmentStore()
  s.seedProperty(placeId, values, imageState)
  return s
}
const r = (res: Awaited<ReturnType<typeof enrichProperty>>, field: string) => res.results.find((x) => x.field === field)!

async function main() {
  // 1
  section("1. missing field populated from an approved verified source")
  {
    const s = store({ leasing_email: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j1", fields: [cand("leasing_email", "lease@x.com", "official_property_site", "verified", "https://x.com/contact")] })
    ok(r(res, "leasing_email").outcome === "written", "leasing_email written")
    ok(s.get(PID)!.values.leasing_email === "lease@x.com", "value persisted")
  }

  // 2
  section("2. unrelated fields remain untouched")
  {
    const s = store({ leasing_email: null, phone: "(210) 555-1212" })
    await enrichProperty(s, { placeId: PID, jobId: "j2", fields: [cand("leasing_email", "lease@x.com", "official_property_site", "verified")] })
    ok(s.get(PID)!.values.phone === "(210) 555-1212", "phone untouched")
  }

  // 3
  section("3. verified existing value is preserved (non-authoritative candidate)")
  {
    const s = store({ management_company: "Existing Mgmt" })
    s.putProvenance(PID, "management_company", { sourceType: "official_property_site", verificationStatus: "verified", value: "Existing Mgmt" })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j3", fields: [cand("management_company", "Other Mgmt", "public_web", "verified")] })
    ok(r(res, "management_company").outcome === "skipped" && r(res, "management_company").reason === "preserve_verified", "skipped preserve_verified")
    ok(s.get(PID)!.values.management_company === "Existing Mgmt", "verified value preserved")
  }

  // 4
  section("4. unknown result produces no write")
  {
    const s = store({ market: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j4", fields: [cand("market", null, "official_property_site", "verified")] })
    ok(r(res, "market").outcome === "skipped" && r(res, "market").reason === "no_value", "no_value skip")
    ok(s.applyPatchCalls === 0, "no DB patch attempted")
  }

  // 5
  section("5. identical rerun is idempotent")
  {
    const s = store({ market: null })
    const c = cand("market", "Austin", "official_property_site", "verified")
    await enrichProperty(s, { placeId: PID, jobId: "j5a", fields: [c] })
    const res2 = await enrichProperty(s, { placeId: PID, jobId: "j5b", fields: [c] })
    ok(r(res2, "market").reason === "unchanged", "second run unchanged")
    ok(s.applyPatchCalls === 1, "only the first run mutated (idempotent)")
  }

  // 6
  section("6. conflicting update is skipped/reported")
  {
    const s = store({ management_company: "A Co" })
    s.putProvenance(PID, "management_company", { sourceType: "official_property_site", verificationStatus: "verified", value: "A Co" })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j6", fields: [cand("management_company", "B Co", "official_property_site", "verified")] })
    ok(r(res, "management_company").outcome === "skipped" && r(res, "management_company").reason === "conflict_verified", "conflict skipped, not auto-chosen")
    ok(s.get(PID)!.values.management_company === "A Co", "existing verified kept on conflict")
  }

  // 7-9
  section("7–9. public-web commission writes are REJECTED (firewall)")
  for (const f of ["send_commission", "escort_commission", "bonus_flat"]) {
    const s = store({ [f]: "100%" })
    const res = await enrichProperty(s, { placeId: PID, jobId: "jc", fields: [cand(f, "150%", "public_web", "verified")] })
    ok(r(res, f).outcome === "rejected" && r(res, f).reason === "commission_firewall_public_web", `${f} rejected by firewall`)
    ok(s.get(PID)!.values[f] === "100%", `${f} value unchanged`)
    ok(!s.writtenEventFields().includes(f), `${f} no written provenance`)
  }

  // 10
  section("10. provenance/history recorded for successful writes")
  {
    const s = store({ market: null })
    await enrichProperty(s, { placeId: PID, jobId: "j10", fields: [cand("market", "Dallas", "official_property_site", "verified", "https://x.com/about")] })
    const ev = s.events.find((e) => e.fieldName === "market" && e.action === "written")
    ok(!!ev && ev.sourceType === "official_property_site" && ev.verificationStatus === "verified" && ev.jobId === "j10", "written event with full provenance")
  }

  // 11
  section("11. rejected/skipped writes do NOT record successful provenance")
  {
    const s = store({ send_commission: "100%", market: "Houston" })
    s.putProvenance(PID, "market", { sourceType: "official_property_site", verificationStatus: "verified", value: "Houston" })
    await enrichProperty(s, { placeId: PID, jobId: "j11", fields: [
      cand("send_commission", "150%", "public_web", "verified"),
      cand("market", "Waco", "public_web", "verified"),
    ] })
    ok(!s.writtenEventFields().includes("send_commission"), "commission never in written provenance")
    // market had a prior seeded 'written' (verified) but this attempt was a skip; ensure no NEW written event from j11.
    ok(!s.events.some((e) => e.jobId === "j11" && e.action === "written"), "no false written event from the skipped/rejected job")
  }

  // 12
  section("12. dry-run performs zero DB mutation")
  {
    const s = store({ market: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j12", dryRun: true, fields: [cand("market", "El Paso", "official_property_site", "verified")] })
    ok(r(res, "market").outcome === "would_write", "reports would_write")
    ok(s.applyPatchCalls === 0 && s.events.length === 0, "no patch, no events written")
    ok(s.get(PID)!.values.market === null, "value unchanged")
  }

  // 13
  section("13. Google Places provenance uses a Place ID (no webpage URL required)")
  {
    const s = store({ google_rating: null })
    await enrichProperty(s, { placeId: PID, jobId: "j13", fields: [cand("google_rating", 4.5, "google_places", "verified", PID /* Place ID, not a URL */)] })
    const ev = s.events.find((e) => e.fieldName === "google_rating" && e.action === "written")
    ok(!!ev && ev.sourceType === "google_places" && ev.sourceReference === PID && !String(ev.sourceReference).startsWith("http"), "Place ID stored as source_reference, no URL required")
  }

  // 14
  section("14. official-property-site provenance preserves the specific page URL")
  {
    const s = store({ leasing_email: null })
    const url = "https://theproperty.com/contact-us"
    await enrichProperty(s, { placeId: PID, jobId: "j14", fields: [cand("leasing_email", "lease@p.com", "official_property_site", "verified", url)] })
    const ev = s.events.find((e) => e.fieldName === "leasing_email" && e.action === "written")
    ok(!!ev && ev.sourceReference === url, "specific official page URL preserved")
  }

  // 15
  section("15. trusted/internal provenance uses a non-URL source identifier")
  {
    const s = store({ management_company: null })
    await enrichProperty(s, { placeId: PID, jobId: "j15", fields: [cand("management_company", "Willow Bridge", "trusted_locator_source", "verified", "LB-INTEL-4471")] })
    const ev = s.events.find((e) => e.fieldName === "management_company" && e.action === "written")
    ok(!!ev && ev.sourceReference === "LB-INTEL-4471" && !String(ev.sourceReference).startsWith("http"), "internal source id accepted (non-URL)")
  }

  // 16 — LEGACY PRESERVATION (populated legacy values are preserved by default)
  section("16. populated legacy value (no field-level provenance) is PRESERVED")
  {
    const s = store({ management_company: "Legacy Value" }) // populated, NO provenance event
    const prov0 = await s.currentProvenance(PID)
    ok(Object.keys(prov0).length === 0, "no fabricated provenance exists for legacy value (10)")
    // A verified + authoritative candidate must NOT auto-replace it → surfaced as conflict.
    const res = await enrichProperty(s, { placeId: PID, jobId: "j16", fields: [cand("management_company", "Researched Mgmt", "official_property_site", "verified")] })
    ok(r(res, "management_company").outcome === "skipped", "legacy value NOT auto-replaced (1,2)")
    ok(r(res, "management_company").reason === "conflict_legacy", "conflict surfaced/reported (3)")
    ok(s.get(PID)!.values.management_company === "Legacy Value", "legacy value preserved")
    ok(!s.writtenEventFields().includes("management_company"), "no fabricated written provenance created (10)")
  }

  section("16b. non-authoritative candidate against a populated legacy value → preserve")
  {
    const s = store({ property_name: "Legacy Name" })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j16b", fields: [cand("property_name", "Web Name", "public_web", "verified")] })
    ok(r(res, "property_name").reason === "preserve_legacy", "public-web cannot replace populated legacy value")
    ok(s.get(PID)!.values.property_name === "Legacy Name", "legacy name preserved")
  }

  section("16c. EMPTY field on a legacy property remains eligible for enrichment")
  {
    // A legacy property: some fields populated (no provenance), the target field empty.
    const s = store({ management_company: "Legacy Mgmt", leasing_email: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "j16c", fields: [
      cand("leasing_email", "lease@site.com", "official_property_site", "verified"),
      cand("management_company", "New Mgmt", "official_property_site", "verified"),
    ] })
    ok(r(res, "leasing_email").outcome === "written", "empty field on a legacy property is enriched (4)")
    ok(r(res, "management_company").reason === "conflict_legacy", "populated legacy field still preserved on same run")
    ok(s.get(PID)!.values.management_company === "Legacy Mgmt", "legacy populated field untouched")
  }

  // ── Image persistence ──────────────────────────────────────────────────────
  const IMG = "property_image_url"
  // 17
  section("17. KEEP → no image write")
  {
    const s = store({ [IMG]: "https://existing.jpg" }, "keep")
    const res = await enrichProperty(s, { placeId: PID, jobId: "i17", fields: [cand(IMG, "https://new.jpg", "official_property_site", "verified")] })
    ok(r(res, IMG).outcome === "rejected" && r(res, IMG).reason === "image_locked_keep", "image write rejected under KEEP")
    ok(s.get(PID)!.values[IMG] === "https://existing.jpg", "image unchanged")
  }

  // 18
  section("18. KEEP + other missing fields → others enrich, image unchanged")
  {
    const s = store({ [IMG]: "https://existing.jpg", leasing_email: null }, "keep")
    const res = await enrichProperty(s, { placeId: PID, jobId: "i18", fields: [
      cand(IMG, "https://new.jpg", "official_property_site", "verified"),
      cand("leasing_email", "lease@x.com", "official_property_site", "verified"),
    ] })
    ok(r(res, "leasing_email").outcome === "written", "other field enriched")
    ok(r(res, IMG).outcome === "rejected" && s.get(PID)!.values[IMG] === "https://existing.jpg", "image untouched")
  }

  // 19
  section("19. KEEP + higher-scoring image → unchanged")
  {
    const s = store({ [IMG]: "https://existing.jpg" }, "keep")
    await enrichProperty(s, { placeId: PID, jobId: "i19", fields: [cand(IMG, "https://better-scoring.jpg", "official_property_site", "verified")] })
    ok(s.get(PID)!.values[IMG] === "https://existing.jpg", "better image does not override KEEP")
  }

  // 20
  section("20. repeated runs → image unchanged")
  {
    const s = store({ [IMG]: "https://existing.jpg" }, "keep")
    for (const j of ["a", "b", "c"]) await enrichProperty(s, { placeId: PID, jobId: "i20" + j, fields: [cand(IMG, "https://x.jpg", "official_property_site", "verified")] })
    ok(s.get(PID)!.values[IMG] === "https://existing.jpg", "image stable across runs")
  }

  // 21
  section("21. normal Property Search (no image candidate) → image unchanged")
  {
    const s = store({ [IMG]: "https://existing.jpg", market: null }, "keep")
    await enrichProperty(s, { placeId: PID, jobId: "i21", fields: [cand("market", "San Antonio", "official_property_site", "verified")] })
    ok(s.get(PID)!.values[IMG] === "https://existing.jpg", "image unchanged by unrelated enrichment")
  }

  // 22 & 23
  section("22–23. MISSING → eligible; success persists + state becomes KEEP")
  {
    const s = store({ [IMG]: null }, "missing")
    const res = await enrichProperty(s, { placeId: PID, jobId: "i22", fields: [cand(IMG, "https://found.jpg", "official_property_site", "verified", "https://site/gallery")] })
    ok(r(res, IMG).outcome === "written", "MISSING → image write eligible")
    ok(s.get(PID)!.values[IMG] === "https://found.jpg", "image persisted")
    ok(s.get(PID)!.imageSelectionState === "keep", "state transitioned to KEEP")
  }

  // 24 & 25
  section("24–25. CHANGE_REQUESTED → eligible; success persists + returns to KEEP")
  {
    const s = store({ [IMG]: "https://old.jpg" }, "change_requested")
    const res = await enrichProperty(s, { placeId: PID, jobId: "i24", fields: [cand(IMG, "https://replacement.jpg", "official_property_site", "verified")] })
    ok(r(res, IMG).outcome === "written", "CHANGE_REQUESTED → replacement eligible")
    ok(s.get(PID)!.values[IMG] === "https://replacement.jpg", "replacement persisted")
    ok(s.get(PID)!.imageSelectionState === "keep", "state returned to KEEP")
  }

  // 26
  section("26. subsequent enrichment after replacement → unchanged")
  {
    const s = store({ [IMG]: "https://old.jpg" }, "change_requested")
    await enrichProperty(s, { placeId: PID, jobId: "i26a", fields: [cand(IMG, "https://replacement.jpg", "official_property_site", "verified")] })
    await enrichProperty(s, { placeId: PID, jobId: "i26b", fields: [cand(IMG, "https://another.jpg", "official_property_site", "verified")] })
    ok(s.get(PID)!.values[IMG] === "https://replacement.jpg", "replacement stable on next run (now KEEP)")
  }

  // 27
  section("27. marking one CHANGE_REQUESTED does not make others eligible")
  {
    const s = new InMemoryEnrichmentStore()
    s.seedProperty("A", { [IMG]: "https://a.jpg" }, "change_requested")
    s.seedProperty("B", { [IMG]: "https://b.jpg" }, "keep")
    await enrichProperty(s, { placeId: "A", jobId: "i27a", fields: [cand(IMG, "https://a-new.jpg", "official_property_site", "verified")] })
    const resB = await enrichProperty(s, { placeId: "B", jobId: "i27b", fields: [cand(IMG, "https://b-new.jpg", "official_property_site", "verified")] })
    ok(s.get("A")!.values[IMG] === "https://a-new.jpg", "A (change_requested) replaced")
    ok(resB.results[0].outcome === "rejected" && s.get("B")!.values[IMG] === "https://b.jpg", "B (keep) untouched")
  }

  // 28
  section("28. unreachable accepted image is flagged, not silently rotated")
  {
    const s = store({ [IMG]: "https://broken.jpg", property_image_status: "unreachable", market: null }, "keep")
    await enrichProperty(s, { placeId: PID, jobId: "i28", fields: [
      cand("market", "San Antonio", "official_property_site", "verified"), // unrelated enrichment proceeds
      cand(IMG, "https://replacement.jpg", "official_property_site", "verified"), // must NOT rotate
    ] })
    ok(s.get(PID)!.values[IMG] === "https://broken.jpg", "unreachable image NOT silently rotated")
    ok(s.get(PID)!.values.property_image_status === "unreachable", "technical health flag preserved")
    ok(s.get(PID)!.values.market === "San Antonio", "unrelated field still enriched")
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
