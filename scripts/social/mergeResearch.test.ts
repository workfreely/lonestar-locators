// VERIFIED RESEARCH MUST NOT SHRINK BY OMISSION — the merge rule, and the restore contract.
//
// The hazard is quiet: a leasing page is redesigned and lists five amenities instead of twelve, a
// floor-plan page shows only what is available this week. A plain overwrite reads both as
// deletions and discards verified work. The rule is that OMISSION IS NOT DELETION — only an
// explicit `remove` deletes anything.
//
// Run: npx tsx scripts/social/mergeResearch.test.ts

import { readFileSync } from "node:fs"
import path from "node:path"
import { mergeStableResearch, omittedKeys, type Json } from "@/lib/social/mergeResearch"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// A realistic stored record, shaped like the live ones.
const stored = {
  address: "909 Texas Avenue, Houston, TX 77002",
  yearBuilt: "1913, renovated 2015",
  ceilingHeight: "10 to 18 ft",
  laundry: "Washers and dryers included — SELECT HOMES",
  communityAmenities: ["Temperature-controlled indoor pool", "Billiards room", "Concierge", "Valet"],
  floorPlans: [
    { name: "A2 - Studio", sqft: 484, price: "$1,246" },
    { name: "L1A", sqft: 1414, price: "$2,487" },
    { name: "C3 - 1x1-PH", sqft: 2040, price: "$3,105" },
  ],
  geography: { market: "Houston", city: "Houston", broaderArea: "Downtown Houston", district: "Downtown core" },
} as unknown as Record<string, Json>

console.log("\nomission never deletes:")
const thin = { address: "909 Texas Ave", communityAmenities: ["Billiards room"] } as unknown as Record<string, Json>
const merged = mergeStableResearch(stored, thin)
ok("a key the new source omits is KEPT", merged.ceilingHeight === "10 to 18 ft" && merged.laundry !== undefined)
ok("the select-homes laundry qualification survives a thin update",
  String(merged.laundry).includes("SELECT HOMES"))
ok("a key the new source CHANGES wins — that is a correction", merged.address === "909 Texas Ave")
ok("a SHORTER amenity list does not truncate the stored one",
  eq(merged.communityAmenities, ["Temperature-controlled indoor pool", "Billiards room", "Concierge", "Valet"]))
ok("the whole floor-plan catalogue survives being unmentioned",
  Array.isArray(merged.floorPlans) && (merged.floorPlans as Json[]).length === 3)
ok("nested objects are merged, not replaced wholesale",
  eq(mergeStableResearch(stored, { geography: { district: "Skyline District" } } as never).geography,
     { market: "Houston", city: "Houston", broaderArea: "Downtown Houston", district: "Skyline District" }))
ok("neither input is mutated", stored.address === "909 Texas Avenue, Houston, TX 77002" && eq(thin.communityAmenities, ["Billiards room"]))

console.log("\narrays union rather than overwrite:")
const added = mergeStableResearch(stored, { communityAmenities: ["Rooftop deck", "Concierge"] } as never)
ok("new entries are appended", (added.communityAmenities as string[]).includes("Rooftop deck"))
ok("duplicates are not doubled", (added.communityAmenities as string[]).filter((a) => a === "Concierge").length === 1)
ok("order is preserved — existing findings first", (added.communityAmenities as string[])[0] === "Temperature-controlled indoor pool")

console.log("\nthe same floor plan, read again from a better source:")
const richer = mergeStableResearch(stored, {
  floorPlans: [{ name: "L1A", sqft: 1414, price: "$2,487", note: "LOFT", baseRent: "$2,329" }],
} as never)
const plans = richer.floorPlans as Record<string, Json>[]
ok("it is matched by name, not appended as a second plan", plans.length === 3)
ok("...and gains the new detail", plans.find((p) => p.name === "L1A")?.baseRent === "$2,329")
ok("...without losing what it already had", plans.find((p) => p.name === "L1A")?.price === "$2,487")
ok("the other plans are untouched", plans.find((p) => p.name === "C3 - 1x1-PH")?.sqft === 2040)

console.log("\nexplicit correction is still possible:")
const replaced = mergeStableResearch(stored, { floorPlans: [{ name: "NEW", sqft: 1 }] } as never, { replace: ["floorPlans"] })
ok("naming a path in `replace` DOES replace that array", (replaced.floorPlans as Json[]).length === 1)
ok("...and leaves every other field alone", replaced.ceilingHeight === "10 to 18 ft")
const removed = mergeStableResearch(stored, {} as never, { remove: ["ceilingHeight"] })
ok("naming a path in `remove` deletes it", !("ceilingHeight" in removed))
ok("...and nothing else goes with it", removed.laundry !== undefined && (removed.floorPlans as Json[]).length === 3)
ok("remove wins even if the incoming object sets the key",
  !("ceilingHeight" in mergeStableResearch(stored, { ceilingHeight: "9 ft" } as never, { remove: ["ceilingHeight"] })))

