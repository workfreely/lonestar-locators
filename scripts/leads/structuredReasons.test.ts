/**
 * "WHY I CHOSE THIS FOR YOU" — the three structured slots.
 *
 *   npx tsx scripts/leads/structuredReasons.test.ts
 *
 * The storage did not change: reasons are still strings on lead_property_reasons. So the thing
 * worth proving is not that the editor works, but that it cannot DAMAGE anything — no saved line
 * reordered, no casing rewritten, no legacy text coerced into a dropdown, no canonical rent
 * overwritten, and the distance reason untouched.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  parseReasons, buildReasons, formatBedroomPrice, formatAmenities, reasonOverflow,
  rentColumnFor, BEDROOM_OPTIONS, AMENITY_JOINER,
  sanitizeHighlight, isHighlightShaped, isCustomHighlight, MAX_HIGHLIGHT_LEN,
} from "@/lib/leads/structuredReasons"
import { MAX_REASONS } from "@bc/companion-shared"
import { RECOMMENDATION_AMENITIES, MAX_RECOMMENDATION_AMENITIES, amenityByLabel, searchAmenities } from "@/lib/leads/recommendationAmenities"
import { MUST_HAVE_AMENITIES } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const EDITOR = read("components/crm/ReasonsControl.tsx")
const CARD = read("components/crm/BestMatches.tsx")

// ── 1. SLOT 2: BEDROOMS & PRICE ───────────────────────────────────────────────────────────────
console.log("the price line is generated, not typed:")
for (const [bed, price, expect] of [
  ["1br", "1450", "1BR from $1,450/month"],
  ["2br", "1725", "2BR from $1,725/month"],
  ["3br", "1899", "3BR from $1,899/month"],
  ["studio", "1200", "Studio from $1,200/month"],
  ["townhome", "2400", "Townhome from $2,400/month"],
] as const) ok(`${bed} + ${price} → "${expect}"`, formatBedroomPrice(bed as never, price) === expect)
ok("a messy price still formats", formatBedroomPrice("2br" as never, "$1,725.00") === "2BR from $1,725/month")
console.log("\n…and omitted when the price is not confirmed:")
ok("no price → no reason", formatBedroomPrice("2br" as never, "") === null)
ok("no bedroom → no reason", formatBedroomPrice(null, "1725") === null)
ok("a zero price → no reason", formatBedroomPrice("2br" as never, "0") === null)
ok("junk → no reason", formatBedroomPrice("2br" as never, "call for pricing") === null)
ok("every supported bedroom type is offered", BEDROOM_OPTIONS.length >= 4 &&
  ["studio", "1br", "2br", "3br"].every((v) => BEDROOM_OPTIONS.some((b) => b.value === v)))
ok("…including the ones beyond 3BR, rather than limiting the system",
  ["4br", "townhome", "loft", "penthouse"].every((v) => BEDROOM_OPTIONS.some((b) => b.value === v)))

console.log("\nprefill reads Property Intelligence, and never writes it:")
for (const [bed, col] of [["1br", "onebr_starting_rent"], ["2br", "twobr_starting_rent"], ["3br", "threebr_starting_rent"], ["studio", "studio_starting_rent"]] as const)
  ok(`${bed} → ${col}`, rentColumnFor(bed as never) === col)
ok("the editor prefills ONLY an empty field",
  /structured\.price\.trim\(\) === "" && typeof canonical === "number"/.test(EDITOR))
ok("…so a saved price is never replaced by a newer canonical value", /: structured\.price/.test(EDITOR))
ok("the editor never writes a starting rent back", !/startingRents\s*\[[^\]]*\]\s*=/.test(EDITOR) && !/property_catalog/.test(EDITOR))
ok("the prop is documented as prefill-only", /never to replace a price already stored/.test(readFileSync(join(process.cwd(), "components/crm/ReasonsControl.tsx"), "utf8")))

// ── 2. SLOT 3: AMENITIES ──────────────────────────────────────────────────────────────────────
console.log("\namenities: standardized, searchable, at most two:")
ok("the cap is two", MAX_RECOMMENDATION_AMENITIES === 2)
ok("formatAmenities joins with ' + '", formatAmenities(["Private Yard", "W/D Included"]) === "Private Yard + W/D Included")
ok("…and truncates beyond two", formatAmenities(["Pool", "Balcony", "Kitchen Island"]) === "Pool + Balcony")
ok("none → no reason", formatAmenities([]) === null)
ok("the approved examples all format", [
  ["Private Yard", "W/D Included"], ["Kitchen Island", "Walk-in Closets"], ["Floor-to-Ceiling Windows", "Balcony"],
].every(([a, b]) => formatAmenities([a, b]) === `${a}${AMENITY_JOINER}${b}`))
ok("search filters by label", searchAmenities("gar").every((a) => /gar/i.test(a.label)) && searchAmenities("gar").length > 0)
ok("an empty query returns everything", searchAmenities("").length === RECOMMENDATION_AMENITIES.length)
ok("the editor caps selection in the UI too", /structured\.amenities\.length < MAX_RECOMMENDATION_AMENITIES/.test(EDITOR))
ok("no free-text amenity entry remains", !/placeholder="Short fragment/.test(EDITOR))

console.log("\n…and the list REUSES the existing shared sources:")
ok("it imports the shared must-have list", /MUST_HAVE_AMENITIES/.test(readFileSync(join(process.cwd(), "lib/leads/recommendationAmenities.ts"), "utf8")))
{
  const reused = RECOMMENDATION_AMENITIES.filter((a) => MUST_HAVE_AMENITIES.some((m) => m.value === a.value))
  ok(`${reused.length} of ${RECOMMENDATION_AMENITIES.length} entries reuse a Smart Form value`, reused.length >= 10)
  ok("every entry declares where its value comes from",
    RECOMMENDATION_AMENITIES.every((a) => ["must_have", "attribute_key", "catalog_column", "editor_only"].includes(a.source)))
  // Exactly two values have no canonical home: a balcony is nowhere in the registry, and
  // "Garage Parking" is generic on purpose so it cannot claim a specific garage attribute.
  ok("the invented values are exactly the two that have no canonical source",
    JSON.stringify(RECOMMENDATION_AMENITIES.filter((a) => a.source === "editor_only").map((a) => a.value).sort())
      === JSON.stringify(["balcony", "garage_parking"]))
}
console.log("\n…and selecting one is NOT a verification:")
{
  const SRC = readFileSync(join(process.cwd(), "lib/leads/recommendationAmenities.ts"), "utf8")
  ok("the module says so explicitly", /never writes property_attributes/.test(SRC))
  ok("the editor writes no attribute", !/property_attributes|writeAttributes|ownerOverride/.test(EDITOR))
  ok("…and writes no verification", !/verification_status|verified_at|checked_at|setVerified/i.test(EDITOR))
  // The word "verified" now appears, but only in the chip's own denial. A typed highlight must
  // say out loud that it is NOT a confirmed property feature, which is the point of requirement 7.
  ok("…and the typed chip denies being verified", /not a verified property feature/i.test(EDITOR))
  ok("…with no affirmative claim anywhere", !/\bis verified\b|\bVerified\b(?! property feature)/.test(EDITOR.replace(/not a verified property feature/gi, "")))
}

// ── 3. SLOT 1: DISTANCE, UNTOUCHED ────────────────────────────────────────────────────────────
console.log("\nthe distance reason is read, never computed or edited:")
ok("a distance line is recognised", parseReasons(["19 min to Fort Sam"]).distance === "19 min to Fort Sam")
ok("…and round-trips verbatim", buildReasons(parseReasons(["19 min to Fort Sam"]))[0] === "19 min to Fort Sam")
ok("…always first", buildReasons({ distance: "11 min to Fort Sam", bedroom: "2br", price: "1725", amenities: ["Pool"], legacy: [] })[0] === "11 min to Fort Sam")
ok("the editor renders it read-only", /1 · Distance · automatic/.test(readFileSync(join(process.cwd(), "components/crm/ReasonsControl.tsx"), "utf8")))
ok("…with no input bound to it", !/value=\{structured\.distance\}/.test(EDITOR))
// The WORD appears in legitimate copy ("No commute generated for this client yet"), so this
// asserts the absence of a CALCULATION rather than of the noun.
ok("the editor computes no commute", !/haversine|distanceBetween|google\.maps|DirectionsService|commute_minutes\s*=/.test(EDITOR))
ok("…and imports nothing that could", !/from "@\/lib\/.*commute|from "@\/lib\/propertyExplorer/.test(EDITOR))

// ── 4. THE ORDER, AND LEGACY SAFETY ───────────────────────────────────────────────────────────
console.log("\nthe three reasons are emitted in the approved order:")
ok("distance → price → amenities",
  JSON.stringify(buildReasons({ distance: "19 min to Fort Sam", bedroom: "2br", price: "1725", amenities: ["Private Yard", "W/D Included"], legacy: [] }))
  === JSON.stringify(["19 min to Fort Sam", "2BR from $1,725/month", "Private Yard + W/D Included"]))
ok("…and a missing slot is simply absent, not blank",
  JSON.stringify(buildReasons({ distance: "19 min to Fort Sam", bedroom: null, price: "", amenities: ["Pool"], legacy: [] }))
  === JSON.stringify(["19 min to Fort Sam", "Pool"]))

console.log("\nlegacy free text is kept, never coerced:")
{
  const legacy = ["20 min to Fort Sam", "W/D inlcuded", "Private Yard"]
  const p = parseReasons(legacy)
  // It is now offered back as TYPED WORDING rather than stranded in legacy — but the guarantee
  // that mattered is untouched: it is never resolved to a canonical amenity value, so nothing
  // guesses which amenity the misspelling meant.
  ok("a typo is kept as typed wording, not guessed into an amenity",
    p.amenities.includes("W/D inlcuded") && amenityByLabel("W/D inlcuded") === null && isCustomHighlight("W/D inlcuded"))
  ok("…and the line is preserved exactly", buildReasons(p).includes("W/D inlcuded"))
  ok("an untouched legacy row saves back byte-identical", JSON.stringify(buildReasons(p)) === JSON.stringify(legacy),
    JSON.stringify(buildReasons(p)))
  // Casing: a real stored row used "Walk-In Closets"; the canonical label is "Walk-in Closets".
  const cased = ["6 min to Frisco", "Walk-In Closets + Kitchen Island"]
  ok("stored casing is not rewritten", JSON.stringify(buildReasons(parseReasons(cased))) === JSON.stringify(cased))
  ok("…while the chip still resolves", amenityByLabel("Walk-In Closets")?.value === "walk_in_closet")
  // A short unrecognised part is now valid custom wording and IS claimed…
  const mixed = parseReasons(["Pool + Something We Don't Know"])
  ok("a short unknown part is claimed as custom wording",
    mixed.amenities.length === 2 && mixed.amenities[1] === "Something We Don't Know")
  // …but a part that is PROSE sends the whole line to legacy rather than being jammed into a slot.
  const prose = parseReasons(["Pool + they loved the courtyard, and the manager was great"])
  ok("a prose part keeps the whole line as legacy", prose.legacy.length === 1 && prose.amenities.length === 0)
  const longLine = parseReasons(["A highlight far too long to belong on one client card line"])
  ok("an over-long line stays legacy", longLine.legacy.length === 1 && longLine.amenities.length === 0)
}
ok("the editor shows legacy lines rather than hiding them", /Previously saved reasons/.test(readFileSync(join(process.cwd(), "components/crm/ReasonsControl.tsx"), "utf8")))
ok("…and saves them back", /for \(const l of s\.legacy\)/.test(readFileSync(join(process.cwd(), "lib/leads/structuredReasons.ts"), "utf8")))

// ── 5. AVERAGE RENT ───────────────────────────────────────────────────────────────────────────
console.log("\nAverage Rent is reused, optional, and never auto-enabled:")
ok("the calculator is imported, not reimplemented", /averageRentLine/.test(EDITOR))
ok("…and no calculation lives in the editor", !/concessionWeeks\s*\/\s*4|weeks\s*\*\s*7/.test(EDITOR))
// Compared against the RENDER gate, not the first textual match — `showAverageRent &&` also
// appears in the save handler, far above the markup.
ok("it appears under Bedrooms & Price",
  EDITOR.indexOf("2 · Bedrooms") < EDITOR.indexOf("showAverageRent && (Boolean(formatBedroomPrice"))
ok("…revealed by a bedroom AND a price", /Boolean\(formatBedroomPrice\(structured\.bedroom, structured\.price\)\)/.test(EDITOR))
ok("…but SAVED figures keep it reachable regardless", /\|\| hasSavedAverageRent/.test(EDITOR))
ok("the Show checkbox is never defaulted on", /useState\(averageRent\?\.show === true\)/.test(EDITOR))
ok("it only writes when something changed", /arChanged \? await onSaveAverageRent/.test(EDITOR))
ok("editing a reason does not clear it", !/setArRent\(""\)|setArShow\(false\)/.test(EDITOR.replace(/setArRent\(txt\(/g, "")))

// ── 6. THE EDITOR IS SIMPLIFIED ───────────────────────────────────────────────────────────────
console.log("\nthe confusing controls are gone:")
ok("no '+ Add Reason'", !/Add Reason/i.test(EDITOR))
ok("no washer/dryer verification dropdown", !/WASHER_DRYER_OPTIONS|asWasherDryerStatus/.test(EDITOR))
ok("…and the card stopped passing it", !/onSaveWasherDryer=\{/.test(CARD))
ok("W/D is still choosable as an AMENITY", RECOMMENDATION_AMENITIES.some((a) => a.label === "W/D Included"))
ok("…and W/D verification still exists elsewhere (the Property Intelligence pencil)",
  /washerDryerIncluded|washer_dryer_included/.test(read("components/crm/PropertyPricingEditor.tsx")))

// ── 7. THE CARD LAYOUT ────────────────────────────────────────────────────────────────────────
console.log("\nthe commission badge has its own row:")
ok("the reasons get the full width", /<div className="mt-2 w-full">/.test(CARD))
ok("…and the badge sits on a right-aligned row below", /<div className="mt-1\.5 flex w-full justify-end">[\s\S]{0,160}?<CommissionBadge/.test(CARD))
ok("…no longer flex-none inside the reasons row", !/<CommissionBadge status=\{commission\} size="row" className="flex-none" \/>/.test(CARD))
ok("the badge component itself is unchanged", /<CommissionBadge status=\{commission\} size="row" \/>/.test(CARD))
ok("Favorites' layout is untouched", /<CommissionBadge status=\{favCommission\} size="row" \/>/.test(read("components/crm/LeadFavorites.tsx")))

// ── 8. EDGE CASE 1 — THE FOURTH REASON ────────────────────────────────────────────────────────
// A client's card shows MAX_REASONS. Adding Bedrooms & Price to a property that already had a
// distance and TWO amenity lines produced a fourth — and `save` sliced, so the fourth was not
// hidden, it was DELETED.
console.log("\nadding a price to a full set cannot delete a line:")
{
  const real = ["20 min to Fort Sam", "W/D Included", "Private Yard"]
  const p = parseReasons(real)
  ok("two separate amenity lines now fill the ONE slot",
    JSON.stringify(p.amenities) === JSON.stringify(["W/D Included", "Private Yard"]), JSON.stringify(p))
  ok("…so neither falls to legacy", p.legacy.length === 0)
  ok("…and an untouched save still returns the original", JSON.stringify(buildReasons(p)) === JSON.stringify(real))
  const withPrice = { ...p, bedroom: "2br" as const, price: "1725" }
  const built = buildReasons(withPrice)
  ok(`adding 2BR/$1,725 yields exactly ${MAX_REASONS} lines`, built.length === MAX_REASONS, JSON.stringify(built))
  ok("…in the approved order",
    JSON.stringify(built) === JSON.stringify(["20 min to Fort Sam", "2BR from $1,725/month", "W/D Included + Private Yard"]))
  ok("…and nothing overflows", reasonOverflow(withPrice, MAX_REASONS).dropped.length === 0)
}
console.log("\n…and when something genuinely cannot fit, it is SHOWN, not cut:")
{
  // Two unparseable legacy lines + a distance + a price is four.
  const over = { distance: "19 min to Fort Sam", bedroom: "2br" as const, price: "1725", amenities: [], legacy: ["W/D inlcuded", "Great leasing team"] }
  const o = reasonOverflow(over, MAX_REASONS)
  ok("the overflow is reported", o.dropped.length === 1, JSON.stringify(o))
  ok("…naming the exact line", o.dropped[0] === "Great leasing team")
  ok("buildReasons itself never truncates", buildReasons(over).length === 4)
  const EDITOR_RAW = readFileSync(join(process.cwd(), "components/crm/ReasonsControl.tsx"), "utf8")
  ok("the editor stopped slicing on save", !/buildReasons\(structured\)\.slice\(0, MAX_REASONS\)/.test(EDITOR_RAW))
  ok("…blocks the save instead", /cleaned\.length > MAX_REASONS/.test(EDITOR_RAW))
  ok("…disables the button", /disabled=\{saving \|\| overflow\.dropped\.length > 0\}/.test(EDITOR_RAW))
  ok("…and tells the locator which lines", /These would not be sent/.test(EDITOR_RAW))
  ok("…promising nothing is deleted for them", /nothing is deleted for you/.test(EDITOR_RAW))
}

// ── 9. EDGE CASE 2 — GARAGE PARKING IS NOT A DETACHED GARAGE ──────────────────────────────────
console.log("\n'Garage Parking' claims no specific attribute:")
{
  const garage = RECOMMENDATION_AMENITIES.find((a) => a.label === "Garage Parking")!
  ok("it no longer borrows detached_garage", garage.value !== "detached_garage", garage.value)
  ok("…it has its own generic value", garage.value === "garage_parking")
  ok("…marked as editor-only, not a canonical key", garage.source === "editor_only")
  ok("Attached Garage still maps to its real key",
    RECOMMENDATION_AMENITIES.find((a) => a.label === "Attached Garage")?.value === "attached_garage")
  ok("Detached Garage is offered explicitly, by name",
    RECOMMENDATION_AMENITIES.find((a) => a.label === "Detached Garage")?.value === "detached_garage")
  ok("…so a locator who means a specific one picks it by name",
    ["Attached Garage", "Detached Garage", "Garage Parking"].every((l) => RECOMMENDATION_AMENITIES.some((a) => a.label === l)))
  ok("every value is still unique", new Set(RECOMMENDATION_AMENITIES.map((a) => a.value)).size === RECOMMENDATION_AMENITIES.length)
}

// ── 10. LEGACY LINES ARE EDITABLE ─────────────────────────────────────────────────────────────
console.log("\npreviously saved reasons are editable, not frozen:")
{
  const EDITOR_RAW = readFileSync(join(process.cwd(), "components/crm/ReasonsControl.tsx"), "utf8")
  ok("the section is named for what it holds", /Previously saved reasons/.test(EDITOR_RAW))
  ok("each line is an input, not static text", /value=\{line\}[\s\S]{0,200}?onChange=/.test(EDITOR_RAW))
  ok("…editing one replaces only that line", /structured\.legacy\.map\(\(l, j\) => \(j === i \? e\.target\.value : l\)\)/.test(EDITOR_RAW))
  ok("…and it can still be removed", /structured\.legacy\.filter\(\(_, j\) => j !== i\)/.test(EDITOR_RAW))
  ok("they are NOT pushed into the structured controls", !/legacy[\s\S]{0,80}?amenityByLabel/.test(EDITOR_RAW))
  ok("…and are preserved verbatim when untouched", JSON.stringify(buildReasons(parseReasons(["5 min to X", "odd legacy line"]))) === JSON.stringify(["5 min to X", "odd legacy line"]))
}

// ── CUSTOM HIGHLIGHT WORDING ──────────────────────────────────────────────────────────────────
console.log("\neither slot takes a standardized label OR typed wording:")
{
  ok("a typed phrase is claimed", JSON.stringify(parseReasons(["Spacious Closets"]).amenities) === JSON.stringify(["Spacious Closets"]))
  ok("…and is marked as custom", isCustomHighlight("Spacious Closets"))
  ok("a standardized label is not", !isCustomHighlight("Private Yard"))
  ok("the two mix on one line", JSON.stringify(parseReasons(["Pool + Private Backyard"]).amenities) === JSON.stringify(["Pool", "Private Backyard"]))
  for (const ex of ["Spacious Closets", "Private Backyard", "Plenty of Natural Light"]) {
    ok(`the brief's own example works — "${ex}"`, isHighlightShaped(ex))
  }
}

console.log("\nTWO HIGHLIGHTS TOTAL — picks and typed wording share the one cap:")
{
  const two = parseReasons(["Pool + Spacious Closets"])
  ok("two custom/standard mixed fills the slot", two.amenities.length === MAX_RECOMMENDATION_AMENITIES)
  // A third part on one line cannot fit, so the line is NOT claimed — it is preserved whole
  // rather than silently truncated to two.
  const three = parseReasons(["Pool + Spacious Closets + Great Reviews"])
  ok("a third highlight on one line is not silently dropped",
    three.amenities.length === 0 && three.legacy.length === 1)
  ok("…and that line round-trips verbatim",
    JSON.stringify(buildReasons(three)) === JSON.stringify(["Pool + Spacious Closets + Great Reviews"]))
  // Accumulating across separate lines also stops at two.
  const across = parseReasons(["5 min to X", "Pool", "Large Closets", "Great Reviews"])
  ok("accumulation across lines stops at two", across.amenities.length === 2 && across.legacy.length === 1)
  ok("…and the overflow line is still saved, not deleted",
    buildReasons(across).includes("Great Reviews"))
}

console.log("\ntyped input is sanitized so it cannot break the format:")
{
  ok("the joiner cannot be smuggled in", sanitizeHighlight("Pool + Gym") === "Pool Gym")
  ok("commas and semicolons go", sanitizeHighlight("Big, bright; airy") === "Big bright airy")
  ok("newlines collapse", sanitizeHighlight("Spacious\nClosets") === "Spacious Closets")
  ok("a slash SURVIVES — \"W/D\" must not become \"W D\"", sanitizeHighlight("W/D Included") === "W/D Included")
  ok("it is capped in length", sanitizeHighlight("x".repeat(80)).length === MAX_HIGHLIGHT_LEN)
  ok("whitespace-only is nothing", sanitizeHighlight("   ") === "")
  ok("the input enforces the same cap", new RegExp(`maxLength=\\{MAX_HIGHLIGHT_LEN\\}`).test(EDITOR))
}

console.log("\nthe other slots are not reachable through custom wording:")
{
  ok("a second distance line is never claimed as a highlight", !isHighlightShaped("11 min to Fort Sam"))
  ok("a price line is never claimed as a highlight", !isHighlightShaped("2BR from $1,725/month"))
  const two = parseReasons(["19 min to Fort Sam", "11 min to Fort Sam"])
  ok("…so the duplicate distance stays legacy", two.distance === "19 min to Fort Sam" && two.legacy.includes("11 min to Fort Sam"))
}

console.log("\nthe custom entry reuses the ONE search input (requirement 9):")
{
  ok("no second control was added", (EDITOR.match(/placeholder="Search amenities/g) ?? []).length === 1)
  ok("the input offers its own text as wording", /as your own wording/.test(EDITOR))
  ok("…sanitized first", /sanitizeHighlight\(amenityQuery\)/.test(EDITOR))
  ok("…and never when it duplicates a label", /if \(amenityByLabel\(custom\)\) return null/.test(EDITOR))
  ok("…or a chip already chosen", /sel\.toLowerCase\(\) === custom\.toLowerCase\(\)/.test(EDITOR))
  ok("a typed chip is visually distinct", /isCustomHighlight\(label\)[\s\S]{0,120}?border-dashed/.test(EDITOR))
}

console.log("\nnothing reaches Property Intelligence (requirements 6 + 7):")
{
  ok("the editor creates no attribute key", !/attribute_key|OWNER_CORRECTABLE|property_attributes/.test(EDITOR))
  ok("custom wording is not added to the shared vocabulary",
    !/RECOMMENDATION_AMENITIES\.push|\[\.\.\.RECOMMENDATION_AMENITIES,/.test(EDITOR))
  const AM = readFileSync(join(process.cwd(), "lib/leads/recommendationAmenities.ts"), "utf8")
  ok("the vocabulary stays a fixed const", /as const$/m.test(AM) && !/push\(/.test(AM))
}

// ── LIVE DATA, UNDER THE NEW PARSER ───────────────────────────────────────────────────────────
// The round trip that protects real client-facing text. Every row saved on production as of this
// change must come back byte-identical when nothing is edited — now that short legacy phrases are
// claimed as highlights, this is the assertion that proves the reclassification is non-destructive.
console.log("\nevery live row still round-trips byte-identical:")
// The fixture is a dump of production rows and is deliberately NOT committed — client text does
// not belong in the repo. Point LIVE_REASONS_JSON at a fresh dump to re-run this against live
// data; without one the check SKIPS rather than failing, so the suite is green for everyone.
if (!process.env.LIVE_REASONS_JSON || !existsSync(process.env.LIVE_REASONS_JSON)) {
  console.log("  — skipped (set LIVE_REASONS_JSON to a dump of lead_property_reasons to run it)")
} else {
  const rows: { lead_id: number; reasons: string[] }[] = JSON.parse(
    readFileSync(process.env.LIVE_REASONS_JSON, "utf8"))
  let identical = 0
  const drifted: string[] = []
  for (const r of rows) {
    const back = buildReasons(parseReasons(r.reasons))
    if (JSON.stringify(back) === JSON.stringify(r.reasons)) identical++
    else drifted.push(`lead ${r.lead_id}: ${JSON.stringify(r.reasons)} → ${JSON.stringify(back)}`)
  }
  ok(`all ${rows.length} production rows are unchanged`, drifted.length === 0, drifted.join(" | "))
  ok("…and that is every row, not a subset", identical === rows.length && rows.length >= 26)
}

console.log(`\nStructured reasons: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
