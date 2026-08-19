/**
 * SAD amenity-value parser — parseAmenityValues/mergeAmenityValues read the verbatim
 * amenity text out of a SAD category span's innerHTML. Pure, no DB/DOM:
 *   npx tsx scripts/tests/sad-amenities.test.ts
 *
 * Fixtures below are the REAL innerHTML captured from a live SAD ViewProperty page.
 * Rules under test: split on <br>, decode SAD's entities, collapse the &nbsp; indent,
 * drop empties + exact duplicates (order preserved), never split a value on "/", and
 * never alter wording/casing.
 */
import { parseAmenityValues, mergeAmenityValues, groupAmenitySections } from "../../apps/beast-companion/src/content/sadAmenities"
import type { AmenityNode } from "../../apps/beast-companion/src/content/sadAmenities"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}
const ok = (c: boolean, name: string) => {
  if (c) pass++
  else {
    fail++
    console.error("✗", name)
  }
}
const eqArr = (a: string[], b: string[], name: string) => {
  const ok = a.length === b.length && a.every((v, i) => v === b[i])
  if (ok) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}

// ── Live "High Value" community span (Property Amenities) ─────────────────────
eqArr(
  parseAmenityValues("&nbsp; &nbsp; Electric Car Charging<br>&nbsp; &nbsp; Outdoor Kitchen<br>&nbsp; &nbsp; Wifi Access<br>"),
  ["Electric Car Charging", "Outdoor Kitchen", "Wifi Access"],
  "live High Value span → three verbatim values, trailing <br> dropped",
)

// ── Live "Fitness & Sports" span ──────────────────────────────────────────────
eqArr(
  parseAmenityValues("&nbsp; &nbsp; Swimming Pool<br>&nbsp; &nbsp; Jogging Trail<br>&nbsp; &nbsp; Fitness Center<br>"),
  ["Swimming Pool", "Jogging Trail", "Fitness Center"],
  "live Fitness & Sports span",
)

// ── Live "Entertainment" span — "/" inside a value is NEVER a separator ────────
eqArr(
  parseAmenityValues("&nbsp; &nbsp; Club House<br>&nbsp; &nbsp; Dog/Walk Trail<br>"),
  ["Club House", "Dog/Walk Trail"],
  "value containing '/' stays ONE value",
)

// ── Live "Kitchen" unit span — six values, casing/wording untouched ───────────
eqArr(
  parseAmenityValues(
    "&nbsp; &nbsp; Microwave<br>&nbsp; &nbsp; Dishwasher<br>&nbsp; &nbsp; Pantry<br>&nbsp; &nbsp; Refrigerator<br>&nbsp; &nbsp; Granite Counters<br>&nbsp; &nbsp; Black/Stainless Appliances<br>",
  ),
  ["Microwave", "Dishwasher", "Pantry", "Refrigerator", "Granite Counters", "Black/Stainless Appliances"],
  "live Kitchen span → verbatim, order preserved",
)

// ── Live "Living" unit span ───────────────────────────────────────────────────
eqArr(
  parseAmenityValues("&nbsp; &nbsp; Walk-in Closet<br>&nbsp; &nbsp; Patio<br>&nbsp; &nbsp; Wet/Dry Bar<br>"),
  ["Walk-in Closet", "Patio", "Wet/Dry Bar"],
  "live Living span",
)

// ── Entities decoded; self-closing <br/> and <BR> variants handled ────────────
eqArr(
  parseAmenityValues("&nbsp; Washer &amp; Dryer<br/>&nbsp; 24&#39;&nbsp;Ceilings<BR>"),
  ["Washer & Dryer", "24' Ceilings"],
  "&amp;/&#39;/&nbsp; decoded; <br/> and <BR> both split",
)

// ── Empties dropped, exact duplicates collapsed, order preserved ──────────────
eqArr(
  parseAmenityValues("&nbsp; Pool<br><br>&nbsp; Pool<br>&nbsp; Gym<br>"),
  ["Pool", "Gym"],
  "empties dropped + exact duplicate collapsed",
)

