/**
 * EDIT CLIENT PROFILE — the desired-area ZIP, and the move-in date bound.
 *
 *   npx tsx scripts/leads/profileZipAndDate.test.ts
 *
 * Two defects in one modal, found by opening a client profile:
 *
 *   • a move-in year of 3030 was selectable. The two-year rule has been deployed since
 *     lib/leads/moveDate shipped, but this picker had neither minDate nor maxDate, and Edit
 *     Client writes straight to Supabase under RLS — no server route, so no server check.
 *     It is the only client-editing path in the app that had neither half.
 *
 *   • there was nowhere to type a ZIP. Commute / Destination is present and works, but until a
 *     Google suggestion is clicked it writes nothing, so a typed ZIP vanished silently.
 *
 * Both are fixed with what already exists: the shared date module, and the destination_zip
 * column the earlier Commute work had already defined.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { validateMoveDate, moveDateMin, moveDateMax, toLocalYMD, MOVE_DATE_MAX_YEARS_AHEAD } from "@/lib/leads/moveDate"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`) }
}
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const FIELDS = read("components/LeadFields.tsx")
const MODAL = read("components/LeadFormModal.tsx")
const SUBMIT = read("app/api/leads/submit/route.ts")

// ── 1. THE ZIP IS ONE FIELD, NOT A SECOND ONE ─────────────────────────────────────────────────
console.log("the ZIP reuses the column the earlier Commute work defined:")
{
  const MIG = raw("supabase/migrations/20261113000000_lead_destination_zip.sql")
  ok("the migration adds exactly one column", (MIG.match(/add column if not exists/g) || []).length === 1)
  // The DDL only — the header prose says "no default", which a naive scan would match.
  const DDL = MIG.replace(/^--.*$/gm, "")
  ok("…named destination_zip, nullable, no default",
    /add column if not exists destination_zip text;/.test(DDL) && !/\bdefault\b/i.test(DDL))
  ok("…with the five-digit CHECK, NOT VALID", /check \(destination_zip is null or destination_zip ~ '\^\[0-9\]\{5\}\$'\) not valid/.test(MIG))
  ok("…and nothing else: no other table, no data statement",
    !/\b(update|insert|delete|drop)\b/i.test(MIG.replace(/--.*$/gm, "")))
  ok("it is the same name the earlier prepared work chose", /destination_zip/.test(MIG))
}
console.log("\nexactly one ZIP control exists, and the destination is untouched:")
{
  ok("one input bound to destination_zip", (FIELDS.match(/updateField\("destination_zip"/g) || []).length === 1)
  ok("…and it is five digits, digits only",
    /replace\(\/\\D\/g, ""\)\.slice\(0, 5\)/.test(FIELDS) && /maxLength=\{5\}/.test(FIELDS))
  ok("the Commute field is still rendered, unchanged", /<CommuteDestinationField/.test(FIELDS))
  ok("…still writing its own two columns as a pair",
    /updateField\("commute_anchor_label", label\)/.test(FIELDS) && /updateField\("commute_anchor_place_id", placeId\)/.test(FIELDS))
  ok("…and Max Drive is still its control, not moved",
    /onMaxMinutesChange=\{\(next\) => updateField\("commute_max_minutes"/.test(FIELDS))
}

// ── 2. SIDE BY SIDE, STACKING ─────────────────────────────────────────────────────────────────
console.log("\nthe two sit side by side and stack on a narrow screen:")
{
  ok("one grid holds both", /grid grid-cols-1 sm:grid-cols-\[minmax\(0,2fr\)_minmax\(0,1fr\)\] gap-3/.test(FIELDS))
  ok("…the destination is the wider of the two (2fr vs 1fr)", /minmax\(0,2fr\)_minmax\(0,1fr\)/.test(FIELDS))
  ok("…both cells can shrink, so neither widens the modal",
    (FIELDS.match(/className="min-w-0"/g) || []).length >= 2)
  ok("…and below `sm` it is one column", /grid-cols-1 sm:grid-cols-/.test(FIELDS))
}
console.log("\nnothing else in the form moved:")
{
  const order = ["Contact", "Move Details", "Preferred Locations", "Commute / Destination", "ZIP Code", "Property Preferences"]
  let at = -1
  let inOrder = true
  for (const section of order) {
    const i = FIELDS.indexOf(section)
    if (i < 0 || i < at) inOrder = false
    at = i
  }
  ok("the section order is unchanged, with ZIP beside the destination it belongs to", inOrder)
  ok("City is still in Move Details, untouched", /<option value="">City \*<\/option>/.test(FIELDS))
  ok("Preferred Locations still renders its own block", /Preferred Locations/.test(FIELDS))
}

// ── 3. IT SAVES AND REOPENS ───────────────────────────────────────────────────────────────────
console.log("\nit persists on both paths — the allowlists that govern seed and save:")
{
  ok("Edit Client can load AND save it (EDITABLE_COLUMNS)", /"destination_zip",/.test(MODAL))
  ok("…and that one list governs both the seed and the patch",
    /allowlist governs BOTH the edit seed/.test(raw("components/LeadFormModal.tsx")))
  ok("Add Lead persists it too (the submit route's allowlist)", /"destination_zip",/.test(SUBMIT))
  ok("…and it starts controlled, so reopening shows what was stored",
    /destination_zip: "",/.test(MODAL))
}
console.log("\nclearing the ZIP clears it, rather than failing the save:")
{
  const VALUES = read("lib/leads/leadFormValues.ts")
  ok("destination_zip is in the blank-becomes-NULL set", /"destination_zip",/.test(VALUES))
  // The column is text, so the TYPE would accept "" — the CHECK is what refuses it.
  // Without this the save would die on a constraint violation the moment a locator
  // emptied the field, which is exactly how move_date used to fail.
  const { buildEditPatch } = require("@/lib/leads/leadFormValues")
  const cleared = buildEditPatch({ destination_zip: "", move_date: "", first_name: "Lance" },
    ["destination_zip", "move_date", "first_name"])
  ok("…so a blank ZIP is sent as null", cleared.destination_zip === null, JSON.stringify(cleared))
  ok("…a blank date still goes as null too", cleared.move_date === null)
  ok("…and a text column still passes through as itself", cleared.first_name === "Lance")
  const kept = buildEditPatch({ destination_zip: "78240" }, ["destination_zip"])
  ok("…while a real ZIP is sent verbatim", kept.destination_zip === "78240")
}

console.log("\na bad ZIP is refused on both paths, never stored:")
{
  ok("the modal refuses anything that is not five digits",
    /!\/\^\[0-9\]\{5\}\$\/\.test\(zip\)/.test(MODAL))
  ok("…and so does the server route", /ZIP code must be five digits/.test(SUBMIT))
}

// ── 4. THE MOVE-IN DATE ───────────────────────────────────────────────────────────────────────
console.log("\nthe date control is bounded by the rule that was already deployed:")
{
  ok("the picker has both bounds", /minDate=\{minMoveDate\}/.test(FIELDS) && /maxDate=\{maxMoveDate\}/.test(FIELDS))
  ok("…taken from lib/leads/moveDate, not written out again",
    /import \{ moveDateMin, moveDateMax, toLocalYMD \} from "@\/lib\/leads\/moveDate"/.test(FIELDS))
  ok("…and no second limit was introduced",
    !/2 \* 365|730|getFullYear\(\) \+ 2/.test(FIELDS))
  ok("the day is stored from LOCAL parts, not toISOString", /toLocalYMD\(date\)/.test(FIELDS) && !/toISOString\(\)\.split/.test(FIELDS))
  ok("the save gate calls the SAME function the public route calls",
    /const dateVerdict = validateMoveDate\(form\.move_date\)/.test(MODAL))
  ok("…and refuses rather than correcting", /alert\(dateVerdict\.message\)/.test(MODAL) && !/clamp|Math\.min\(/.test(MODAL))
}
console.log("\nthe rule itself, exercised:")
{
  const now = new Date(2026, 10, 4)
  ok("the window is two years", MOVE_DATE_MAX_YEARS_AHEAD === 2)
  ok("today is accepted", validateMoveDate(toLocalYMD(moveDateMin(now)), now).ok)
  ok("the last day of the window is accepted", validateMoveDate(toLocalYMD(moveDateMax(now)), now).ok)
  ok("3030 is refused — the reported case", !validateMoveDate("3030-11-15", now).ok)
  ok("…with a message the modal can show", (validateMoveDate("3030-11-15", now) as { message: string }).message.length > 10)
  ok("one day past the window is refused", (() => {
    const d = moveDateMax(now); d.setDate(d.getDate() + 1)
    return !validateMoveDate(toLocalYMD(d), now).ok
  })())
  ok("yesterday is refused", (() => {
    const d = moveDateMin(now); d.setDate(d.getDate() - 1)
    return !validateMoveDate(toLocalYMD(d), now).ok
  })())
  ok("blank is accepted — unanswered is not invalid", validateMoveDate("", now).ok)
  ok("Lance's stored date is inside the window", validateMoveDate("2026-11-15", now).ok)
  ok("a date that is not a real day is refused", !validateMoveDate("2026-02-31", now).ok)
}

// ── 5. WHAT MUST NOT HAVE CHANGED ─────────────────────────────────────────────────────────────
console.log("\nthe public Smart Form is untouched:")
{
  const SF = read("app/smart-lead-form/_components/form/sections/LeadFormFields.tsx")
  ok("it never sends a destination_zip", !/destination_zip/.test(SF))
  ok("…and still bounds its own date with the same shared module",
    /minDate=\{minMoveDate\}/.test(SF) && /maxDate=\{maxMoveDate\}/.test(SF))
  for (const f of [
    "app/smart-lead-form/page.tsx",
    "app/components/ContactForm.tsx",
    "app/components/LandingForm.tsx",
    "app/components/NewHomeContactForm.tsx",
  ]) if (existsSync(join(process.cwd(), f))) ok(`${f.split("/").pop()} does not mention the ZIP`, !/destination_zip/.test(read(f)))
}
console.log("\nand so is everything outside this modal:")
{
  // QUICK MATCH IS NOW A READER, BY REQUEST. It was on this list because, when the ZIP shipped,
  // nothing consumed it; the approved Quick Match workflow (2026-11-04) asks it to rank on
  // "preferred areas, destination ZIP Code, and commute destination when available". The claim
  // this block still makes — that the ZIP reached nothing it should not — is unchanged for the
  // matching filters and the Explorer, which is where it mattered. What Quick Match does with it
  // is asserted in scripts/tests/quickMatch.test.ts (one comparable ZIP, named areas NOT
  // invented into ZIPs), and the two lines below keep the read narrow.
  // The reader moved from needs.ts to geography.ts, which now owns every comparison a ZIP takes
  // part in; needs.ts takes the resolved value from it rather than reading the column a second
  // time. Still ONE read of the column, which is what this asserts.
  ok("Quick Match reads the ZIP in ONE place, the geography resolver",
    (() => {
      const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
      const walk = (d: string): string[] => readdirSync(d).flatMap((e) => {
        const q = `${d}/${e}`
        return statSync(q).isDirectory() ? walk(q) : /\.(ts|tsx)$/.test(q) ? [q] : []
      })
      const readers = walk("lib/quickMatch").filter((f) => /\["destination_zip"\]/.test(read(f)))
      return readers.length === 1 && readers[0] === "lib/quickMatch/geography.ts"
    })())
  ok("…and it reads it as a FIVE-DIGIT ZIP or not at all",
    /fiveDigitZip\(l\["destination_zip"\]\)/.test(read("lib/quickMatch/geography.ts")))
  for (const [label, path] of [
    ["the matching filters", "lib/matching"],
  ] as const) {
    if (!existsSync(join(process.cwd(), path))) { ok(`${label} — not present`, true); continue }
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
    const walk = (d: string): string[] => readdirSync(d).flatMap((e) => {
      const p = `${d}/${e}`
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []
    })
    ok(`${label} does not read destination_zip`, walk(path).every((f) => !read(f).includes("destination_zip")))
  }
  ok("the Explorer / Unleash Beast read path is not in this change",
    !read("lib/propertyExplorer/catalog.ts").includes("destination_zip"))
}

console.log(`\nEdit Profile ZIP + date: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