console.log("\nwhat a plain overwrite WOULD have cost:")
const lost = omittedKeys(stored, thin)
ok("the omitted keys are reported by name", lost.includes("ceilingHeight") && lost.includes("laundry") && lost.includes("yearBuilt"))
// A key that is omitted ENTIRELY is reported by name; one that is PRESENT but shorter is reported
// with the number of entries an overwrite would drop. Those are different reports on purpose.
ok("a wholly omitted array is reported by its bare name", lost.includes("floorPlans"))
ok("a PRESENT but shrunken array is reported with how many entries it would drop",
  lost.includes("communityAmenities[3 entries]"))
ok("an update that omits nothing reports nothing", omittedKeys(stored, stored).length === 0)
ok("a nested omission is reported with its full path",
  omittedKeys(stored, { geography: { market: "Houston" } } as never).includes("geography.district"))

console.log("\npricing is deliberately NOT merged this way:")
const src = read("lib/social/mergeResearch.ts")
ok("the module says so, and explains why", /Pricing is deliberately NOT merged/.test(src))
ok("it is pure — no fetch, no clock, no database", !/fetch\(|createClient|Date\.now|new Date/.test(src))

// ── THE RESTORE CONTRACT ────────────────────────────────────────────────────────────────────
console.log("\nrestore workflow — the safeguards you asked for:")
const r = read("scripts/social/restoreRevision.mjs")
const codeOnly = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
const rc = codeOnly(r)
ok("an EXACT revision id is required — no 'latest', no ranges",
  /An exact --revision <id> is required/.test(r) && !/order\("id", \{ ascending: false \}\)[\s\S]{0,80}limit\(1\)[\s\S]{0,40}apply/.test(rc))
// Count DATABASE writes specifically. A bare /\.update\(/ also matches createHash().update(),
// which is the staleness token and writes nothing.
ok("PREVIEW is the default — exactly ONE database write exists in the whole script",
  /if \(!has\("apply"\)\)/.test(rc) && (rc.match(/sb\.from\([^)]*\)\.update\(/g) ?? []).length === 1)
ok("...and it sits after the --apply guard, not before it",
  rc.indexOf('if (!has("apply"))') < rc.search(/sb\.from\([^)]*\)\.update\(/))
ok("the preview prints CURRENT and WOULD BECOME", /CURRENT:/.test(r) && /WOULD BECOME:/.test(r))
ok("apply refuses without a confirm token", /--apply requires --confirm-token/.test(r))
ok("the token is bound to the row's current values", /stateToken = \(row, fields\)/.test(rc) && /createHash\("sha256"\)/.test(rc))
ok("a row that changed since the preview is REFUSED",
  /REFUSING: the row changed since the preview/.test(r) && /supplied !== token/.test(rc))
ok("only the revision's own fields are restored unless narrowed further",
  /const fields = typeof requested === "string"/.test(rc) && /: rev\.changed_fields/.test(rc))
ok("it writes stored values straight back — no generator is imported",
  !/buildCaption|buildHashtags|buildTemplateHeadline|composePost/.test(r))
ok("it handles the table with no `id` column", /social_floorplan_observations: "social_content_id"/.test(rc))
ok("a deleted row is refused rather than silently recreated", /no longer exists/.test(r))
ok("the restore is itself recorded, and the script says so", /can be undone the same way/.test(r))

// ── MEDIA IS NOT IN THE BLAST RADIUS ────────────────────────────────────────────────────────
console.log("\nmedia protections are untouched:")
const mig = read("supabase/migrations/20261021000000_social_revisions.sql").replace(/^--.*$/gm, "")
for (const col of ["storage_path", "thumb_storage_path", "rendered_storage_path"]) {
  ok(`the migration never watches ${col}`, !new RegExp(`'${col}'`).test(mig))
}
ok("source uploads are still write-once",
  /upsert: false/.test(read("components/crm/social/BulkReview.tsx")) &&
  /upsert: false/.test(read("components/crm/social/PostEditor.tsx")))
ok("the source-deletion guard is still in place", /Refusing to delete .* ORIGINAL SOURCE VIDEO/.test(read("lib/social/storagePaths.ts")))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
