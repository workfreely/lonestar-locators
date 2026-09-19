// Regression coverage for the canonical Recommendations/Favorites independence fix.
// Recommendations and Favorites are INDEPENDENT collections: a property may exist in
// both for one lead, and "+ Recommend" (add-recommendation) must NEVER mutate a Favorite.
// Pure logic only — no network, no React. Run: npx tsx scripts/leads/recommendationCollections.test.ts
import { canonicalPropertyKey } from "@bc/companion-shared"
import { recommendationAddMutatesOpposite, favoriteMoveBlock } from "@/lib/leads/propertyCollections"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

// The real production identity for Atlantica at Alamo (Jerry Springer, lead 57).
const ATLANTICA_URL = "https://www.google.com/maps/place/?q=place_id:ChIJA_VnzrNDXIYROEWwiRVMAk4"
const ATLANTICA_KEY = "pid:ChIJA_VnzrNDXIYROEWwiRVMAk4"

console.log("canonicalPropertyKey (mirrors the DB generated column):")
ok("place_id URL → pid: key", canonicalPropertyKey(ATLANTICA_URL) === ATLANTICA_KEY)
ok("non-map URL → lowercased url: key", canonicalPropertyKey("HTTPS://Example.com/View?ID=5 ") === "url:https://example.com/view?id=5")
ok("empty/nullish → null", canonicalPropertyKey("") === null && canonicalPropertyKey(null) === null && canonicalPropertyKey(undefined) === null)
ok("pid: and url: forms are distinct", canonicalPropertyKey(ATLANTICA_URL) !== canonicalPropertyKey("https://sad.example/ViewProperty?id=1"))
ok("two different place_ids don't collide", canonicalPropertyKey(ATLANTICA_URL) !== canonicalPropertyKey("https://www.google.com/maps/place/?q=place_id:ChIJDIFFERENT000000000000000"))
ok("place_id key is case-sensitive (not lowercased)", canonicalPropertyKey(ATLANTICA_URL) === ATLANTICA_KEY && ATLANTICA_KEY !== ATLANTICA_KEY.toLowerCase())
ok("same property, trailing whitespace → same key", canonicalPropertyKey(`  ${ATLANTICA_URL}  `) === ATLANTICA_KEY)

console.log("recommendationAddMutatesOpposite (only relocation verbs touch the opposite collection):")
ok("add-recommendation is NON-destructive (false)", recommendationAddMutatesOpposite("add-recommendation") === false)
ok("move-to-recommendation still relocates (true)", recommendationAddMutatesOpposite("move-to-recommendation") === true)
ok("add-favorite unchanged (true)", recommendationAddMutatesOpposite("add-favorite") === true)
ok("move-to-favorite unchanged (true)", recommendationAddMutatesOpposite("move-to-favorite") === true)

// A tiny mirror of the handler's add-recommendation decision, built from the REAL
// helpers, so the five product scenarios are asserted end-to-end at the decision level.
function planAddRecommendation(input: {
  favorites: { id: string; url: string }[]
  recommendations: { url: string }[]
  candidateUrl: string
  // live workflow references on the matching favorite (guest card / tour / top pick)
  lead?: { top_pick_favorite_id?: unknown }
  nextActions?: { property_id?: unknown; completed?: boolean; status?: string | null }[]
}) {
  const verb = "add-recommendation"
  const mutateOpposite = recommendationAddMutatesOpposite(verb) // false
  const key = canonicalPropertyKey(input.candidateUrl)
  const alreadyRecommended = input.recommendations.some((r) => canonicalPropertyKey(r.url) === key)
  const favorite = input.favorites.find((f) => canonicalPropertyKey(f.url) === key) ?? null
  // The old bug consulted favoriteMoveBlock and converted the favorite; the fix never
  // does for add-recommendation. We compute it only to prove it's now ignored.
  const wouldHaveBlockedMove = favorite
    ? !!favoriteMoveBlock({ favorite, lead: input.lead ?? {}, tours: [], nextActions: input.nextActions ?? [] }).reason
    : false
  return {
    createsRecommendation: !alreadyRecommended,
    mutatesFavorite: mutateOpposite && !!favorite, // always false for add-recommendation
    favoritePreserved: !!favorite && !(mutateOpposite && !!favorite),
    wouldHaveBlockedMove,
  }
}

console.log("Scenario 1 — property in NEITHER → Recommend → recommendation only:")
{
  const r = planAddRecommendation({ favorites: [], recommendations: [], candidateUrl: ATLANTICA_URL })
  ok("creates the recommendation", r.createsRecommendation === true)
  ok("no favorite to mutate", r.mutatesFavorite === false)
}

console.log("Scenario 2 — Favorite ONLY → Recommend → Favorite + Recommendation:")
{
  const r = planAddRecommendation({
    favorites: [{ id: "17", url: ATLANTICA_URL }],
    recommendations: [],
    candidateUrl: ATLANTICA_URL,
  })
  ok("creates the recommendation", r.createsRecommendation === true)
  ok("does NOT mutate the favorite", r.mutatesFavorite === false)
  ok("favorite preserved", r.favoritePreserved === true)
}

console.log("Scenario 3 — Favorite with OPEN Guest Card action (Jerry/Atlantica) → Recommend → both, Guest Card preserved:")
{
  const r = planAddRecommendation({
    favorites: [{ id: "17", url: ATLANTICA_URL }],
    recommendations: [],
    candidateUrl: ATLANTICA_URL,
    nextActions: [{ property_id: "17", status: "open", completed: false }], // open email_guest_card on fav 17
  })
  ok("the OLD path WOULD have blocked/converted (open action ⇒ reason)", r.wouldHaveBlockedMove === true)
  ok("the FIX ignores that: recommendation still created", r.createsRecommendation === true)
  ok("favorite (and its Guest Card action) untouched", r.mutatesFavorite === false && r.favoritePreserved === true)
}

console.log("Scenario 4 — Recommendation already exists → no duplicate:")
{
  const r = planAddRecommendation({
    favorites: [],
    recommendations: [{ url: ATLANTICA_URL }],
    candidateUrl: ATLANTICA_URL,
  })
  ok("does not create a duplicate recommendation", r.createsRecommendation === false)
  ok("no favorite mutation", r.mutatesFavorite === false)
}

console.log("Scenario 5 — Favorite + Recommendation already exist → no mutation / no duplicate:")
{
  const r = planAddRecommendation({
    favorites: [{ id: "38", url: ATLANTICA_URL }],
    recommendations: [{ url: ATLANTICA_URL }],
    candidateUrl: ATLANTICA_URL,
    nextActions: [{ property_id: "38", status: "open", completed: false }],
  })
  ok("no duplicate recommendation", r.createsRecommendation === false)
  ok("favorite not mutated", r.mutatesFavorite === false && r.favoritePreserved === true)
}

console.log("favoriteMoveBlock sanity (unchanged behavior for the relocation path):")
ok("open action ⇒ blocking reason", !!favoriteMoveBlock({ favorite: { id: "17" }, lead: {}, nextActions: [{ property_id: "17", status: "open", completed: false }] }).reason)
ok("top pick ⇒ blocking reason", !!favoriteMoveBlock({ favorite: { id: "17" }, lead: { top_pick_favorite_id: "17" } }).reason)
ok("unreferenced ⇒ no reason", favoriteMoveBlock({ favorite: { id: "17" }, lead: {}, tours: [], nextActions: [] }).reason === null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
