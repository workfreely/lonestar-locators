// Structured-attribute (EAV) writer tests — run: npx tsx scripts/tests/property-attributes.test.ts
// Exercises the REAL writeAttributes + decideAttributeWrite via the in-memory store.

import { writeAttributes } from "@/lib/propertyEnrichment/attributes"
import { InMemoryEnrichmentStore } from "@/lib/propertyEnrichment/sim/inMemoryStore"
import type { AttributeCandidate } from "@/lib/propertyEnrichment/types"

let pass = 0
let fail = 0
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log("  ✓", label) } else { fail++; console.log("  ✗", label) }
}

const KEYS = {
  "views:skyline": { category: "views", valueKind: "tristate" as const },
  "residential_type:townhome": { category: "residential_type", valueKind: "tristate" as const },
  "parking:attached_garage": { category: "parking", valueKind: "tristate" as const },
  "building_style": { category: "building_style", valueKind: "text" as const },
}

function store() {
  const s = new InMemoryEnrichmentStore()
  s.seedAttributeKeys(KEYS)
  s.seedProperty("P1", {})
  return s
}
const src = (o: Partial<AttributeCandidate>): AttributeCandidate => ({
  attributeKey: "views:skyline", value: "yes", sourceType: "official_property_site", verificationStatus: "verified", ...o,
})

async function run() {
  // 1) unknown key rejected
  {
    const s = store()
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({ attributeKey: "views:mountain" })] })
    ok(r.results[0].outcome === "rejected" && r.results[0].reason === "unknown_attribute_key", "unknown attribute key rejected")
  }
  // 2) value_kind mismatch (text key given tristate value, no valueText) rejected
  {
    const s = store()
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [{ attributeKey: "building_style", value: "yes", sourceType: "manual_verified", verificationStatus: "verified" }] })
    ok(r.results[0].outcome === "rejected" && r.results[0].reason === "value_kind_mismatch", "text key without valueText rejected")
  }
  // 3) fill empty
  {
    const s = store()
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({})] })
    ok(r.results[0].outcome === "written" && r.results[0].reason === "fill_empty", "fill empty tristate")
    ok(s.getAttribute("P1", "views:skyline")?.value === "yes", "value persisted")
  }
  // 4) idempotent unchanged
  {
    const s = store()
    await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({})] })
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j2", attributes: [src({})] })
    ok(r.results[0].outcome === "skipped" && r.results[0].reason === "unchanged", "idempotent unchanged")
  }
  // 5) unverified candidate never fills
  {
    const s = store()
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({ verificationStatus: "unverified" })] })
    ok(r.results[0].outcome === "skipped" && r.results[0].reason === "candidate_unverified", "unverified never fills")
  }
  // 6) never downgrade known → unknown (Unknown != No)
  {
    const s = store()
    s.seedAttribute("P1", "views:skyline", { value: "yes", valueText: null, floorplanSpecific: false, sourceType: "manual_verified", verificationStatus: "verified", checkedAt: null })
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({ value: "unknown" })] })
    ok(r.results[0].outcome === "skipped" && r.results[0].reason === "preserve_known", "known not downgraded to unknown")
  }
  // 7) upgrade unknown → known
  {
    const s = store()
    s.seedAttribute("P1", "views:skyline", { value: "unknown", valueText: null, floorplanSpecific: false, sourceType: "official_property_site", verificationStatus: "verified", checkedAt: null })
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({ value: "yes" })] })
    ok(r.results[0].outcome === "written" && r.results[0].reason === "upgrade_from_unknown", "unknown upgraded to known")
  }
  // 8) verified conflict surfaced, not overwritten
  {
    const s = store()
    s.seedAttribute("P1", "views:skyline", { value: "no", valueText: null, floorplanSpecific: false, sourceType: "manual_verified", verificationStatus: "verified", checkedAt: null })
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({ value: "yes" })] })
    ok(r.results[0].outcome === "skipped" && r.results[0].reason === "conflict_verified", "verified disagreement → conflict")
    ok(s.getAttribute("P1", "views:skyline")?.value === "no", "verified value preserved on conflict")
  }
  // 9) floorplan-specific → universal promotion guarded (same value yes, existing fp-specific, candidate universal but only inferred)
  {
    const s = store()
    s.seedAttribute("P1", "residential_type:townhome", { value: "yes", valueText: null, floorplanSpecific: true, sourceType: "manual_verified", verificationStatus: "verified", checkedAt: null })
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [{ attributeKey: "residential_type:townhome", value: "yes", floorplanSpecific: false, sourceType: "official_property_site", verificationStatus: "inferred" }] })
    ok(r.results[0].outcome === "skipped" && r.results[0].reason === "preserve_floorplan_scope", "fp-specific→universal promotion blocked (not verified)")
    ok(s.getAttribute("P1", "residential_type:townhome")?.floorplanSpecific === true, "floorplan scope preserved")
  }
  // 10) narrowing universal → floorplan-specific allowed
  {
    const s = store()
    s.seedAttribute("P1", "residential_type:townhome", { value: "yes", valueText: null, floorplanSpecific: false, sourceType: "official_property_site", verificationStatus: "verified", checkedAt: null })
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [{ attributeKey: "residential_type:townhome", value: "yes", floorplanSpecific: true, sourceType: "official_property_site", verificationStatus: "verified" }] })
    ok(r.results[0].outcome === "written" && r.results[0].reason === "narrow_to_floorplan_specific", "universal→fp-specific narrowing allowed")
  }
  // 11) text key fill + conflict
  {
    const s = store()
    const r1 = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [{ attributeKey: "building_style", valueText: "High-Rise", sourceType: "manual_verified", verificationStatus: "verified" }] })
    ok(r1.results[0].outcome === "written" && r1.results[0].reason === "fill_empty", "text key fill_empty")
    const r2 = await writeAttributes(s, { placeId: "P1", jobId: "j2", attributes: [{ attributeKey: "building_style", valueText: "Garden-Style", sourceType: "official_property_site", verificationStatus: "verified" }] })
    ok(r2.results[0].outcome === "skipped" && r2.results[0].reason.startsWith("conflict_"), "text key verified conflict surfaced")
  }
  // 12) dry-run mutates nothing
  {
    const s = store()
    const r = await writeAttributes(s, { placeId: "P1", jobId: "j", attributes: [src({})], dryRun: true })
    ok(r.results[0].outcome === "would_write" && s.applyAttributesCalls === 0, "dry-run computes without writing")
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
run()
