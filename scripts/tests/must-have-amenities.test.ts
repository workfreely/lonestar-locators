/**
 * Must-Have Amenities — structured client requirement, end to end. Pure, no DB/DOM:
 *   npx tsx scripts/tests/must-have-amenities.test.ts
 *
 * Covers: the canonical option list, the max-3 rule, form/CRM persistence round-trip
 * (comma-joined canonical VALUES, never labels), DTO → Companion transport, structured
 * matching, conservative specificity, and the Companion's short display labels.
 */
import {
  MUST_HAVE_AMENITIES,
  MAX_MUST_HAVE_AMENITIES,
  isMustHaveAmenity,
  mustHaveAmenityLabel,
  mustHaveAmenityShortLabel,
  normalizeMustHaveAmenities,
  evaluateAmenities,
  resolveClientContext,
} from "@bc/companion-shared"
import type { PropertyAmenities } from "@bc/companion-shared"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}
const eqArr = (a: readonly string[], b: readonly string[], name: string) => {
  const okAll = a.length === b.length && a.every((v, i) => v === b[i])
  if (okAll) pass++
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

/** The real SAD test property (Atlantic Grand Oaks). */
const LIVE: PropertyAmenities = {
  community: [
    "Doorman", "Locker System", "Outdoor Kitchen", "Package Services", "Recycling", "Ride Sharing Lounge", "Wifi Access",
    "Basketball Court", "Swimming Pool", "Fitness Center", "Picnic Area",
    "Billiard Room", "Club House", "Playground", "Dog/Walk Trail",
    "School Bus Pickup", "Shuttle Route", "Handicap Friendly",
    "Access Gates", "Fenced Community",
    "Business Center", "Roommate Floorplans",
  ],
  unit: [
    "Microwave", "Dishwasher", "Pantry", "Refrigerator", "Granite Counters", "Black/Stainless Appliances",
    "Walk-in Closet", "Patio", "Outside Storage", "Wet/Dry Bar",
    "Gas Appliances", "Kitchen Island", "Quartz Countertop", "Tile Backsplash",
    "Vinyl Flooring", "Walk-in Shower", "Wood Floors", "Laminate Floors", "Ceiling Fans",
  ],
}

const client = (mustHaveAmenities: string[]) => resolveClientContext({ mustHaveAmenities })

// ── Canonical option list ─────────────────────────────────────────────────────
eq(MUST_HAVE_AMENITIES.length, 14, "14 client-facing choices")
eq(MAX_MUST_HAVE_AMENITIES, 3, "max 3 selections")
eqArr(
  MUST_HAVE_AMENITIES.map((a) => a.label),
  ["Washer/Dryer", "Detached Garage", "Attached Garage", "Private Yard", "EV Charging", "High Ceilings",
   "Floor-to-Ceiling Windows", "Garden Tub", "Walk-In Shower", "Pool", "Fitness Center", "Gated Access",
   "Dog Park", "Golf Simulator"],
  "exact labels, in the specified order",
)
ok(!MUST_HAVE_AMENITIES.some((a) => /townhome/i.test(a.label)), "Townhome is NOT an option (Property Type covers it)")
ok(!MUST_HAVE_AMENITIES.some((a) => /fenced/i.test(a.label)), "no separate Fenced Yard choice — Private Yard is the client-facing preference")
ok(MUST_HAVE_AMENITIES.every((a) => a.value !== a.label), "stable internal values, never labels as identifiers")
ok(new Set(MUST_HAVE_AMENITIES.map((a) => a.value)).size === 14, "values are unique")

// ── Persistence round-trip (comma-joined canonical values) ────────────────────
eqArr(normalizeMustHaveAmenities("pool, fitness_center, gated_access".split(",")), ["pool", "fitness_center", "gated_access"], "stored string → values")
eqArr(normalizeMustHaveAmenities([" pool ", "pool", "bogus_value", ""]), ["pool"], "unknown/duplicate/empty entries dropped")
eqArr(normalizeMustHaveAmenities(null), [], "null → []")
eqArr(normalizeMustHaveAmenities([]), [], "empty → [] (hidden field / manual lead / skipped question)")
eqArr(normalizeMustHaveAmenities(["Pool"]), [], "a LABEL is not a valid stored value")
eqArr(
  normalizeMustHaveAmenities(["gated_access", "washer_dryer"]),
  ["gated_access", "washer_dryer"],
  "the client's own SELECTION order is preserved (first pick leads the row)",
)
eqArr(
  normalizeMustHaveAmenities(" pool ,  fitness_center , gated_access ".split(",")),
  ["pool", "fitness_center", "gated_access"],
  "stored form is comma+SPACE joined — every value must survive the split",
)
eq(mustHaveAmenityLabel("washer_dryer"), "Washer/Dryer", "full label for form/CRM")
eq(mustHaveAmenityLabel("bogus"), "bogus", "unknown value passes through unchanged")
ok(isMustHaveAmenity("pool") && !isMustHaveAmenity("nope"), "value guard")

// ── Companion short display labels ────────────────────────────────────────────
eq(mustHaveAmenityShortLabel("washer_dryer"), "W/D", "Washer/Dryer → W/D")
eq(mustHaveAmenityShortLabel("floor_to_ceiling_windows"), "FTC Windows", "Floor-to-Ceiling Windows → FTC Windows")
eq(mustHaveAmenityShortLabel("fitness_center"), "Gym", "Fitness Center → Gym")
eq(mustHaveAmenityShortLabel("attached_garage"), "Attached Garage", "other labels stay natural")
eq(mustHaveAmenityShortLabel("garden_tub"), "Garden Tub", "no invented abbreviation")

// ── Structured matching is the PRIMARY source ─────────────────────────────────
eqArr(
  evaluateAmenities(client(["pool", "fitness_center", "gated_access"]), LIVE),
  ["Pool", "Gym", "Gated Access"],
  "Carlos's demo must-haves → all three confirmed by the live property",
)
eqArr(
  evaluateAmenities(client(["attached_garage", "washer_dryer", "private_yard"]), { community: ["Attached Garage"], unit: ["Washer/Dryer"] }),
  ["Attached Garage", "W/D"],
  "only the CONFIRMED must-haves render; the unconfirmed yard is omitted",
)
eqArr(evaluateAmenities(client(["pool", "dog_park"]), LIVE), ["Pool"], "unconfirmed Dog Park omitted, not marked unverified")
eqArr(evaluateAmenities(client(["golf_simulator"]), LIVE), [], "nothing confirmed → [] so the row hides")
eqArr(evaluateAmenities(client(["pool"]), { community: [], unit: [] }), [], "no SAD evidence → unknown, never 'absent'")

// ── The row never fills with amenities the client did not ask for ─────────────
{
  const r = evaluateAmenities(client(["pool"]), LIVE)
  eqArr(r, ["Pool"], "property has 41 amenities; only the requested one is shown")
}

// ── Max 3 enforced at the row ─────────────────────────────────────────────────
{
  const r = evaluateAmenities(
    client(["washer_dryer", "pool", "fitness_center", "gated_access"]),
    { community: ["Swimming Pool", "Fitness Center", "Access Gates"], unit: ["Washer/Dryer"] },
  )
  eq(r.length, 3, "four confirmed → still at most three displayed")
  eqArr(r, ["W/D", "Pool", "Gym"], "first three in the client's selection order")
}

// ── Conservative specificity, against the REAL amenity wording ────────────────
eqArr(evaluateAmenities(client(["attached_garage"]), { community: ["Detached Garage"], unit: [] }), [], "Detached Garage does NOT satisfy Attached Garage")
eqArr(evaluateAmenities(client(["attached_garage"]), { community: ["Garage", "Garage Parking"], unit: [] }), [], "generic Garage does NOT satisfy Attached Garage")
eqArr(evaluateAmenities(client(["detached_garage"]), { community: ["Attached Garage"], unit: [] }), [], "Attached does NOT satisfy Detached")
eqArr(evaluateAmenities(client(["washer_dryer"]), { community: [], unit: ["W/D Connections"] }), [], "W/D Connections does NOT satisfy Washer/Dryer")
eqArr(evaluateAmenities(client(["private_yard"]), LIVE), [], "'Fenced Community' does NOT satisfy Private Yard")
eqArr(evaluateAmenities(client(["private_yard"]), { community: [], unit: ["Private Fenced Yard"] }), ["Private Yard"], "unit-specific fenced/private yard DOES satisfy it")
eqArr(evaluateAmenities(client(["dog_park"]), LIVE), [], "'Dog/Walk Trail' does NOT satisfy Dog Park")
eqArr(evaluateAmenities(client(["floor_to_ceiling_windows"]), { community: [], unit: ["Large Windows", "High Ceilings"] }), [], "generic windows do NOT satisfy Floor-to-Ceiling Windows")
eqArr(evaluateAmenities(client(["pool"]), { community: ["Pool Table"], unit: [] }), [], "Pool Table does NOT satisfy Pool")

// ── Confirmed SAD wording accepted for Gated Access ───────────────────────────
eqArr(evaluateAmenities(client(["gated_access"]), { community: ["Access Gates"], unit: [] }), ["Gated Access"], "'Access Gates' IS evidence for Gated Access")
eqArr(evaluateAmenities(client(["walk_in_shower"]), LIVE), ["Walk-In Shower"], "the live property's unit list DOES confirm Walk-in Shower")
eqArr(evaluateAmenities(client(["walk_in_shower"]), { community: [], unit: ["Walk-in Shower"] }), ["Walk-In Shower"], "Walk-In Shower confirmed")

// ── Hidden form field / manual lead → empty, and the text fallback still works ─
eqArr(evaluateAmenities(resolveClientContext({}), LIVE), [], "no structured must-haves and no notes → []")
eqArr(
  evaluateAmenities(resolveClientContext({ locatorNotes: "Wants a pool and a gym." }), LIVE),
  ["Gym", "Pool"],
  "free-text fallback still resolves when no structured value exists",
)
eqArr(
  evaluateAmenities(resolveClientContext({ mustHaveAmenities: ["pool"], locatorNotes: "Wants a gym too." }), LIVE),
  ["Pool"],
  "structured selections take precedence over free text",
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
