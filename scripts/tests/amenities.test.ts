/**
 * Amenities V1 — the ≤3 client-relevant amenities SAD CONFIRMS. Pure, no DB:
 *   npx tsx scripts/tests/amenities.test.ts
 *
 * Row contract: Amenities: [amenity] · [amenity] · [amenity]   (no verdict word)
 * Rules under test: only the client's own requirements appear; only CONFIRMED ones are
 * shown (unconfirmed are omitted, never "unverified" filler); evidence is never
 * broadened past the required specificity; and nothing client-relevant → [] so the row
 * hides entirely.
 */
import { evaluateAmenities, resolveClientContext, MAX_AMENITIES } from "@bc/companion-shared"
import type { PropertyAmenities } from "@bc/companion-shared"

let pass = 0,
  fail = 0
const eqArr = (a: string[], b: string[], name: string) => {
  const ok = a.length === b.length && a.every((v, i) => v === b[i])
  if (ok) pass++
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

/** Requirements stated in Locator Notes (the confirmed override layer). */
const client = (locatorNotes: string) => resolveClientContext({ locatorNotes })

/** Atlantic Grand Oaks — the real extracted amenity set from the live amenities page. */
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

// ── Row hides when there is nothing client-relevant to confirm ────────────────
eqArr(evaluateAmenities(client("Move by the 1st. Budget 1800."), LIVE), [], "no amenity requirement → [] (row hides)")
eqArr(evaluateAmenities(resolveClientContext({}), LIVE), [], "no client text → []")
eqArr(evaluateAmenities(client("Must have high ceilings."), LIVE), [], "requirement SAD can't confirm → [] (never 'Unverified')")

// ── The matched amenity IS the intelligence ───────────────────────────────────
eqArr(evaluateAmenities(client("Wants a pool and a gym."), LIVE), ["Gym", "Pool"], "confirmed pool + gym listed by name")
eqArr(
  evaluateAmenities(client("Drives an EV — needs EV charging."), { community: ["Electric Car Charging"], unit: [] }),
  ["EV Charging"],
  "'Electric Car Charging' confirms EV Charging",
)

// ── Only CONFIRMED requirements appear; the rest are silently omitted ─────────
eqArr(
  evaluateAmenities(client("Needs a pool and a private yard."), LIVE),
  ["Pool"],
  "unconfirmed yard omitted entirely — no 'Yard unverified' filler",
)
{
  const r = evaluateAmenities(client("Needs a garage, a yard and a washer dryer."), {
    community: ["Garage Parking"],
    unit: ["Yard", "Washer/Dryer"],
  })
  eqArr(r, ["Garage", "Yard", "W/D"], "all three confirmed → Garage · Yard · W/D")
}
{
  const r = evaluateAmenities(client("Needs a garage, a yard and a washer dryer."), { community: ["Garage Parking"], unit: [] })
  eqArr(r, ["Garage"], "only garage confirmed → Garage alone")
}

// ── Specificity: a broad feature never satisfies a specific requirement ───────
eqArr(
  evaluateAmenities(client("Wants an attached garage."), { community: ["Garage", "Garage Parking"], unit: [] }),
  [],
  "Garage available ≠ Attached Garage",
)
eqArr(
  evaluateAmenities(client("Wants an attached garage."), { community: ["Attached Garage"], unit: [] }),
  ["Attached Garage"],
  "Attached Garage confirmed at the required specificity (generic 'Garage' subsumed)",
)
eqArr(
  evaluateAmenities(client("Needs a fenced yard for the dog."), { community: ["Yard"], unit: [] }),
  [],
  "Yards available ≠ Private/Fenced Yard",
)
eqArr(
  evaluateAmenities(client("Needs a fenced yard for the dog."), { community: ["Private Fenced Yard"], unit: [] }),
  ["Private Yard"],
  "Private Yard confirmed (canonical client-facing wording; generic 'Yard' subsumed)",
)
eqArr(
  evaluateAmenities(client("Wants floor to ceiling windows."), { community: [], unit: ["Large Windows", "High Ceilings"] }),
  [],
  "Large windows / High Ceilings ≠ Floor-to-Ceiling Windows",
)
eqArr(
  evaluateAmenities(client("Needs washer dryer in the unit."), { community: [], unit: ["W/D Connections"] }),
  [],
  "W/D Connections ≠ washer/dryer included",
)
eqArr(
  evaluateAmenities(client("Needs W/D connections."), { community: [], unit: ["W/D Connections"] }),
  ["W/D Connections"],
  "a connections requirement IS confirmed by W/D Connections",
)
eqArr(
  evaluateAmenities(client("Only wants a townhome."), { community: ["Townhome Floor Plans"], unit: [] }),
  [],
  "community townhome floor plans ≠ THIS unit is a townhome",
)
eqArr(
  evaluateAmenities(client("Only wants a townhome."), { community: [], unit: ["Townhome Style"] }),
  ["Townhome"],
  "a UNIT-scoped townhome feature does confirm it",
)
eqArr(evaluateAmenities(client("Wants a yard."), { community: ["Courtyard"], unit: [] }), [], "Courtyard ≠ Yard")
eqArr(evaluateAmenities(client("Wants a pool."), { community: ["Pool Table"], unit: [] }), [], "Pool Table ≠ Pool")
eqArr(evaluateAmenities(client("Needs a dog park."), LIVE), [], "SAD's 'Dog/Walk Trail' ≠ Dog Park")

// ── A property is never penalized for SAD's silence ───────────────────────────
eqArr(evaluateAmenities(client("Wants a pool."), { community: [], unit: [] }), [], "empty amenity lists → [], no negative signal")
eqArr(evaluateAmenities(client("Wants a pool."), null), [], "missing amenities entirely → [], no negative signal")

// ── Requirements are read from every established context source ───────────────
eqArr(evaluateAmenities(resolveClientContext({ clientNotes: "Would love a pool." }), LIVE), ["Pool"], "Client Notes supply the requirement")
eqArr(evaluateAmenities(resolveClientContext({ aiInsights: ["Wants a gym on site."] }), LIVE), ["Gym"], "AI Insights supply the requirement")
eqArr(evaluateAmenities(resolveClientContext({ interest: "Looking for a townhome" }), { community: [], unit: ["Townhome"] }), ["Townhome"], "Smart Form interest supplies the requirement")

// ── The row stays compact — never more than three pieces ──────────────────────
{
  const r = evaluateAmenities(client("Wants a garage, yard, washer dryer, gym, pool and gated access."), {
    community: ["Garage", "Gated", "Swimming Pool", "Fitness Center"],
    unit: ["Yard", "Washer/Dryer"],
  })
  eqArr(r, ["Garage", "Yard", "W/D"], "six confirmed → first three in display order")
  ok(r.length <= MAX_AMENITIES, "never exceeds MAX_AMENITIES")
}

// ── Garden tub reaches the row ────────────────────────────────────────────────
eqArr(
  evaluateAmenities(client("Wants a garden tub, gym and pool."), { community: ["Fitness Center", "Swimming Pool"], unit: ["Garden Tub"] }),
  ["Garden Tub", "Gym", "Pool"],
  "Garden Tub · Gym · Pool",
)


// ── Atlantic Grand Oaks — conservative rules hold against the REAL amenity set ─
eqArr(evaluateAmenities(client("Needs a fenced yard for the dog."), LIVE), [], "'Fenced Community' is NOT a fenced yard")
eqArr(evaluateAmenities(client("Wants a yard."), LIVE), [], "no yard of any kind in the real set")
eqArr(evaluateAmenities(client("Needs a dog park."), LIVE), [], "'Dog/Walk Trail' is NOT a dog park")
eqArr(evaluateAmenities(client("Wants a garage."), LIVE), [], "no garage in the real set → omitted, not penalized")
eqArr(evaluateAmenities(client("Needs a washer dryer in the unit."), LIVE), [], "no W/D stated → omitted")
eqArr(evaluateAmenities(client("Wants a pool and a gym."), LIVE), ["Gym", "Pool"], "real set confirms Fitness Center + Swimming Pool")
// RESOLVED: SAD's confirmed "Access Gates" (plural) is now accepted evidence for a
// Gated Access requirement — approved as same-specificity wording, not a loosening.
eqArr(evaluateAmenities(client("Wants gated access."), LIVE), ["Gated Access"], "'Access Gates' confirms Gated Access")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