// ── No <br> at all → the single value still parses ────────────────────────────
eqArr(parseAmenityValues("&nbsp; &nbsp; Fitness Center"), ["Fitness Center"], "single value without <br>")

// ── Nothing usable → [] ───────────────────────────────────────────────────────
eqArr(parseAmenityValues(""), [], "empty innerHTML → []")
eqArr(parseAmenityValues(null), [], "null innerHTML → []")
eqArr(parseAmenityValues("&nbsp; &nbsp; <br>&nbsp;<br>"), [], "whitespace-only chunks → []")

// ── Residual markup is stripped, never emitted as a value ─────────────────────
eqArr(
  parseAmenityValues("&nbsp; <b>Pool</b><br>&nbsp; <span>Gym</span><br>"),
  ["Pool", "Gym"],
  "inline markup stripped from values",
)

// ── mergeAmenityValues: category spans merge, cross-category dupes collapse ────
eqArr(
  mergeAmenityValues([
    ["Swimming Pool", "Fitness Center"],
    ["Fitness Center", "Club House"],
    [],
  ]),
  ["Swimming Pool", "Fitness Center", "Club House"],
  "sections merge; duplicate across categories collapses; order preserved",
)
eqArr(mergeAmenityValues([]), [], "no spans → []")


// ═══════════════════════════════════════════════════════════════════════════════
// LIVE #ctl00_ContentPlaceHolder_AmenitiesPage — the CONFIRMED structure.
//
// Section headings and category value spans are SIBLINGS in document order inside one
// container; a value span belongs to the most recent heading above it. Category
// headings ("High Value", "Fitness & Sports", …) live in td.subtitleBlue2 cells and are
// therefore NOT part of this node stream at all — they can never become amenities.
// ═══════════════════════════════════════════════════════════════════════════════
const nl = (...values: string[]) => values.map((v) => `&nbsp; &nbsp; ${v}<br>`).join("")

const LIVE_PAGE: AmenityNode[] = [
  { kind: "section", title: "Property Amenities" },
  { kind: "values", html: nl("Doorman", "Locker System", "Outdoor Kitchen", "Package Services", "Recycling", "Ride Sharing Lounge", "Wifi Access") },
  { kind: "values", html: nl("Basketball Court", "Swimming Pool", "Fitness Center", "Picnic Area") },
  { kind: "values", html: nl("Billiard Room", "Club House", "Playground", "Dog/Walk Trail") },
  { kind: "values", html: nl("School Bus Pickup", "Shuttle Route", "Handicap Friendly") },
  { kind: "values", html: nl("Access Gates", "Fenced Community") },
  { kind: "values", html: nl("Business Center", "Roommate Floorplans") },
  { kind: "section", title: "Unit Features" },
  { kind: "values", html: nl("Microwave", "Dishwasher", "Pantry", "Refrigerator", "Granite Counters", "Black/Stainless Appliances") },
  { kind: "values", html: nl("Walk-in Closet", "Patio", "Outside Storage", "Wet/Dry Bar") },
  { kind: "values", html: nl("Gas Appliances", "Kitchen Island", "Quartz Countertop", "Tile Backsplash") },
  { kind: "values", html: nl("Vinyl Flooring", "Walk-in Shower", "Wood Floors", "Laminate Floors", "Ceiling Fans") },
]

const EXPECTED_COMMUNITY = [
  "Doorman", "Locker System", "Outdoor Kitchen", "Package Services", "Recycling", "Ride Sharing Lounge", "Wifi Access",
  "Basketball Court", "Swimming Pool", "Fitness Center", "Picnic Area",
  "Billiard Room", "Club House", "Playground", "Dog/Walk Trail",
  "School Bus Pickup", "Shuttle Route", "Handicap Friendly",
  "Access Gates", "Fenced Community",
  "Business Center", "Roommate Floorplans",
]
const EXPECTED_UNIT = [
  "Microwave", "Dishwasher", "Pantry", "Refrigerator", "Granite Counters", "Black/Stainless Appliances",
  "Walk-in Closet", "Patio", "Outside Storage", "Wet/Dry Bar",
  "Gas Appliances", "Kitchen Island", "Quartz Countertop", "Tile Backsplash",
  "Vinyl Flooring", "Walk-in Shower", "Wood Floors", "Laminate Floors", "Ceiling Fans",
]

