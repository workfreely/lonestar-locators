/**
 * Recommendations payload + per-client scoping. Pure, no DB:
 *   npx tsx scripts/tests/recommendations.test.ts
 *
 * Verifies the canonical lead_recommendations → active-client payload path:
 * recommendations are mapped to RecommendationDTO, filtered by lead_id (no
 * cross-client leakage), empty for a client with none, and that Favorites remain
 * independently scoped (no regression) in the SAME payload.
 */
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const TZ = "America/Chicago"
const lead = (id: string) => ({ id, crm_status: "searching", first_name: "Test" })

// Recommendations for two clients (+ a null address to prove nullable passes through).
const RECS = [
  { id: 1, lead_id: "A", property_name: "Alpha Apts", property_address: "1 A St, Austin", property_url: "https://a" },
  { id: 2, lead_id: "A", property_name: "Beta Flats", property_address: null, property_url: "https://b" },
  { id: 3, lead_id: "B", property_name: "Gamma Court", property_address: "3 C St, Austin", property_url: "https://c" },
]
const FAVS = [
  { id: 10, lead_id: "A", property_name: "Alpha Fav", property_address: "9 A St", property_url: "https://af" },
  { id: 11, lead_id: "B", property_name: "Bravo Fav", property_address: "9 B St", property_url: "https://bf" },
]

// ── Client A: only A's recommendations, mapped, no leakage ──
{
  const p = buildActiveClientPayload(lead("A"), [], null, null, TZ, FAVS, [], RECS)
  ok(p.recommendations?.length === 2, "A → exactly 2 recommendations (no B leakage)")
  ok(p.recommendations?.every((r) => ["Alpha Apts", "Beta Flats"].includes(r.propertyName)) === true, "A → only A's properties")
  ok(p.recommendations?.[0].propertyName === "Alpha Apts" && p.recommendations?.[0].propertyAddress === "1 A St, Austin", "recommendation maps name + address")
  ok(p.recommendations?.[0].propertyUrl === "https://a", "recommendation maps url")
  ok(p.recommendations?.[1].propertyAddress == null, "nullable address passes through as null")
  // Favorites remain independently scoped in the same payload (no regression).
  ok(p.favorites?.length === 1 && p.favorites?.[0].propertyName === "Alpha Fav", "A → favorites still scoped to A (independent of recommendations)")
}

// ── Client B: only B's recommendation ──
{
  const p = buildActiveClientPayload(lead("B"), [], null, null, TZ, FAVS, [], RECS)
  ok(p.recommendations?.length === 1 && p.recommendations?.[0].propertyName === "Gamma Court", "B → exactly B's recommendation")
  ok(p.favorites?.length === 1 && p.favorites?.[0].propertyName === "Bravo Fav", "B → favorites scoped to B")
}

// ── Client with none: empty (connected, not missing) ──
{
  const p = buildActiveClientPayload(lead("C"), [], null, null, TZ, FAVS, [], RECS)
  ok(Array.isArray(p.recommendations) && p.recommendations.length === 0, "C (no records) → recommendations = [] (empty state, still connected)")
  ok(Array.isArray(p.favorites) && p.favorites.length === 0, "C (no records) → favorites = []")
}

// ── No recommendations passed at all → [] (backward-compatible default) ──
{
  const p = buildActiveClientPayload(lead("A"), [], null, null, TZ, FAVS, [])
  ok(Array.isArray(p.recommendations) && p.recommendations.length === 0, "omitted recommendations arg → [] (never undefined/crash)")
  ok(p.favorites?.length === 1, "favorites still work when recommendations omitted")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
