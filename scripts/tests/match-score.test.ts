/**
 * Current Property overall Match %. Pure, no DB/DOM:
 *   npx tsx scripts/tests/match-score.test.ts
 *
 * Composes the four evaluators already rendered beneath the heading, so the number can
 * never contradict the rows. Coverage, not penalty: a dimension with no client criterion
 * or no property evidence is EXCLUDED from the average, never scored zero.
 */
import { evaluateMatchScore, MIN_DIMENSIONS, matchScoreTone, cityMismatch, propertyCityName, resolveClientContext, matchScoreTone as tone } from "@bc/companion-shared"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}

const loc = (verdict: "good" | "bad" | "unknown") => ({ verdict, fit: "Good" as const, detail: null })
const appr = (risk: "Low" | "Moderate" | "High" | "Unverified") => ({ risk, mgmt: null, reason: null })

// ── Each dimension's contribution ───────────────────────────────────────────
eq(evaluateMatchScore({ location: loc("good"), budget: "Within budget" }), 100, "two perfect signals → 100%")
eq(evaluateMatchScore({ location: loc("bad"), budget: "Within budget" }), 50, "one miss halves a two-signal score")
eq(evaluateMatchScore({ location: loc("good"), budget: "Options within budget" }), 88, "Options within budget = 75")
eq(evaluateMatchScore({ location: loc("good"), budget: "Near budget" }), 75, "Near budget = 50")
eq(evaluateMatchScore({ location: loc("good"), budget: "$350 over budget" }), 50, "over budget scores 0, and it COUNTS (real evidence)")
eq(evaluateMatchScore({ location: loc("good"), approval: appr("Low") }), 100, "Approval Low = 100")
eq(evaluateMatchScore({ location: loc("good"), approval: appr("Moderate") }), 80, "Approval Moderate = 60")
eq(evaluateMatchScore({ location: loc("good"), approval: appr("High") }), 50, "Approval High = 0")
eq(evaluateMatchScore({ location: loc("good"), amenities: { requested: 2, confirmed: 1 } }), 75, "amenities score by coverage ratio")
eq(evaluateMatchScore({ location: loc("good"), amenities: { requested: 3, confirmed: 3 } }), 100, "all must-haves confirmed")
eq(evaluateMatchScore({ location: loc("good"), amenities: { requested: 3, confirmed: 0 } }), 50, "none confirmed scores 0 for that dimension")

// ── Unknowns are EXCLUDED, never penalised ──────────────────────────────────
eq(
  evaluateMatchScore({ location: loc("unknown"), budget: "Within budget", approval: appr("Low") }),
  100,
  "an unknown Location does not drag the score down",
)
eq(
  evaluateMatchScore({ location: loc("good"), budget: null, approval: appr("Low") }),
  100,
  "no budget criterion / no property rent → excluded, not zero",
)
eq(
  evaluateMatchScore({ location: loc("good"), approval: appr("Unverified"), budget: "Within budget" }),
  100,
  "Unverified approval is absence of evidence — excluded",
)
eq(
  evaluateMatchScore({ location: loc("good"), budget: "Within budget", amenities: { requested: 0, confirmed: 0 } }),
  100,
  "client asked for no amenities → excluded, not a zero",
)

// ── Minimum coverage before a number is shown ───────────────────────────────
eq(MIN_DIMENSIONS, 1, "ONE evaluable dimension is enough to show a score")
eq(evaluateMatchScore({ location: loc("good") }), 100, "Location alone still produces a score")
eq(evaluateMatchScore({ budget: "Within budget" }), 100, "Budget alone still produces a score")
eq(evaluateMatchScore({}), null, "nothing known → no percentage")
eq(evaluateMatchScore({ location: loc("unknown"), approval: appr("Unverified") }), null, "unknowns are not coverage — still no percentage")

// ── A realistic blend ───────────────────────────────────────────────────────
eq(
  evaluateMatchScore({
    location: loc("good"),
    budget: "Options within budget",
    approval: appr("Low"),
    amenities: { requested: 3, confirmed: 2 },
  }),
  86,
  "good + options + low risk + 2 of 3 amenities → 86% ((100+75+100+67)/4)",
)