{
  const r = groupAmenitySections(LIVE_PAGE)
  eqArr(r.community, EXPECTED_COMMUNITY, "live page → all 22 community amenities, every category included")
  eqArr(r.unit, EXPECTED_UNIT, "live page → all 19 unit features, every category included")
}

// ── EVERY category is captured, not just the first ────────────────────────────
// The previous extractor bound values to the heading's nextElementSibling and returned
// at the FIRST element containing values — which drops every later category.
{
  const r = groupAmenitySections(LIVE_PAGE)
  ok(r.community.includes("Doorman"), "first community category captured")
  ok(r.community.includes("Roommate Floorplans"), "LAST community category captured (regression: later categories were dropped)")
  ok(r.unit.includes("Microwave"), "first unit category captured")
  ok(r.unit.includes("Ceiling Fans"), "LAST unit category captured")
  eq(r.community.length, 22, "community count")
  eq(r.unit.length, 19, "unit count")
}

// ── Sections never bleed into one another ─────────────────────────────────────
{
  const r = groupAmenitySections(LIVE_PAGE)
  ok(!r.community.some((v) => EXPECTED_UNIT.includes(v)), "no unit feature leaked into community")
  ok(!r.unit.some((v) => EXPECTED_COMMUNITY.includes(v)), "no community amenity leaked into unit")
}

// ── Organizational category headings are never amenities ──────────────────────
{
  const r = groupAmenitySections(LIVE_PAGE)
  const headings = ["High Value", "Fitness & Sports", "Entertainment", "Accessibility", "Safety", "Other", "Kitchen", "Living", "Comfort & Safety"]
  const all = [...r.community, ...r.unit]
  ok(!headings.some((h) => all.includes(h)), "no category heading appears as an amenity")
}

// ── Values outside a known section are ignored, never guessed ─────────────────
eqArr(
  groupAmenitySections([{ kind: "values", html: nl("Stray Value") }, ...LIVE_PAGE]).community,
  EXPECTED_COMMUNITY,
  "a value span BEFORE the first heading is ignored",
)
{
  const r = groupAmenitySections([
    { kind: "section", title: "Nearby Schools" },
    { kind: "values", html: nl("Some School") },
    { kind: "section", title: "Unit Features" },
    { kind: "values", html: nl("Microwave") },
  ])
  eqArr(r.community, [], "unrecognized section contributes nothing")
  eqArr(r.unit, ["Microwave"], "the known section still parses")
}

// ── Missing section → [] ──────────────────────────────────────────────────────
{
  const r = groupAmenitySections([{ kind: "section", title: "Property Amenities" }, { kind: "values", html: nl("Pool") }])
  eqArr(r.community, ["Pool"], "community present")
  eqArr(r.unit, [], "absent Unit Features section → []")
}
eqArr(groupAmenitySections([]).community, [], "no nodes → []")
eqArr(groupAmenitySections([]).unit, [], "no nodes → []")

// ── Dedupe across categories within a section, order preserved ────────────────
{
  const r = groupAmenitySections([
    { kind: "section", title: "Property Amenities" },
    { kind: "values", html: nl("Swimming Pool", "Fitness Center") },
    { kind: "values", html: nl("Fitness Center", "Club House") },
  ])
  eqArr(r.community, ["Swimming Pool", "Fitness Center", "Club House"], "duplicate across categories collapses, order kept")
}

// ── Heading text is whitespace-tolerant ───────────────────────────────────────
{
  const r = groupAmenitySections([{ kind: "section", title: "  Property   Amenities " }, { kind: "values", html: nl("Pool") }])
  eqArr(r.community, ["Pool"], "heading matched despite stray whitespace")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
