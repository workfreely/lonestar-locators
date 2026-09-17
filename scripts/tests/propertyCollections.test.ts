// Recommendation ↔ Favorite decision layer. Locks down:
//   • visibleRecommendations now ignores application-only identity rows when deciding
//     whether a property is already favorited (so a hidden identity row can't suppress
//     a real Recommendation of the same property);
//   • favoriteMoveBlock's live-dependency rules are unchanged (Top Pick / scheduled
//     tour / open action).
// Run: npx tsx scripts/tests/propertyCollections.test.ts

import { visibleRecommendations, favoriteMoveBlock } from "../../lib/leads/propertyCollections"

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.log(`  ✗ ${name}\n      expected ${e}\n      actual   ${a}`)
  }
}

const URL = "https://www.google.com/maps/place/?q=place_id:ABC"
const rec = { lead_id: 1, property_url: URL, property_name: "Oasis" }

console.log("\nvisibleRecommendations — genuine favorite suppresses matching recommendation")
check("genuine favorite (origin favorite) hides the matching recommendation",
  visibleRecommendations([rec], [{ lead_id: 1, property_url: URL, origin: "favorite" }], 1).length, 0)
check("legacy favorite (origin null) hides the matching recommendation",
  visibleRecommendations([rec], [{ lead_id: 1, property_url: URL, origin: null }], 1).length, 0)

console.log("\nvisibleRecommendations — application-only identity row does NOT suppress")
check("application identity row does NOT hide the recommendation",
  visibleRecommendations([rec], [{ lead_id: 1, property_url: URL, origin: "application" }], 1).length, 1)
check("different lead's favorite never suppresses",
  visibleRecommendations([rec], [{ lead_id: 2, property_url: URL, origin: "favorite" }], 1).length, 1)

console.log("\nfavoriteMoveBlock — live dependencies still block (unchanged)")
check("Top Pick blocks",
  favoriteMoveBlock({ favorite: { id: 5 }, lead: { top_pick_favorite_id: 5 } }).reason !== null, true)
check("non-canceled tour blocks",
  favoriteMoveBlock({ favorite: { id: 5 }, lead: {}, tours: [{ property_id: 5, status: "scheduled" }] }).reason !== null, true)
check("open action blocks",
  favoriteMoveBlock({ favorite: { id: 5 }, lead: {}, nextActions: [{ property_id: 5, completed: false, status: "open" }] }).reason !== null, true)
check("completed action alone does NOT block here (historical handled by async DB check)",
  favoriteMoveBlock({ favorite: { id: 5 }, lead: {}, nextActions: [{ property_id: 5, completed: true, status: "completed" }] }).reason, null)
check("no dependency → not blocked",
  favoriteMoveBlock({ favorite: { id: 5 }, lead: {}, tours: [], nextActions: [] }).reason, null)

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
