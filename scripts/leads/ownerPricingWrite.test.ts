/**
 * Owner-only property pricing — the WRITE path.
 *
 * Exercises the REAL writer (lib/propertyEnrichment/writer.ts) against the in-memory store.
 * No database, no network.
 *
 *   npx tsx scripts/leads/ownerPricingWrite.test.ts
 *
 * The point of this suite is not that an owner correction works — it is that the exception
 * which makes it work is NARROW. Every gate (the explicit flag, the source type, the field
 * set, the commission firewall) is asserted with a control proving preserve-by-default is
 * still in force for everything else.
 */
import { enrichProperty } from "@/lib/propertyEnrichment/writer"
import { InMemoryEnrichmentStore } from "@/lib/propertyEnrichment/sim/inMemoryStore"
import type { FieldCandidate, ImageSelectionState } from "@/lib/propertyEnrichment/types"

let pass = 0
let fail = 0
const ok = (cond: boolean, msg: string, detail = "") => {
  if (cond) { pass++; console.log("  ✓ " + msg) } else { fail++; console.log(`  ✗ ${msg}${detail ? ` — ${detail}` : ""}`) }
}
const section = (t: string) => console.log("\n" + t)

const PID = "ChIJownerpricing"

/** An owner correction exactly as the route builds it. */
function owner(field: string, value: unknown, verification: FieldCandidate["verificationStatus"], sourceRef: string | null = null): FieldCandidate {
  return { field, value, sourceType: "manual_verified", verificationStatus: verification, sourceReference: sourceRef, ownerOverride: true }
}
function store(values: Record<string, unknown> = {}, imageState: ImageSelectionState = "keep") {
  const s = new InMemoryEnrichmentStore()
  s.seedProperty(PID, values, imageState)
  return s
}
const r = (res: Awaited<ReturnType<typeof enrichProperty>>, field: string) => res.results.find((x) => x.field === field)!
const ev = (s: InMemoryEnrichmentStore, field: string) => s.events.filter((e) => e.fieldName === field && e.jobId !== "seed").pop()!

