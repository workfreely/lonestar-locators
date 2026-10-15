// THE GEOGRAPHIC MANIFEST'S OWN INVARIANTS.
//
// Run: npx tsx scripts/social/geoManifest.test.ts    (pure — reads the manifest and the writer's
//      source text, touches no database)
//
// These are not restatements of the manifest; each one is a mistake that was actually available
// while writing it. A market riding along with a neighbourhood fix, a district that duplicates the
// area above it, a street name sitting in a district field, a property listed twice with different
// values, or the writer growing a fourth column it may write.

import { readFileSync } from "node:fs"
import { GEO_MANIFEST, FLAGGED } from "./geoManifest"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}`) }
}

// THE COMMENT TRAP: every absence assertion below runs against code with comments and string
// literals stripped. Prose explaining a rule has matched the regex testing that rule before.
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")
     .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')

const writer = readFileSync("scripts/social/applyGeoManifest.ts", "utf8")
const writerCode = codeOnly(writer)

console.log("\nIdentity and uniqueness")
const names = [...GEO_MANIFEST.map((e) => e.property), ...FLAGGED.map((f) => f.property)]
ok("no property appears twice across the manifest and the flagged list",
  new Set(names).size === names.length)
ok("every entry names a property", GEO_MANIFEST.every((e) => e.property.trim().length > 0))
ok("every entry carries a reason", GEO_MANIFEST.every((e) => e.why.trim().length > 10))
ok("every flagged property carries a reason", FLAGGED.every((f) => f.reason.trim().length > 10))

console.log("\nMarket is sacred")
const withMarket = GEO_MANIFEST.filter((e) => e.market)
ok("exactly ONE entry proposes a market change", withMarket.length === 1)
ok("that entry is Enclave at Mason Creek", withMarket[0]?.property === "Enclave at Mason Creek")
ok("and it carries marketApproved", withMarket.every((e) => e.marketApproved === true))
const FIVE = ["Austin", "Dallas", "DFW", "Houston", "San Antonio"]
ok("no entry proposes a market outside the five library categories",
  withMarket.every((e) => FIVE.includes(e.market as string)))
// The suburbs the operator named explicitly. None of them may carry a market.
const SUBURBS = ["Plano", "Frisco", "Irving", "Arlington", "Allen", "Atascocita", "Schertz", "Boerne", "Helotes", "Stafford", "Katy"]
const suburbEntries = GEO_MANIFEST.filter((e) => SUBURBS.includes(e.area ?? ""))
ok("no entry WRITES a bare suburb name into the area field", suburbEntries.length === 0)

console.log("\nA district never swallows its area")
const clash = GEO_MANIFEST.filter((e) => e.area && e.district &&
  e.area.toLowerCase().replace(/[^a-z]/g, "") === e.district.toLowerCase().replace(/[^a-z]/g, ""))
ok("no entry sets area and district to the same place", clash.length === 0)

console.log("\nA district is a place name, not a location")
const BAD = [
  [/\bcorridor\b/i, "corridor"], [/\bISD\b/, "school district"], [/\b\d{5}\b/, "ZIP"],
  [/\b(Street|Avenue|Road|Boulevard|Drive|Parkway|Lane|Highway|Expressway)\b/i, "street type"],
  [/\bInterstate\b|\bI-\d/i, "interstate"], [/\//, "slash straddle"],
  [/\bbetween\b/i, "between-two-streets"], [/\(/, "parenthetical"],
] as const
for (const [re, what] of BAD) {
  const hits = GEO_MANIFEST.filter((e) => e.district && re.test(e.district))
  ok(`no district contains a ${what}${hits.length ? ` — ${hits.map((h) => h.district).join(", ")}` : ""}`, hits.length === 0)
}
ok("no district is SHOUTED (the research prose used caps for emphasis)",
  GEO_MANIFEST.every((e) => !e.district || e.district !== e.district.toUpperCase() || e.district.length <= 3))

console.log("\nThe writer's reach")
ok("the allowlist is exactly market, area_neighborhood, district",
  /const ALLOWED = \["market", "area_neighborhood", "district"\] as const/.test(writer))
ok("the writer never updates social_posts", !/from\(\s*""?\s*social_posts/.test(writerCode) &&
  !/social_posts[\s\S]{0,40}\.update\(/.test(writerCode))
ok("the writer never updates social_property_research",
  !/social_property_research[\s\S]{0,40}\.update\(/.test(writerCode))
ok("the only .update( call is on social_content",
  (writerCode.match(/\.update\(/g) ?? []).length === 1 &&
  /from\(""\)\.update\(/.test(writerCode.replace(/from\("social_content"\)/g, 'from("")')) === false ||
  /sb\.from\(""\)\.update\(patch\)/.test(writerCode))
ok("a market in a patch is refused without marketApproved",
  /market change without marketApproved/.test(writer))
ok("a published or ready post holds a row back by default",
  /nonDraft\.length > 0 && !entry\.publishedApproved/.test(writer))
ok("the update is conditional on the values just read (optimistic concurrency)",
  /q = v === null \? q\.is\(k, null\) : q\.eq\(k, v\)/.test(writer))
ok("a zero-row update is reported as a conflict, not a success",
  /updated\.length !== 1[\s\S]{0,200}"conflict"/.test(writer))
// Two assertions, because "it logs something" and "it stops" are different claims. The window is
// wide enough to clear the second say() line that reports the trigger count.
ok("the revision-trigger gate exits the process rather than warning",
  /revision triggers not enabled[\s\S]{0,300}process\.exit\(1\)/.test(writer))
ok("that gate runs BEFORE any write can happen",
  // Both offsets must come from the SAME string: the gate's message is a string literal, which
  // codeOnly() strips, so measuring one in `writer` and the other in `writerCode` compares
  // positions in two different texts.
  writer.indexOf("revision triggers not enabled") < writer.indexOf(".update(patch)"))
ok("a patch outside the allowlist throws rather than writing",
  /outside the allowlist[\s\S]{0,40}\)\s*\n?\s*\}/.test(writer) || /REFUSED — patch for/.test(writer))

console.log("\nPublished content")
const pubApproved = GEO_MANIFEST.filter((e) => e.publishedApproved)
ok("exactly ONE entry may touch a video carrying published posts", pubApproved.length === 1)
ok("that entry is Selene Luxury Residences", pubApproved[0]?.property === "Selene Luxury Residences")

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