// ── Colour band (presentation only — never feeds the score) ─────────────────
eq(matchScoreTone(92), "good", "92% → green")
eq(matchScoreTone(75), "moderate", "75% → amber")
eq(matchScoreTone(69), "moderate", "69% → amber (band is now 61–79)")
// Boundaries are where colour banding goes wrong — pin all four.
eq(matchScoreTone(80), "good", "80 is the FIRST green")
eq(matchScoreTone(79), "moderate", "79 is still amber")
eq(matchScoreTone(61), "moderate", "61 is the FIRST amber")
eq(matchScoreTone(60), "bad", "60 is the LAST red")
eq(matchScoreTone(100), "good", "100 → green")
eq(matchScoreTone(0), "bad", "0 → red")


// ── Location is a WEIGHTED dimension, never an overall disqualifier ─────────
// Apartment searches cross municipal boundaries (Austin → Round Rock), so a property
// outside the stated criteria scores Location poorly while Budget/Approval/Amenities
// keep their real scores.
const DALLAS = resolveClientContext({ city: "Dallas" })
const SA = resolveClientContext({ city: "San Antonio" })
const AUSTIN_PROP = { propertyAddress: "700 River St, Austin, TX 78701", propertySubmarket: "Downtown" }
const SA_PROP = { propertyAddress: "123 Broadway, San Antonio, TX 78215", propertySubmarket: "Southtown" }

eq(cityMismatch(DALLAS, AUSTIN_PROP), true, "Dallas client + Austin property → outside criteria")
eq(cityMismatch(SA, AUSTIN_PROP), true, "San Antonio client + Austin property → outside criteria")
eq(cityMismatch(SA, SA_PROP), false, "same city → within criteria")
eq(propertyCityName(AUSTIN_PROP), "Austin", "property city read for the Location row")

// (2) Maria/Dallas + Austin property → a percentage APPEARS and is not forced to 0
{
  const score = evaluateMatchScore({
    locationOutsideCriteria: true,
    budget: "Within budget",
    amenities: { requested: 2, confirmed: 2 },
  })
  eq(score, 67, "Location 0 + Budget 100 + Amenities 100 → 67%, not 0%")
  eq(tone(67), "moderate", "…and it lands in the amber band")
}
// (3) Miguel/San Antonio + Austin property → identical flexible behavior
eq(
  evaluateMatchScore({ locationOutsideCriteria: true, budget: "Within budget", approval: appr("Low") }),
  67,
  "San Antonio client behaves the same as Dallas — no special-casing",
)
// Location poor with everything else strong still beats an artificial zero
eq(
  evaluateMatchScore({
    locationOutsideCriteria: true,
    budget: "Within budget",
    approval: appr("Low"),
    amenities: { requested: 3, confirmed: 3 },
  }),
  75,
  "strong budget/approval/amenities lift a poor Location to 75%",
)
// Outside criteria alone, with nothing else evaluable
eq(evaluateMatchScore({ locationOutsideCriteria: true }), 0, "only Location, and it is poor → 0%")

// (4) Correct area + matching budget → strong match
eq(
  evaluateMatchScore({ location: loc("good"), budget: "Within budget", amenities: { requested: 2, confirmed: 2 } }),
  100,
  "desired area + budget + amenities → 100%",
)

// (5) Missing location evidence → EXCLUDED, not penalised
eq(cityMismatch(SA, { propertyAddress: null }), false, "no property address → not outside criteria")
eq(cityMismatch(SA, { propertyAddress: "700 River St" }), false, "address without a city → not outside criteria")
eq(cityMismatch(resolveClientContext({}), AUSTIN_PROP), false, "no client city → not outside criteria")
eq(propertyCityName({ propertyAddress: null }), null, "unknown property city → null")
eq(
  evaluateMatchScore({ location: loc("unknown"), budget: "Within budget" }),
  100,
  "unknown Location is excluded, so Budget alone decides — never dragged to 50",
)

// (6) The SAME property scores differently per client — no hard-coded cases
{
  const property = AUSTIN_PROP
  const austinClient = resolveClientContext({ city: "Austin" })
  eq(cityMismatch(austinClient, property), false, "Austin client → within criteria")
  eq(cityMismatch(DALLAS, property), true, "Dallas client → outside criteria")
  eq(cityMismatch(SA, property), true, "San Antonio client → outside criteria")
  const forAustin = evaluateMatchScore({ locationOutsideCriteria: false, location: loc("good"), budget: "Within budget" })
  const forDallas = evaluateMatchScore({ locationOutsideCriteria: true, budget: "Within budget" })
  eq(forAustin, 100, "same property scores 100% for the Austin client")
  eq(forDallas, 50, "…and 50% for the Dallas client — recalculated per client")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