async function main() {
  section("1. owner fills an EMPTY price")
  {
    const s = store({ onebr_starting_rent: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "o1", fields: [owner("onebr_starting_rent", 1350, "verified", "https://x.com/floorplans")] })
    ok(r(res, "onebr_starting_rent").outcome === "written", "written")
    ok(s.get(PID)!.values.onebr_starting_rent === 1350, "value persisted")
  }

  section("2. owner CORRECTS a populated price (the whole point of the editor)")
  {
    const s = store({ twobr_starting_rent: 1400 })
    const res = await enrichProperty(s, { placeId: PID, jobId: "o2", fields: [owner("twobr_starting_rent", 1525, "verified", "https://x.com/floorplans")] })
    const got = r(res, "twobr_starting_rent")
    ok(got.outcome === "written", "written over an existing value", got.reason)
    ok(got.reason.startsWith("owner_correction"), `reason is an owner correction (${got.reason})`)
    ok(s.get(PID)!.values.twobr_starting_rent === 1525, "new value persisted")

    section("   …and the audit records previous value, new value, source and timestamp")
    const e = ev(s, "twobr_starting_rent")
    ok(e.oldValue === "1400", `oldValue recorded (${e.oldValue})`)
    ok(e.newValue === "1525", `newValue recorded (${e.newValue})`)
    ok(e.sourceType === "manual_verified", "sourceType recorded")
    ok(e.sourceReference === "https://x.com/floorplans", "sourceReference recorded")
    ok(e.action === "written", "action recorded as written")
  }

  section("3. GATE — the SAME write without the explicit flag is preserved")
  {
    const s = store({ twobr_starting_rent: 1400 })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "o3",
      fields: [{ field: "twobr_starting_rent", value: 1525, sourceType: "manual_verified", verificationStatus: "verified" }],
    })
    const got = r(res, "twobr_starting_rent")
    ok(got.outcome === "skipped", "skipped without ownerOverride", got.reason)
    ok(s.get(PID)!.values.twobr_starting_rent === 1400, "original value intact")
  }

  section("4. GATE — the flag does NOT work for a non-manual source")
  {
    for (const src of ["public_web", "google_places", "official_property_site"] as const) {
      const s = store({ twobr_starting_rent: 1400 })
      const res = await enrichProperty(s, {
        placeId: PID, jobId: "o4",
        fields: [{ field: "twobr_starting_rent", value: 1525, sourceType: src, verificationStatus: "verified", ownerOverride: true }],
      })
      ok(r(res, "twobr_starting_rent").outcome === "skipped", `${src} + flag is still preserved`)
      ok(s.get(PID)!.values.twobr_starting_rent === 1400, `${src} left the value intact`)
    }
  }

  section("5. GATE — the flag does NOT widen to non-pricing fields")
  {
    for (const f of ["property_name", "website_url", "neighborhood", "amenity_keywords"]) {
      const s = store({ [f]: "existing value" })
      const res = await enrichProperty(s, { placeId: PID, jobId: "o5", fields: [owner(f, "replacement", "verified", "https://x.com")] })
      ok(r(res, f).outcome === "skipped", `${f} preserved despite the flag`, r(res, f).reason)
      ok(s.get(PID)!.values[f] === "existing value", `${f} value intact`)
    }
  }

  section("6. GATE — commission is still rejected by the firewall, flag or not")
  {
    for (const f of ["send_commission", "escort_commission", "bonus_flat"]) {
      const s = store({ [f]: "50%" })
      const res = await enrichProperty(s, { placeId: PID, jobId: "o6", fields: [owner(f, "100%", "verified", "https://x.com")] })
      ok(r(res, f).outcome === "rejected", `${f} REJECTED`, r(res, f).reason)
      ok(s.get(PID)!.values[f] === "50%", `${f} value intact`)
    }
  }

  section("7. preserve-by-default is UNCHANGED for automated enrichment")
  {
    const s = store({ twobr_starting_rent: 1400 })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "o7",
      fields: [{ field: "twobr_starting_rent", value: 1525, sourceType: "official_property_site", verificationStatus: "verified", sourceReference: "https://x.com" }],
    })
    ok(r(res, "twobr_starting_rent").outcome === "skipped", "an automated verified pass still cannot replace a price", r(res, "twobr_starting_rent").reason)
    ok(s.get(PID)!.values.twobr_starting_rent === 1400, "value intact")
  }

  section("8. LABEL HONESTY — an owner value with no source is not promoted to verified")
  {
    const s = store({ onebr_starting_rent: 1200 })
    const res = await enrichProperty(s, { placeId: PID, jobId: "o8", fields: [owner("onebr_starting_rent", 1250, "inferred", null)] })
    ok(r(res, "onebr_starting_rent").outcome === "written", "an unsourced owner correction still writes")
    const e = ev(s, "onebr_starting_rent")
    ok(e.verificationStatus === "inferred", `recorded as inferred, NOT verified (${e.verificationStatus})`)
    ok(r(res, "onebr_starting_rent").reason === "owner_correction_inferred", `reason names the status (${r(res, "onebr_starting_rent").reason})`)
  }

  section("9. PARTIAL SAVE — writing 1BR does not touch 2BR or 3BR")
  {
    const s = store({ onebr_starting_rent: null, twobr_starting_rent: 1400, threebr_starting_rent: 1850 })
    await enrichProperty(s, { placeId: PID, jobId: "o9", fields: [owner("onebr_starting_rent", 1350, "verified", "https://x.com")] })
    const v = s.get(PID)!.values
    ok(v.onebr_starting_rent === 1350, "1BR written")
    ok(v.twobr_starting_rent === 1400, "2BR untouched")
    ok(v.threebr_starting_rent === 1850, "3BR untouched")
  }

  section("10. A CLEARED FIELD NEVER NULLS AN EXISTING PRICE")
  {
    const s = store({ twobr_starting_rent: 1400 })
    const res = await enrichProperty(s, { placeId: PID, jobId: "o10", fields: [owner("twobr_starting_rent", null, "verified", "https://x.com")] })
    ok(r(res, "twobr_starting_rent").outcome === "skipped", "null candidate skipped", r(res, "twobr_starting_rent").reason)
    ok(r(res, "twobr_starting_rent").reason === "no_value", "reason is no_value")
    ok(s.get(PID)!.values.twobr_starting_rent === 1400, "existing price survives an empty input")
  }

  section("11. idempotent — resaving the same price is a no-op")
  {
    const s = store({ twobr_starting_rent: 1400 })
    const res = await enrichProperty(s, { placeId: PID, jobId: "o11", fields: [owner("twobr_starting_rent", 1400, "verified", "https://x.com")] })
    ok(r(res, "twobr_starting_rent").outcome === "skipped", "unchanged value is not rewritten", r(res, "twobr_starting_rent").reason)
    ok(s.applyPatchCalls === 0, "no patch issued at all")
  }

  section("12. specials and the checked date travel with the same correction")
  {
    const s = store({ current_special: "1 month free", pricing_last_verified: null })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "o12",
      fields: [owner("current_special", "2 months free", "verified", "https://x.com"), owner("pricing_last_verified", "2026-10-19", "verified", "https://x.com")],
    })
    ok(r(res, "current_special").outcome === "written", "special corrected", r(res, "current_special").reason)
    ok(r(res, "pricing_last_verified").outcome === "written", "date checked written")
    ok(s.get(PID)!.values.current_special_checked_at != null, "writer coupled the special freshness stamp automatically")
  }

  section("13. an unknown property is never guessed at")
  {
    const s = store({})
    const res = await enrichProperty(s, { placeId: "ChIJnotinthecatalog", jobId: "o13", fields: [owner("onebr_starting_rent", 1350, "verified", "https://x.com")] })
    ok(res.results.every((x) => x.outcome === "rejected" && x.reason === "property_not_found"), "rejected as property_not_found")
    ok(s.applyPatchCalls === 0, "nothing written anywhere")
  }

  console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
