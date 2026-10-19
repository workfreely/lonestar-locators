/**
 * Owner-only COMMISSION writing — the firewall's one exception.
 *
 *   npx tsx scripts/leads/commissionWrite.test.ts
 *
 * Exercises the REAL writer against the in-memory store. The exception exists because an owner
 * must be able to record a rate they verified; everything below is about how narrow it stays.
 *
 * THE CENTRAL ASSERTION is that `ownerOverride` ALONE grants nothing. It is a property of the
 * DATA — anything that can construct a candidate can set it. `ownerAuthorized` is a property of
 * the REQUEST, set only by a route that already ran requirePlatformAdmin(). Requiring both is
 * what stops a candidate from authorizing itself, so there is a test for each half missing.
 */
import { enrichProperty } from "@/lib/propertyEnrichment/writer"
import { InMemoryEnrichmentStore } from "@/lib/propertyEnrichment/sim/inMemoryStore"
import { ENRICHMENT_WRITABLE_FIELDS, OWNER_COMMISSION_FIELDS, COMMISSION_FIELDS } from "@/lib/propertyEnrichment/policy"
import type { FieldCandidate, SourceType, VerificationStatus } from "@/lib/propertyEnrichment/types"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log("  ✓ " + label) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const section = (t: string) => console.log("\n" + t)

const PID = "ChIJcommissiontest"
const store = (values: Record<string, unknown> = {}) => {
  const s = new InMemoryEnrichmentStore()
  s.seedProperty(PID, values, "keep")
  return s
}
const owner = (field: string, value: unknown, ref: string | null = "https://x.com/rates"): FieldCandidate =>
  ({ field, value, sourceType: "manual_verified", sourceReference: ref, verificationStatus: ref ? "verified" : "inferred", ownerOverride: true })
const r = (res: Awaited<ReturnType<typeof enrichProperty>>, f: string) => res.results.find((x) => x.field === f)!
const ev = (s: InMemoryEnrichmentStore, f: string) => s.events.filter((e) => e.fieldName === f && e.jobId !== "seed").pop()!

