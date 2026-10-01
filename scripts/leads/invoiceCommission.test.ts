// Invoice commission structures and the frozen financial snapshot.
//
// Percentage and Flat Fee are ALTERNATIVE base structures; Bonus is additive to
// whichever applies. They are separate columns because "$500" in one merged field
// could never be told apart afterwards — and the two behave differently: a flat fee
// REPLACES the percentage, a bonus ADDS to it.
//
// Run: npx tsx scripts/leads/invoiceCommission.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { computeInvoiceTotals, buildInvoicePatch, seedInvoiceForm, type InvoiceForm } from "@/lib/leads/invoiceFields"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const form = (over: Partial<InvoiceForm>): InvoiceForm => ({ ...seedInvoiceForm({}), ...over })

console.log("THE FOUR STRUCTURES:")
{
  // 1. Percentage only — $1,500 rent at 100%, split 70%.
  const t = computeInvoiceTotals(form({ invoice_base_rent: "1500", invoice_commission_pct: "100", invoice_broker_split_pct: "70" }))
  ok("percentage only → total 1500", t.totalInvoice === 1500, String(t.totalInvoice))
  ok("percentage only → expected 1050", t.expectedCommission === 1050, String(t.expectedCommission))
}
{
  // 2. Flat fee only — base rent is irrelevant to the fee.
  const t = computeInvoiceTotals(form({ invoice_base_rent: "1500", invoice_flat_fee: "500", invoice_broker_split_pct: "70" }))
  ok("flat fee only → total 500 (rent ignored)", t.totalInvoice === 500, String(t.totalInvoice))
  ok("flat fee only → expected 350", t.expectedCommission === 350, String(t.expectedCommission))
}
{
  // 3. Percentage + bonus — bonus is INSIDE the split, per the approved decision.
  const t = computeInvoiceTotals(form({ invoice_base_rent: "1500", invoice_commission_pct: "100", invoice_bonus: "250", invoice_broker_split_pct: "70" }))
  ok("percentage + bonus → total 1750", t.totalInvoice === 1750, String(t.totalInvoice))
  ok("percentage + bonus → expected 1225 (bonus is split too)", t.expectedCommission === 1225, String(t.expectedCommission))
}
{
  // 4. Flat fee + bonus.
  const t = computeInvoiceTotals(form({ invoice_flat_fee: "500", invoice_bonus: "250", invoice_broker_split_pct: "70" }))
  ok("flat fee + bonus → total 750", t.totalInvoice === 750, String(t.totalInvoice))
  ok("flat fee + bonus → expected 525", t.expectedCommission === 525, String(t.expectedCommission))
}

console.log("\nPERCENTAGE and FLAT FEE are alternatives, never addends:")
{
  // If both somehow exist, the flat fee wins — an explicit dollar amount the
  // locator typed beats a percentage possibly left over from the other structure.
  const t = computeInvoiceTotals(form({ invoice_base_rent: "1500", invoice_commission_pct: "100", invoice_flat_fee: "500" }))
  ok("they are NOT added together", t.totalInvoice !== 2000, String(t.totalInvoice))
  ok("the flat fee wins", t.totalInvoice === 500)
}
{
  const modal = strip(read("components/crm/GetInvoiceDetailsModal.tsx"))
  ok("the UI clears the other field so both can never be entered",
    /field === "invoice_commission_pct" && typed\) next\.invoice_flat_fee = ""/.test(modal) &&
    /field === "invoice_flat_fee" && typed\) next\.invoice_commission_pct = ""/.test(modal))
}

console.log("\nEDGE CASES — nothing is invented:")
ok("an empty form totals null", computeInvoiceTotals(form({})).totalInvoice === null)
ok("rent with no structure totals null",
  computeInvoiceTotals(form({ invoice_base_rent: "1500" })).totalInvoice === null)
// Some leases pay only a lease-up bonus, so a bonus alone is a real invoice.
ok("a bonus alone is still an invoice", computeInvoiceTotals(form({ invoice_bonus: "300" })).totalInvoice === 300)
ok("no broker split → expected stays null",
  computeInvoiceTotals(form({ invoice_flat_fee: "500" })).expectedCommission === null)
ok("a 0% broker split is honoured, not treated as missing",
  computeInvoiceTotals(form({ invoice_flat_fee: "500", invoice_broker_split_pct: "0" })).expectedCommission === 0)
ok("formatted input is parsed", computeInvoiceTotals(form({ invoice_flat_fee: "$1,250", invoice_broker_split_pct: "50%" })).expectedCommission === 625)

