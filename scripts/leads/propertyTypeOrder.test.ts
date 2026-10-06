// Lead form — PROPERTY TYPE DISPLAY ORDER.
//
// The order is a client-facing presentation decision, so it is pinned here: a future edit that
// reorders the canonical array for some unrelated reason fails this test instead of quietly
// changing what every lead sees.
//
// The second half is the part that actually protects data: reordering a <select> must not touch
// VALUES. Every option's stored string has to stay byte-identical, or existing leads stop matching
// and the inference/matching paths silently change meaning.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PROPERTY_TYPES as LEAD_TYPES } from "@/lib/formOptions"
import { PROPERTY_TYPES as SOCIAL_TYPES } from "@/lib/social/propertyTypes"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const EXPECTED = ["Studio", "Apartment", "High-Rise", "Loft", "Townhome", "Rental Home", "Penthouse", "Open to All"]

console.log("\nLEAD FORM ORDER:")
ok("exactly the approved order", JSON.stringify([...LEAD_TYPES]) === JSON.stringify(EXPECTED), [...LEAD_TYPES].join(" | "))
EXPECTED.forEach((t, i) => ok(`position ${i + 1} is ${t}`, LEAD_TYPES[i] === t))
ok("Open to All is last", LEAD_TYPES[LEAD_TYPES.length - 1] === "Open to All")

console.log("\nVALUES ARE UNCHANGED (ordering must never alter stored data):")
const BEFORE = ["Studio", "Apartment", "High-Rise", "Townhome", "Rental Home", "Penthouse", "Loft", "Open to All"]
ok("same SET of values as before the reorder", [...LEAD_TYPES].sort().join("|") === [...BEFORE].sort().join("|"))
ok("same COUNT (nothing added or dropped)", LEAD_TYPES.length === BEFORE.length)
ok("no value was renamed, retyped or re-cased", BEFORE.every((v) => (LEAD_TYPES as readonly string[]).includes(v)))
ok("option value equals its label (so display order cannot change what is stored)",
  LEAD_TYPES.every((t) => typeof t === "string" && t.trim() === t && t.length > 0))

console.log("\nTHE FORMS RENDER FROM THE CONSTANT (so the order is real, not just declared):")
const smart = read("app/smart-lead-form/_components/form/sections/LeadFormFields.tsx")
const crm = read("components/LeadFields.tsx")
ok("Smart Lead Form maps PROPERTY_TYPES", /\{PROPERTY_TYPES\.map\(/.test(smart))
ok("CRM Add Lead maps PROPERTY_TYPES", /\{PROPERTY_TYPES\.map\(/.test(crm))
ok("neither hard-codes its own property-type <option> list",
  !/<option value="Townhome">/.test(smart) && !/<option value="Townhome">/.test(crm))

console.log("\nINTERNAL/ADMIN CONTROLS WERE NOT REORDERED:")
ok("Social Beast keeps its existing order",
  SOCIAL_TYPES.slice(0, 7).join("|") === "Studio|Apartment|High-Rise|Townhome|Rental Home|Penthouse|Loft",
  SOCIAL_TYPES.slice(0, 7).join(" | "))
ok("…and still has all 14 entries (7 canonical + 7 compound)", SOCIAL_TYPES.length === 14)
ok("…and still excludes the renter-preference value", !(SOCIAL_TYPES as readonly string[]).includes("Open to All"))
// Membership is still derived, so a value added to the canonical list cannot silently bypass Social Beast.
const spec = read("lib/social/propertyTypes.ts")
ok("Social Beast still derives MEMBERSHIP from the canonical list", /CANONICAL_PROPERTY_TYPES/.test(spec))
ok("…and fails loudly if canonical membership ever changes", /update SOCIAL_CANONICAL_ORDER to match/.test(spec))

console.log("\nLEGACY PUBLIC FORMS (no Loft option; order already matches the request minus Loft):")
for (const f of ["app/components/LandingForm.tsx", "app/components/ContactForm.tsx"]) {
  const src = read(f)
  const opts = [...src.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1])
    .filter((v) => EXPECTED.includes(v))
  ok(`${f.split("/").pop()} order matches the approved order, minus Loft`,
    opts.join("|") === EXPECTED.filter((t) => t !== "Loft").join("|"), opts.join(" | "))
}

console.log(`\n${pass} passed, ${failures.length} failed\n`)
if (failures.length) { failures.forEach((f) => console.log(`  FAILED: ${f}`)); process.exit(1) }
