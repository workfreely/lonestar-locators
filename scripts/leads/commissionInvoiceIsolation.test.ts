/**
 * ADVERTISED RATE ≠ ACTUAL TRANSACTION.
 *
 *   npx tsx scripts/leads/commissionInvoiceIsolation.test.ts
 *
 * property_catalog.{send,escort}_commission and bonus_flat are what a property ADVERTISES to
 * locators. leads.invoice_commission_pct and leads.invoice_bonus are what a SPECIFIC LEASE
 * actually paid. They are different facts about different things, and they live on different
 * tables on different keys for exactly that reason.
 *
 * The risk this suite exists for: an owner corrects a stale advertised rate, and an invoice that
 * was already raised silently changes with it. A closed invoice is a financial record — it must
 * describe what happened, not what the catalog says today.
 *
 * Also covers LEGACY TEXT commission values ("No", "Not Paying", "1 month"), which must survive
 * an unrelated save untouched rather than being reinterpreted or rejected.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { enrichProperty } from "@/lib/propertyEnrichment/writer"
import { InMemoryEnrichmentStore } from "@/lib/propertyEnrichment/sim/inMemoryStore"
import { ENRICHMENT_WRITABLE_FIELDS, OWNER_COMMISSION_FIELDS } from "@/lib/propertyEnrichment/policy"
import { commissionToInput } from "@/components/crm/PropertyPricingEditor"
import { evaluateLocatorCommission } from "@bc/companion-shared"
import type { FieldCandidate } from "@/lib/propertyEnrichment/types"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const section = (t: string) => console.log("\n" + t)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const PID = "ChIJinvoiceisolation"
const owner = (field: string, value: unknown): FieldCandidate =>
  ({ field, value, sourceType: "manual_verified", sourceReference: "https://x.com/rates", verificationStatus: "verified", ownerOverride: true })

const INVOICE_FIELDS = [
  "invoice_commission_pct", "invoice_bonus", "invoice_commission_paid",
  "invoice_flat_fee", "invoice_split_pct", "invoice_total",
]

async function main() {
  section("1. A COMMISSION EDIT WRITES ONLY THE COMMISSION COLUMN")
  {
    const s = new InMemoryEnrichmentStore()
    // Invoice-shaped columns seeded on the property row, so that if the writer ever reached for
    // one it would be caught here rather than in production.
    s.seedProperty(PID, {
      send_commission: "100%",
      ...Object.fromEntries(INVOICE_FIELDS.map((f) => [f, "SEEDED"])),
    }, "keep")
    await enrichProperty(s, { placeId: PID, jobId: "i1", ownerAuthorized: true, fields: [owner("send_commission", "125%")] })
    const v = s.get(PID)!.values
    ok("the advertised rate changed", v.send_commission === "125%")
    for (const f of INVOICE_FIELDS) ok(`${f} untouched`, v[f] === "SEEDED", String(v[f]))
  }

  section("2. INVOICE FIELDS ARE NOT WRITABLE BY ANY ENRICHMENT PATH")
  {
    for (const f of INVOICE_FIELDS) {
      ok(`${f} absent from the enrichment allowlist`, !ENRICHMENT_WRITABLE_FIELDS.has(f))
      ok(`${f} absent from OWNER_COMMISSION_FIELDS`, !OWNER_COMMISSION_FIELDS.has(f))
    }
    // And the writer refuses one outright, even for an authorized owner.
    const s = new InMemoryEnrichmentStore()
    s.seedProperty(PID, { invoice_commission_pct: "50" }, "keep")
    const res = await enrichProperty(s, { placeId: PID, jobId: "i2", ownerAuthorized: true, fields: [owner("invoice_commission_pct", "99")] })
    ok("an owner cannot write invoice_commission_pct", res.results[0].outcome === "rejected", res.results[0].reason)
    ok("value intact", s.get(PID)!.values.invoice_commission_pct === "50")
  }

  section("3. THE OWNER ROUTE NEVER MENTIONS AN INVOICE FIELD")
  {
    const route = read("app/api/admin/owner/property-pricing/route.ts")
    ok("no invoice_ column referenced", !/invoice_/.test(route))
    ok("the leads table is never touched", !/from\("leads"\)/.test(route))
    const ed = read("components/crm/PropertyPricingEditor.tsx")
    ok("the editor never mentions an invoice field", !/invoice_/.test(ed))
  }

  section("4. THE TWO LIVE ON DIFFERENT TABLES, ON DIFFERENT KEYS")
  {
    const invoiceFields = read("lib/leads/invoiceFields.ts")
    ok("invoice_commission_pct is a LEAD field", /invoice_commission_pct/.test(invoiceFields))
    ok("invoice_bonus is a LEAD field", /invoice_bonus/.test(invoiceFields))
    ok("invoiceFields never reads property_catalog commission",
      !/send_commission|escort_commission|bonus_flat/.test(invoiceFields))
    // Nothing prefills an invoice from the catalog yet — that is a later, deliberate phase.
    const estimate = read("lib/leads/commissionEstimate.ts")
    ok("the invoice estimator does not read catalog commission",
      !/send_commission|escort_commission|bonus_flat/.test(estimate))
  }

  section("5. LEGACY TEXT VALUES SURVIVE AN UNRELATED SAVE")
  {
    // The editor shows a legacy value verbatim and, because it is UNCHANGED, never resubmits it.
    // Before this guard, saving a 2BR rent on such a property failed the numeric validator and
    // rejected the entire save.
    for (const legacy of ["No", "Not Paying", "1 month", "Does Not Pay", "Call office"]) {
      ok(`${JSON.stringify(legacy)} is displayed verbatim`, commissionToInput(legacy) === legacy)
    }
    const ed = read("components/crm/PropertyPricingEditor.tsx")
    // The per-field conditions moved into one `commit` helper when intentional clearing was
    // added. Same guarantee: an UNCHANGED field returns early and is never put in the body, so a
    // legacy value is never resubmitted to the numeric validator.
    ok("a commission field is sent ONLY when changed",
      /if \(!changed\(now, before\)\) return/.test(ed) &&
      /commit\("sendCommission", send, loadedCommission\.send\)/.test(ed) &&
      /commit\("escortCommission", escort, loadedCommission\.escort\)/.test(ed) &&
      /commit\("bonusFlat", bonus, loadedCommission\.bonus\)/.test(ed))
    ok("a legacy value is only cleared by an explicit, deliberate clear",
      /body\[key\] = now\.trim\(\) === "" \? null : now\.trim\(\)/.test(ed))
    ok("the loaded values are captured on open", /setLoadedCommission\(\{ send: loadedSend/.test(ed))
    ok("…and cleared between properties", /setLoadedCommission\(\{ send: "", escort: "", bonus: "" \}\)/.test(ed))
  }

  section("6. LEGACY VALUES KEEP THEIR MEANING ON THE BADGE")
  {
    for (const n of ["No", "Not Paying", "not paying", "Does Not Pay", "No Commission"]) {
      ok(`${JSON.stringify(n)} still reads CONFIRMED NOT PAYING`,
        evaluateLocatorCommission({ sendCommission: n }).state === "not_paying")
    }
    ok('"1 month" is a real value, so it still pays',
      evaluateLocatorCommission({ bonusFlat: "1 month" }).state === "paying")
    ok('…and renders verbatim without a "$"',
      (evaluateLocatorCommission({ bonusFlat: "1 month" }) as { text: string }).text === "Bonus 1 month")
    // A legacy no-pay must not be overridden by a later verified zero elsewhere.
    ok("No + a verified 0% elsewhere is still not_paying",
      evaluateLocatorCommission({ sendCommission: "No", escortCommission: "0%" }).state === "not_paying")
  }

  section("7. RED REQUIRES EVERY COMPONENT EXPLICITLY ZERO")
  {
    ok("all three explicit zeros → not_paying",
      evaluateLocatorCommission({ sendCommission: "0%", escortCommission: "0%", bonusFlat: "0" }).state === "not_paying")
    ok("a SINGLE verified zero never implies the property pays nothing",
      evaluateLocatorCommission({ sendCommission: "0%" }).state === "unverified")
    ok("two zeros and one unknown is still not a confirmed no",
      evaluateLocatorCommission({ sendCommission: "0%", escortCommission: "0%" }).state === "unverified")
  }

  console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
