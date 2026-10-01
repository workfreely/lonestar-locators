// Add Favorites must REUSE the canonical property search — not ask the locator to
// re-type what Locator Beast already knows.
//
// Run: npx tsx scripts/leads/favoriteSearch.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { placeUrl, placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const modal = strip(read("components/crm/FavoriteModal.tsx"))
const favs = strip(read("components/crm/LeadFavorites.tsx"))

console.log("ONE search implementation — the MAP's, not a lookalike:")
// Superseded: this first wired the Social-Autopilot helper, which also calls
// Place.searchByText and so looked like reuse. It is not the same search — see
// scripts/leads/canonicalPropertySearch.test.ts for the full contract.
ok("the modal uses the canonical (Map) property search",
  /import CanonicalPropertySearchField/.test(modal))
ok("and no longer uses the Social-Autopilot helper",
  !/social\/PropertySearchField/.test(modal))
ok("it does NOT build a second search system",
  !/loadGoogleMaps/.test(modal) && !/searchByText/.test(modal) && !/places\.Place/.test(modal))

console.log("\nSELECTING a property fills everything Locator Beast already knows:")
ok("name comes from the match", /name: m\.name/.test(modal))
ok("address comes from the match", /address: m\.address \?\? ""/.test(modal))
ok("the URL is the CANONICAL place URL, not a typed one", /url: placeUrl\(m\.placeId\)/.test(modal))
ok("placeUrl produces the '?q=place_id:' carrier the generated column parses",
  /[?&]q=place_id:/.test(placeUrl("ChIJt50tPlT3XIYRpEb54VDa9eg")))
ok("and that carrier round-trips back to the same place id",
  placeIdFromPropertyUrl(placeUrl("ChIJt50tPlT3XIYRpEb54VDa9eg")) === "ChIJt50tPlT3XIYRpEb54VDa9eg")
// property_catalog is the source of truth for imagery — nothing is copied onto the row.
ok("no image is stored on the favorite; the catalog resolves it read-side",
  /image: null/.test(modal))
ok("a matched slot needs no further typing to be saveable", /if \(s\.matched\) return true/.test(modal))

console.log("\nFALLBACK for a property LB genuinely does not know is PRESERVED:")
ok("the URL field still exists behind an explicit opt-in", /Can&apos;t find it\? Add by URL instead/.test(modal))
ok("metadata detection is unchanged", /\/api\/favorites\/detect-metadata/.test(modal))
ok("manual name and address inputs still exist in that path",
  /Property Name/.test(modal) && /Property Address \(optional\)/.test(modal))
ok("and there is a way back to the search", /Search instead/.test(modal))

console.log("\nTHREE independent slots:")
ok("three slots when adding", /const slotCount = isEditing \? 1 : 3/.test(modal))
ok("each slot keeps its OWN search/match state",
  /query: string/.test(modal) && /matched: boolean/.test(modal) && /manual: boolean/.test(modal))
ok("selecting in one slot only touches that slot", /j === i \? \{ \.\.\.x, query: v \}/.test(modal))
ok("clearing a slot resets the WHOLE identity, never half of it",
  /j === index \? \{ \.\.\.EMPTY_SLOT \}/.test(modal) || /i === index \? \{ \.\.\.EMPTY_SLOT \}/.test(modal))

console.log("\nEDITING an existing favorite does not force a re-search:")
ok("a favorite that already has a place-id URL opens as matched",
  /matched: \/\[\?&\]q=place_id:\/\.test\(editing\.property_url \?\? ""\)/.test(modal))

console.log("\nNO DUPLICATE favorites for the same (lead_id, canonical_property_key):")
ok("dedupe compares the CANONICAL key, not the raw URL string",
  /const canonicalKey = \(url: string\)/.test(favs) && /placeIdFromPropertyUrl/.test(favs))
ok("it mirrors the generated column exactly (pid: else url:lowercased)",
  /return pid \? `pid:\$\{pid\}` : `url:\$\{u\.toLowerCase\(\)\}`/.test(favs))
{
  // The case this pass makes reachable: the same property added once from the
  // search and once from a pasted listing link.
  const key = (u: string) => { const p = placeIdFromPropertyUrl(u); return p ? `pid:${p}` : `url:${u.toLowerCase()}` }
  const fromSearch = placeUrl("ChIJt50tPlT3XIYRpEb54VDa9eg")
  const fromPaste = "https://www.google.com/maps/place/?q=place_id:ChIJt50tPlT3XIYRpEb54VDa9eg&hl=en"
  ok("two URL spellings of the same place collapse to one key", key(fromSearch) === key(fromPaste), key(fromSearch))
  ok("two genuinely different places do NOT collide",
    key(fromSearch) !== key(placeUrl("ChIJtTbhZPH1XIYRzkpCdrIRVUY")))
  ok("a non-place URL still gets a stable key", key("https://Example.com/A") === "url:https://example.com/a")
}

console.log(`\nFavorite search: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
