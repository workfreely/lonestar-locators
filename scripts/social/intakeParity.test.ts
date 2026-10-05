/**
 * SOCIAL BEAST — intake parity (Upload Video + Bulk Review).
 *
 * Both intake surfaces write the SAME social_content columns the Post Editor later edits, so they
 * must offer the same vocabularies. Two defects motivated this:
 *   1. a UUID/hash filename became a "property name", arriving as garbage in the search field
 *   2. Area / Special / Amenities were free text, so intake and the editor disagreed about what a
 *      valid value even was
 *
 * The rule throughout: REUSE the canonical source, never add a second list.
 *
 * Run: npx tsx scripts/social/intakeParity.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { isPlausiblePropertyName, propertyNamePrefill, areaOptionsForMarket, isCanonicalArea, preservedAreaValue } from "@/lib/social/intakeFields"
import { getMarketByName } from "@/lib/markets/catalog"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const UPLOAD = "components/crm/social/SocialAutopilotClient.tsx"
const BULK = "components/crm/social/BulkReview.tsx"
const AREA = "components/crm/social/AreaSelect.tsx"

console.log("\nINTAKE PARITY\n")

console.log("FILENAME GUARD — the reported strings specifically:")
{
  ok('"212b44d5565644509ce5e4f2c2a5c82a" is rejected', !isPlausiblePropertyName("212b44d5565644509ce5e4f2c2a5c82a"))
  ok("…a hyphenated UUID is rejected", !isPlausiblePropertyName("4C2A1F8E-9B7D-4A3C-8E21-77F0C5D9AB34"))
  ok("…and the space-separated form the parser produces", !isPlausiblePropertyName("4C2A1F8E 9B7D 4A3C 8E21 77F0C5D9AB34"))
  ok('"Alaro Luxury Villas" still passes', isPlausiblePropertyName("Alaro Luxury Villas"))
  ok('"Alaro Luxury Villas - Dallas" still passes', isPlausiblePropertyName("Alaro Luxury Villas - Dallas"))
  // Real names that must survive.
  for (const n of ["EastEnder", "The National", "1400HiLine", "NOVEL River Oaks by Crescent Communities", "3700M", "24Eleven Washington"]) {
    ok(`real name survives: "${n}"`, isPlausiblePropertyName(n))
  }
  // Other junk shapes.
  ok("IMG_1234 is rejected", !isPlausiblePropertyName("IMG 1234"))
  ok("a timestamp is rejected", !isPlausiblePropertyName("20261005 142233"))
  ok("RPReplay-style export is rejected", !isPlausiblePropertyName("RPReplay Final1759650000"))
  ok("one real word adrift in hex is rejected", !isPlausiblePropertyName("IMG 4C2A1F8E 9B7D 4A3C"))
  ok("too short is rejected", !isPlausiblePropertyName("ab"))
  ok("empty / null are rejected", !isPlausiblePropertyName("") && !isPlausiblePropertyName(null))
  // The prefill helper returns "" rather than the junk.
  ok("prefill blanks the junk", propertyNamePrefill("212b44d5565644509ce5e4f2c2a5c82a") === "")
  ok("…and passes a real name through trimmed", propertyNamePrefill("  Alaro Luxury Villas  ") === "Alaro Luxury Villas")
}

console.log("\nAREA OPTIONS COME FROM THE CANONICAL CATALOG:")
{
  const sa = areaOptionsForMarket("San Antonio")
  ok("San Antonio has neighborhoods", sa.neighborhoods.length > 0)
  ok("…including Stone Oak", sa.neighborhoods.includes("Stone Oak"))
  ok("…and submarkets", sa.submarkets.length > 0)
  // Identity with the catalog, so this cannot drift into a second list.
  const cat = getMarketByName("San Antonio")!
  ok("the options ARE the catalog arrays, not a copy",
    sa.neighborhoods.join("|") === cat.neighborhoods.join("|") && sa.submarkets.join("|") === cat.submarkets.join("|"))
  ok("a different market yields different options",
    areaOptionsForMarket("Houston").neighborhoods.join("|") !== sa.neighborhoods.join("|"))
  ok("unknown / empty market yields no options",
    areaOptionsForMarket("Atlantis").neighborhoods.length === 0 && areaOptionsForMarket("").neighborhoods.length === 0)
}

console.log("\nAN EXISTING OFF-BANK VALUE IS NEVER DESTROYED:")
{
  ok("a canonical value is recognised", isCanonicalArea("San Antonio", "Stone Oak"))
  ok("…and needs no preservation entry", preservedAreaValue("San Antonio", "Stone Oak") === null)
  ok("an off-bank value IS preserved", preservedAreaValue("San Antonio", "Somewhere Custom") === "Somewhere Custom")
  // The market-switch case: Stone Oak is canonical for San Antonio, foreign to Houston.
  ok("switching market keeps the old value selectable",
    preservedAreaValue("Houston", "Stone Oak") === "Stone Oak")
  ok("empty stays empty (nothing to preserve)", preservedAreaValue("San Antonio", "") === null)
  const ui = read(AREA)
  ok("the picker renders the preserved value as an option", /preserved && \(/.test(ui) && /Current value/.test(ui))
  ok("…is disabled until a market is chosen", /Select a market first/.test(ui))
  ok("…and keeps an Other… escape to free text", /__other__/.test(ui) && /Other…/.test(ui))
  ok("the two groups are visually separated", /Neighborhoods \/ Areas/.test(ui) && /Submarkets/.test(ui))
  ok("it reads the shared helper, not its own list", /areaOptionsForMarket/.test(ui) && !/Stone Oak/.test(ui))
}

console.log("\nBOTH INTAKE SURFACES USE THE SHARED CONTROLS:")
{
  const up = read(UPLOAD), bulk = read(BULK)
  ok("upload uses AreaSelect", /<AreaSelect/.test(up))
  ok("bulk review uses AreaSelect", /<AreaSelect/.test(bulk))
  ok("upload uses SpecialSelect", /<SpecialSelect/.test(up))
  ok("upload uses AmenitySelect", /<AmenitySelect/.test(up))
  ok("both apply the filename guard", /propertyNamePrefill\(inf\.propertyName\)/.test(up) && /propertyNamePrefill\(inf\.propertyName\)/.test(bulk))
  // No free-text area inputs left on either surface.
  ok("no free-text area placeholder remains",
    !/e\.g\. Schertz, Stone Oak/.test(up) && !/e\.g\. Schertz, Stone Oak/.test(bulk))
  // Amenities go through the shared serializer, so the stored format is unchanged.
  ok("amenities use the shared parse/serialize helpers",
    /parseAmenities\(batch\.amenities\)/.test(up) && /serializeAmenities\(next\)/.test(up))
  ok("…with the editor's default 3-cap (no max override)", !/<AmenitySelect[^>]*max=/.test(up))
  ok("no second amenity or special vocabulary was introduced",
    !/AMENITY_BANK\s*=/.test(up) && !/SOCIAL_SPECIAL_OPTIONS\s*=/.test(up))
}

console.log("\nPRICE LABEL MODE REACHES THE SAME COLUMN:")
{
  const up = read(UPLOAD), route = read("app/api/admin/social-autopilot/content/route.ts")
  ok("the upload modal exposes the two modes", /PRICE_LABEL_MODES\.map/.test(up))
  ok("…labelled as the editor labels them", /Starting at/.test(up) && /Exact unit shown/.test(up))
  ok("…and sends it with the upload", /priceLabelMode: meta\.priceLabelMode/.test(up))
  ok("the content route writes price_label_mode", /price_label_mode: body\.priceLabelMode === "exact_unit"/.test(route))
  ok("…narrowing anything unrecognised to starting_at", /: "starting_at"/.test(route))
}

console.log("\nOUT-OF-SCOPE SURFACES UNTOUCHED:")
{
  const up = read(UPLOAD), bulk = read(BULK)
  ok("PropertySearchField is still used as-is on both", /<PropertySearchField/.test(up) && /<PropertySearchField/.test(bulk))
  ok("place_id matching is unchanged (onMatch still sets it)", /placeId: m\.placeId, matched: true/.test(up))
  ok("no publishing / auto-posting reference crept in",
    !/autoPosting|media_publish|createReelContainer/.test(up) && !/autoPosting|media_publish/.test(bulk))
  ok("no typography / safe-area reference", !/HOOK_MAX_PX|safeAreaFor/.test(up) && !/HOOK_MAX_PX|safeAreaFor/.test(bulk))
  ok("no Property Research reference", !/social_property_observations|PropertyResearch/.test(up))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
if (fail > 0) process.exit(1)