console.log("\nTHE SNAPSHOT IS FROZEN AT SAVE, not only derived:")
{
  const patch = buildInvoicePatch(form({ invoice_base_rent: "1500", invoice_commission_pct: "100", invoice_bonus: "250", invoice_broker_split_pct: "70" }))
  ok("invoice_total_amount is persisted", patch.invoice_total_amount === 1750)
  ok("invoice_expected_commission is persisted", patch.invoice_expected_commission === 1225)
  ok("the new structure columns persist as numbers",
    patch.invoice_bonus === 250 && patch.invoice_commission_pct === 100)
  ok("blank numerics persist as null, never 0", buildInvoicePatch(form({})).invoice_flat_fee === null)
}

console.log("\nBOTH invoice surfaces use the ONE canonical search:")
{
  // The persistent section was the surface the search never got wired into, so a
  // known property still had to be typed by hand there. Both now share one
  // component and one data layer — no second property search anywhere.
  for (const f of ["components/crm/GetInvoiceDetailsModal.tsx", "components/crm/InvoiceDetailsSection.tsx"]) {
    const src = strip(read(f))
    ok(`${f.split("/").pop()} uses CanonicalPropertySearchField`, /CanonicalPropertySearchField/.test(src))
    ok(`${f.split("/").pop()} builds no search of its own`,
      !/searchByText/.test(src) && !/loadGoogleMaps/.test(src))
    ok(`${f.split("/").pop()} stores the canonical key`, /invoice_property_canonical_key/.test(src))
  }
  // The section autosaves per field, and a dropdown click never fires the input's
  // blur — so the selection must persist explicitly or it is lost on reload.
  const section = strip(read("components/crm/InvoiceDetailsSection.tsx"))
  ok("the section PERSISTS the selection immediately (no blur to rely on)",
    /void persist\(\{\s*invoice_property_name: m\.name/.test(section))
}

console.log("\nTHE SEARCH FIELD MATCHES THE MAP'S UX — no layout shift:")
{
  const field = strip(read("components/crm/CanonicalPropertySearchField.tsx"))
  // The Map shows nothing under its input while searching; anything rendered in
  // flow here changes the field height mid-type and the modal jumps.
  ok("no in-flow 'Searching…' line", !/Searching…/.test(field))
  ok("the failure notice is in the same absolute layer as the dropdown",
    /failed && !searching && \(\s*\n\s*<div className="absolute/.test(field))
  ok("the loading state is still tracked internally", /setSearching\(true\)/.test(field))
}

console.log("\nCANONICAL PROPERTY IDENTITY on the invoice:")
{
  const modal = strip(read("components/crm/GetInvoiceDetailsModal.tsx"))
  const fields = strip(read("lib/leads/invoiceFields.ts"))
  ok("Property Name uses the canonical Map search", /CanonicalPropertySearchField/.test(modal))
  ok("selecting stores the place id", /invoice_property_place_id: m\.placeId/.test(modal))
  ok("and the canonical key in the same shape the other tables generate",
    /invoice_property_canonical_key: `pid:\$\{m\.placeId\}`/.test(modal))
  ok("typing freely clears a stale identity",
    /invoice_property_place_id: "", invoice_property_canonical_key: ""/.test(modal))
  ok("the identity columns persist", /invoice_property_place_id/.test(fields) && /invoice_property_canonical_key/.test(fields))
  const patch = buildInvoicePatch(form({ invoice_property_place_id: "ChIJabc", invoice_property_canonical_key: "pid:ChIJabc" }))
  ok("they round-trip through the patch", patch.invoice_property_canonical_key === "pid:ChIJabc")
}

console.log("\nPROPERTY INTELLIGENCE is REFERENCE ONLY:")
{
  const modal = strip(read("components/crm/GetInvoiceDetailsModal.tsx"))
  ok("catalog commission is displayed", /Property Intelligence: \{catalogCommissionRef\}/.test(modal))
  ok("it is rendered verbatim, never parsed into a number",
    !/parseFloat\(catalogRef/.test(modal) && !/Number\(catalogRef/.test(modal))
  // Only 5 of 4,202 catalogued properties carry a commission, and "115%" there
  // means a percentage of ONE MONTH'S RENT — a different unit from Commission %.
  ok("no numeric field is auto-populated from the catalog",
    !/invoice_commission_pct: .*(sendCommission|escortCommission)/.test(modal) &&
    !/invoice_bonus: .*bonusFlat/.test(modal))
  ok("the invoice never writes back to property_catalog",
    !/from\("property_catalog"\)[\s\S]{0,120}(update|upsert|insert)/.test(modal))
}

console.log(`\nInvoice commission: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