async function main() {
  section("1. AN AUTHORIZED OWNER CAN RECORD COMMISSION")
  {
    const s = store({ send_commission: null, escort_commission: null, bonus_flat: null })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "c1", ownerAuthorized: true,
      fields: [owner("send_commission", "0%"), owner("escort_commission", "100%"), owner("bonus_flat", "500")],
    })
    ok("send written", r(res, "send_commission").outcome === "written", r(res, "send_commission").reason)
    ok("escort written", r(res, "escort_commission").outcome === "written")
    ok("bonus written", r(res, "bonus_flat").outcome === "written")
    const v = s.get(PID)!.values
    ok("stored VERBATIM as text", v.send_commission === "0%" && v.escort_commission === "100%" && v.bonus_flat === "500",
      JSON.stringify([v.send_commission, v.escort_commission, v.bonus_flat]))
  }

  section("2. ownerOverride ALONE GRANTS NOTHING (no request authorization)")
  {
    for (const f of ["send_commission", "escort_commission", "bonus_flat"]) {
      const s = store({ [f]: null })
      // Identical candidate to test 1 — only ownerAuthorized is absent.
      const res = await enrichProperty(s, { placeId: PID, jobId: "c2", fields: [owner(f, "125%")] })
      ok(`${f} REJECTED without ownerAuthorized`, r(res, f).outcome === "rejected", r(res, f).reason)
      ok(`${f} unwritten`, s.get(PID)!.values[f] == null)
    }
    // …and explicitly false, not merely undefined.
    const s = store({ send_commission: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "c2b", ownerAuthorized: false, fields: [owner("send_commission", "125%")] })
    ok("ownerAuthorized:false is also a rejection", r(res, "send_commission").outcome === "rejected")
  }

  section("3. REQUEST AUTHORIZATION ALONE GRANTS NOTHING (no ownerOverride on the field)")
  {
    const s = store({ send_commission: null })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "c3", ownerAuthorized: true,
      fields: [{ field: "send_commission", value: "125%", sourceType: "manual_verified", verificationStatus: "verified" }],
    })
    ok("rejected without the field-level flag", r(res, "send_commission").outcome === "rejected", r(res, "send_commission").reason)
    ok("unwritten", s.get(PID)!.values.send_commission == null)
  }

  section("4. THE SOURCE MUST BE manual_verified, even for an authorized owner")
  {
    for (const src of ["public_web", "google_places", "official_property_site", "official_management_site", "trusted_locator_source", "unknown"] as SourceType[]) {
      const s = store({ send_commission: null })
      const res = await enrichProperty(s, {
        placeId: PID, jobId: "c4", ownerAuthorized: true,
        fields: [{ field: "send_commission", value: "125%", sourceType: src, verificationStatus: "verified", ownerOverride: true }],
      })
      ok(`${src} rejected`, r(res, "send_commission").outcome === "rejected", r(res, "send_commission").reason)
    }
  }

  section("5. AUTOMATED ENRICHMENT IS UNCHANGED — the firewall still closed")
  {
    for (const src of ["public_web", "official_property_site", "google_places", "trusted_locator_source", "manual_verified"] as SourceType[]) {
      for (const f of ["send_commission", "escort_commission", "bonus_flat"]) {
        const s = store({ [f]: "100%" })
        const res = await enrichProperty(s, {
          placeId: PID, jobId: "c5",
          fields: [{ field: f, value: "999%", sourceType: src, verificationStatus: "verified" as VerificationStatus, sourceReference: "https://x.com" }],
        })
        ok(`${src} → ${f} rejected`, r(res, f).outcome === "rejected")
        ok(`${src} → ${f} value intact`, s.get(PID)!.values[f] === "100%")
      }
    }
  }

  section("6. COMMISSION IS NOT IN THE GENERAL ENRICHMENT ALLOWLIST")
  {
    for (const f of ["send_commission", "escort_commission", "bonus_flat"]) {
      ok(`${f} absent from ENRICHMENT_WRITABLE_FIELDS`, !ENRICHMENT_WRITABLE_FIELDS.has(f))
      ok(`${f} present in OWNER_COMMISSION_FIELDS`, OWNER_COMMISSION_FIELDS.has(f))
      ok(`${f} still in COMMISSION_FIELDS (firewall set)`, COMMISSION_FIELDS.has(f))
    }
  }

  section("7. AN OWNER CAN CORRECT AN EXISTING RATE, AND THE AUDIT RECORDS BOTH VALUES")
  {
    const s = store({ send_commission: "100%" })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "c7", ownerAuthorized: true,
      fields: [owner("send_commission", "125%")],
    })
    ok("written over the existing rate", r(res, "send_commission").outcome === "written", r(res, "send_commission").reason)
    const e = ev(s, "send_commission")
    ok(`old value recorded (${e.oldValue})`, e.oldValue === "100%")
    ok(`new value recorded (${e.newValue})`, e.newValue === "125%")
    ok("source recorded", e.sourceReference === "https://x.com/rates")
    ok("source type recorded", e.sourceType === "manual_verified")
    ok("verification recorded", e.verificationStatus === "verified")
  }

  section("8. NO SOURCE ⇒ RECORDED AS inferred, NOT PROMOTED TO verified")
  {
    const s = store({ escort_commission: null })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "c8", ownerAuthorized: true,
      fields: [owner("escort_commission", "75%", null)],
    })
    ok("still writes", r(res, "escort_commission").outcome === "written")
    ok("labelled inferred", ev(s, "escort_commission").verificationStatus === "inferred")
  }

  section("9. A CONFIRMED ZERO IS A REAL WRITE; A BLANK IS NOT")
  {
    const s = store({ send_commission: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "c9", ownerAuthorized: true, fields: [owner("send_commission", "0%")] })
    ok("0% is stored", r(res, "send_commission").outcome === "written" && s.get(PID)!.values.send_commission === "0%")

    const s2 = store({ send_commission: "100%" })
    const res2 = await enrichProperty(s2, { placeId: PID, jobId: "c9b", ownerAuthorized: true, fields: [owner("send_commission", null)] })
    ok("a null candidate NEVER clears a stored rate", r(res2, "send_commission").outcome === "skipped" && s2.get(PID)!.values.send_commission === "100%",
      r(res2, "send_commission").reason)
  }

  section("10. A COMMISSION SAVE DOES NOT DISTURB PRICING OR ANYTHING ELSE")
  {
    const s = store({
      send_commission: null, onebr_starting_rent: 1350, twobr_starting_rent: 1400,
      current_special: "1 month free", property_name: "Example", website_url: "https://x.com",
    })
    await enrichProperty(s, { placeId: PID, jobId: "c10", ownerAuthorized: true, fields: [owner("send_commission", "100%")] })
    const v = s.get(PID)!.values
    ok("1BR untouched", v.onebr_starting_rent === 1350)
    ok("2BR untouched", v.twobr_starting_rent === 1400)
    ok("special untouched", v.current_special === "1 month free")
    ok("name untouched", v.property_name === "Example")
    ok("website untouched", v.website_url === "https://x.com")
  }

  section("11. AUTHORIZATION DOES NOT LEAK TO OTHER FIELDS")
  {
    // ownerAuthorized is about commission. It must not make anything else writable that was not
    // writable before — notably the image slots, which have their own lock.
    const s = store({ property_image_url: "https://img/keep.jpg" })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "c11", ownerAuthorized: true,
      fields: [owner("property_image_url", "https://img/new.jpg")],
    })
    ok("a locked image slot is still refused", r(res, "property_image_url").outcome === "rejected", r(res, "property_image_url").reason)
    ok("image intact", s.get(PID)!.values.property_image_url === "https://img/keep.jpg")
  }

  // ── CLEARING BACK TO UNKNOWN ────────────────────────────────────────────────────────────
  const clear = (field: string): FieldCandidate =>
    ({ field, value: null, sourceType: "manual_verified", sourceReference: "https://x.com/rates", verificationStatus: "verified", ownerOverride: true, ownerClear: true })

  section("12. AN OWNER CAN CLEAR A POPULATED COMMISSION BACK TO UNKNOWN")
  {
    const s = store({ send_commission: "100%", escort_commission: "75%", bonus_flat: "500" })
    const res = await enrichProperty(s, { placeId: PID, jobId: "c12", ownerAuthorized: true, fields: [clear("send_commission")] })
    ok("cleared", r(res, "send_commission").outcome === "written", r(res, "send_commission").reason)
    ok("reason names the intent", r(res, "send_commission").reason === "owner_cleared")
    const v = s.get(PID)!.values
    ok("send is NULL, not 0%", v.send_commission === null, JSON.stringify(v.send_commission))
    ok("escort untouched", v.escort_commission === "75%")
    ok("bonus untouched", v.bonus_flat === "500")
    const e = ev(s, "send_commission")
    ok(`audit keeps the old value (${e.oldValue})`, e.oldValue === "100%")
    ok("audit records the clear", e.newValue === null && e.action === "written")
  }

  section("13. CLEARING NEEDS ALL FIVE CONDITIONS — each one alone is refused")
  {
    const variants: [string, Partial<FieldCandidate>, boolean][] = [
      ["no ownerAuthorized on the request", {}, false],
      ["no ownerClear flag", { ownerClear: false }, true],
      ["no ownerOverride flag", { ownerOverride: false }, true],
      ["wrong source type", { sourceType: "official_property_site" }, true],
    ]
    for (const [label, patch, authorized] of variants) {
      const s = store({ send_commission: "100%" })
      const res = await enrichProperty(s, {
        placeId: PID, jobId: "c13", ...(authorized ? { ownerAuthorized: true } : {}),
        fields: [{ ...clear("send_commission"), ...patch }],
      })
      ok(`${label} → NOT cleared`, r(res, "send_commission").outcome !== "written", r(res, "send_commission").reason)
      ok(`${label} → value intact`, s.get(PID)!.values.send_commission === "100%")
    }
    // A non-commission field cannot be cleared this way at all.
    const s = store({ property_name: "Example" })
    const res = await enrichProperty(s, { placeId: PID, jobId: "c13b", ownerAuthorized: true, fields: [clear("property_name")] })
    ok("a non-commission field is never cleared", r(res, "property_name").outcome !== "written", r(res, "property_name").reason)
    ok("property_name intact", s.get(PID)!.values.property_name === "Example")
  }

  section("14. CLEARING AN ALREADY-UNKNOWN FIELD IS A NO-OP")
  {
    const s = store({ send_commission: null })
    const res = await enrichProperty(s, { placeId: PID, jobId: "c14", ownerAuthorized: true, fields: [clear("send_commission")] })
    ok("skipped", r(res, "send_commission").outcome === "skipped", r(res, "send_commission").reason)
    ok("reason is already_unknown", r(res, "send_commission").reason === "already_unknown")
    ok("no patch issued", s.applyPatchCalls === 0)
  }

  section("15. CLEARING LEGACY TEXT IS ALLOWED, AND ONLY DELIBERATELY")
  {
    for (const legacy of ["No", "Not Paying", "1 month"]) {
      const s = store({ send_commission: legacy })
      const res = await enrichProperty(s, { placeId: PID, jobId: "c15", ownerAuthorized: true, fields: [clear("send_commission")] })
      ok(`${JSON.stringify(legacy)} cleared on an explicit instruction`, r(res, "send_commission").outcome === "written")
      ok(`…and the audit keeps it`, ev(s, "send_commission").oldValue === legacy)
      // Without the clear instruction, the same legacy value is untouchable by a null candidate.
      const s2 = store({ send_commission: legacy })
      await enrichProperty(s2, { placeId: PID, jobId: "c15b", ownerAuthorized: true, fields: [owner("send_commission", null)] })
      ok(`${JSON.stringify(legacy)} survives a plain null candidate`, s2.get(PID)!.values.send_commission === legacy)
    }
  }

  section("16. A CLEAR TOUCHES NOTHING ELSE — pricing, invoices, identity")
  {
    const s = store({
      send_commission: "100%", escort_commission: "75%", bonus_flat: "500",
      onebr_starting_rent: 1350, twobr_starting_rent: 1400, current_special: "1 month free",
      invoice_commission_pct: "50", invoice_bonus: "250",
      property_name: "Example", website_url: "https://x.com",
    })
    await enrichProperty(s, { placeId: PID, jobId: "c16", ownerAuthorized: true, fields: [clear("escort_commission")] })
    const v = s.get(PID)!.values
    ok("escort cleared", v.escort_commission === null)
    ok("send untouched", v.send_commission === "100%")
    ok("bonus untouched", v.bonus_flat === "500")
    ok("1BR untouched", v.onebr_starting_rent === 1350)
    ok("2BR untouched", v.twobr_starting_rent === 1400)
    ok("special untouched", v.current_special === "1 month free")
    ok("invoice_commission_pct untouched", v.invoice_commission_pct === "50")
    ok("invoice_bonus untouched", v.invoice_bonus === "250")
    ok("name untouched", v.property_name === "Example")
    ok("website untouched", v.website_url === "https://x.com")
  }

  section("17. CLEARING ALL THREE RETURNS THE PROPERTY TO FULLY UNKNOWN")
  {
    const s = store({ send_commission: "0%", escort_commission: "0%", bonus_flat: "0" })
    const res = await enrichProperty(s, {
      placeId: PID, jobId: "c17", ownerAuthorized: true,
      fields: [clear("send_commission"), clear("escort_commission"), clear("bonus_flat")],
    })
    ok("all three cleared", ["send_commission", "escort_commission", "bonus_flat"].every((f) => r(res, f).outcome === "written"))
    const v = s.get(PID)!.values
    ok("all three NULL", v.send_commission === null && v.escort_commission === null && v.bonus_flat === null)
    // The badge consequence: a confirmed-not-paying property becomes unverified again, not zero.
    const { evaluateLocatorCommission } = await import("@bc/companion-shared")
    ok("badge returns to unverified", evaluateLocatorCommission({
      sendCommission: v.send_commission as string | null,
      escortCommission: v.escort_commission as string | null,
      bonusFlat: v.bonus_flat as string | null,
    }).state === "unverified")
  }

  console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
