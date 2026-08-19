/**
 * Recommendation ↔ Favorite — two states of ONE progression. Pure, no DB/DOM:
 *   npx tsx scripts/tests/property-collections.test.ts
 *
 * Covers the decision layer both the CRM handler and the Companion controls share:
 * mutual exclusion, legacy-duplicate resolution (Favorites wins visually), and the
 * Favorite → Recommendation safety guard. The move ORDER (destination first, source
 * only on success) is exercised through a simulation of the handler's contract.
 */
import { propertyKey, visibleRecommendations, alreadyInCollection, favoriteMoveBlock } from "../../lib/leads/propertyCollections"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}
const eqArr = (a: string[], b: string[], name: string) => {
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

const LEAD = 12
const URL_A = "https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?propertyID=95720"
const URL_B = "https://app.smartapartmentdata.com/Restricted/Locator/ViewProperty.aspx?propertyID=853484"
const rec = (id: number, url: string, lead: unknown = LEAD) => ({ id, lead_id: lead, property_name: "P", property_url: url })
const fav = rec

// ── Identity ──────────────────────────────────────────────────────────────────
eq(propertyKey({ property_url: ` ${URL_A} ` }), URL_A, "identity is the trimmed property_url")
eq(propertyKey(null), "", "missing row → empty key")
eq(propertyKey({ property_url: null }), "", "missing url → empty key")

// ── Legacy duplicate: Favorites wins VISUALLY, nothing is deleted ─────────────
{
  const favorites = [fav(1, URL_A)]
  const recommendations = [rec(10, URL_A), rec(11, URL_B)]
  const visible = visibleRecommendations(recommendations, favorites, LEAD)
  eqArr(visible.map((r) => String(r.id)), ["11"], "duplicate recommendation hidden — Favorites wins")
  eq(recommendations.length, 2, "source array is NOT mutated (no delete, no backfill)")
}
{
  // Another client's favorite must never hide this client's recommendation.
  const visible = visibleRecommendations([rec(10, URL_A)], [fav(1, URL_A, 999)], LEAD)
  eqArr(visible.map((r) => String(r.id)), ["10"], "cross-client favorite does not hide the row")
}
{
  const visible = visibleRecommendations([rec(10, URL_A)], [], LEAD)
  eqArr(visible.map((r) => String(r.id)), ["10"], "no favorites → nothing hidden")
}
{
  const visible = visibleRecommendations([{ id: 10, lead_id: LEAD, property_url: null }], [fav(1, URL_A)], LEAD)
  eq(visible.length, 1, "a row with no URL is never hidden by an unrelated favorite")
}

// ── Destination membership ────────────────────────────────────────────────────
ok(alreadyInCollection([fav(1, URL_A)], LEAD, URL_A), "detects the property already in the destination")
ok(!alreadyInCollection([fav(1, URL_A)], LEAD, URL_B), "different property is not a match")
ok(!alreadyInCollection([fav(1, URL_A, 999)], LEAD, URL_A), "another client's row is not a match")
ok(!alreadyInCollection([], LEAD, ""), "empty url is never 'already in'")

// ── Favorite → Recommendation guard ──────────────────────────────────────────
const FAVORITE = { id: 8001 }
eq(favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [], nextActions: [] }).reason, null, "clean favorite may move back")

eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: { top_pick_favorite_id: 8001 }, tours: [], nextActions: [] }).reason,
  "It's this client's Top Pick.",
  "Top Pick BLOCKS the backward move",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: { top_pick_favorite_id: "8001" }, tours: [], nextActions: [] }).reason,
  "It's this client's Top Pick.",
  "Top Pick compared as a string (id types differ across sources)",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: { top_pick_favorite_id: 9999 }, tours: [], nextActions: [] }).reason,
  null,
  "another property's Top Pick does not block",
)

eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [{ property_id: 8001, status: "scheduled" }], nextActions: [] }).reason,
  "A tour is scheduled for it.",
  "linked tour BLOCKS the backward move",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [{ property_id: 8001, status: "canceled" }], nextActions: [] }).reason,
  null,
  "a CANCELED tour does not block",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [{ property_id: 7777, status: "scheduled" }], nextActions: [] }).reason,
  null,
  "another property's tour does not block",
)

eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [], nextActions: [{ property_id: 8001, completed: false }] }).reason,
  "It has an open action.",
  "open property-scoped action BLOCKS the backward move",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [], nextActions: [{ property_id: 8001, completed: true }] }).reason,
  null,
  "a COMPLETED action does not block",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [], nextActions: [{ property_id: 8001, status: "completed" }] }).reason,
  null,
  "status:completed also counts as done",
)
eq(
  favoriteMoveBlock({ favorite: FAVORITE, lead: {}, tours: [], nextActions: [{ property_id: null, completed: false }] }).reason,
  null,
  "an action with no property scope does not block",
)
eq(favoriteMoveBlock({ favorite: null, lead: {}, tours: [], nextActions: [] }).reason, "This property can't be identified.", "unidentifiable row is blocked")

// ── Move semantics: destination FIRST, source only on success ────────────────
// Mirrors the handler contract: insert into destination → on success remove source.
function simulateMove(opts: { destinationSucceeds: boolean }) {
  const favorites = [fav(1, URL_A)]
  const recommendations: ReturnType<typeof rec>[] = []
  let sourceRemoved = false
  const destinationInsert = () => opts.destinationSucceeds
  if (destinationInsert()) {
    recommendations.push(rec(50, URL_A)) // destination row confirmed
    favorites.splice(0, 1) // ONLY now is the source removed
    sourceRemoved = true
  }
  return { favorites, recommendations, sourceRemoved }
}
{
  const r = simulateMove({ destinationSucceeds: true })
  eq(r.recommendations.length, 1, "successful move creates the destination row")
  eq(r.favorites.length, 0, "successful move removes the source row")
  ok(r.sourceRemoved, "source removed only after the destination is confirmed")
}
{
  const r = simulateMove({ destinationSucceeds: false })
  eq(r.recommendations.length, 0, "failed destination creates nothing")
  eq(r.favorites.length, 1, "FAILED DESTINATION LEAVES THE SOURCE INTACT — property is never lost")
  ok(!r.sourceRemoved, "source untouched on failure")
}

// ── A completed move leaves the property in exactly ONE collection ────────────
{
  const favorites = [fav(1, URL_A)]
  const recommendations: ReturnType<typeof rec>[] = []
  recommendations.push(rec(50, URL_A))
  favorites.splice(0, 1)
  ok(!alreadyInCollection(favorites, LEAD, URL_A), "no longer a favorite")
  ok(alreadyInCollection(recommendations, LEAD, URL_A), "now a recommendation")
  eqArr(visibleRecommendations(recommendations, favorites, LEAD).map((r) => String(r.id)), ["50"], "and it renders")
}

// ── Duplicate resolves through the normal move path ───────────────────────────
{
  // Legacy state: present in BOTH. The deliberate action removes the stray source.
  const favorites = [fav(1, URL_A)]
  const recommendations = [rec(10, URL_A)]
  eqArr(visibleRecommendations(recommendations, favorites, LEAD).map((r) => String(r.id)), [], "duplicate hidden while it persists")
  // Agent moves it to Favorites: destination already holds it, so the source is dropped.
  ok(alreadyInCollection(favorites, LEAD, URL_A), "destination already holds it")
  const resolved = recommendations.filter((r) => propertyKey(r) !== URL_A)
  eq(resolved.length, 0, "stray recommendation removed — duplicate resolved, no bulk backfill")
}


console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
