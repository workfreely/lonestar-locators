// ONE property search engine, many UI consumers.
//
// The bug this guards: Add Favorites was wired to a component that also calls
// Place.searchByText, which looked like reuse. Typing "ve" returned NOTHING there
// while the Map returned Vue at Sonoma Verde, Vecina Apartment Villas, The View at
// Westover Hills. Measured against live Places, the market bias alone changes that
// query from 1 result to 8 — and a 3-character floor meant "ve" was never even sent.
//
// Run: npx tsx scripts/leads/canonicalPropertySearch.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { shouldSearch, MIN_QUERY_CHARS } from "@/lib/propertyExplorer/propertySearch"
import { nameMatchesQuery, nameSearchTextQuery } from "@/lib/propertyExplorer/nameSearch"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const svc = strip(read("lib/propertyExplorer/propertySearch.ts"))
const map = strip(read("components/crm/explorer/BeastPropertyExplorer.tsx"))
const field = strip(read("components/crm/CanonicalPropertySearchField.tsx"))
const modal = strip(read("components/crm/FavoriteModal.tsx"))

console.log("THE 2-CHARACTER FLOOR — the reason 've' did nothing:")
ok("MIN_QUERY_CHARS is 2", MIN_QUERY_CHARS === 2)
ok("'ve' searches", shouldSearch("ve"))
ok("'v' does not", !shouldSearch("v"))
ok("whitespace is not a query", !shouldSearch("  "))
// The old field's floor was 3 — the single line that made "ve" a no-op.
ok("the canonical field does NOT reimpose a 3-char floor", !/length < 3/.test(field))

console.log("\nTHE MARKET BIAS — measured at 1 result vs 8 for 've apartments':")
ok("the service accepts a locationBias", /locationBias\?: google\.maps\.places\.SearchByTextRequest\["locationBias"\]/.test(svc))
ok("and passes it to Places when present", /\.\.\.\(locationBias \? \{ locationBias \} : \{\}\)/.test(svc))
ok("the field derives it from the client's city", /getMarketByName\(marketCity/.test(field) && /boundsForMarket\(marketSlug\)/.test(field))
ok("Favorites passes the lead's city", /marketCity=\{lead\?\.city \?\? null\}/.test(read("components/crm/LeadFavorites.tsx")))

console.log("\nTHE FULL ORCHESTRATION came across, not just the Places call:")
for (const [label, re] of [
  ["apartment-context query", /textQuery: nameSearchTextQuery\(name\)/],
  ["types requested, for qualification", /"types"/],
  ["normalizePlace", /normalizePlace\(p, marketSlug\)/],
  ["name-relevance filter", /nameMatchesQuery\(p\.propertyName, name\)/],
  ["property_catalog enrichment", /fetchCatalog\(/],
  ["enrichProperties", /enrichProperties\(found, catalog\)/],
  ["selectInMarketMatch ranking", /selectInMarketMatch\(enriched, marketSlug, name, cataloguedIds\)/],
  ["maxResultCount 10", /maxResultCount: 10/],
] as const) {
  ok(label, re.test(svc))
}

console.log("\nTHE MAP IS UNCHANGED — because it now calls this very code:")
ok("the Map delegates to the service", /return searchProperties\(\{ query: name, locationBias: bias, marketSlug, supabase \}\)/.test(map))
ok("the Map no longer calls Places itself", !/Place\.searchByText/.test(map))
ok("the Map keeps its own map-centre bias fallback", /radius: 50000/.test(map))
ok("the service does not reach into component state", !/useState|useRef|mapRef/.test(svc))

console.log("\nFAVORITES uses the canonical engine, not the old helper:")
ok("it imports the canonical field", /import CanonicalPropertySearchField/.test(modal))
ok("the old Social-Autopilot helper is gone from this modal", !/social\/PropertySearchField/.test(modal))
ok("the URL fallback is preserved", /Can&apos;t find it\? Add by URL instead/.test(modal))
ok("selection still stores the canonical place URL", /url: placeUrl\(m\.placeId\)/.test(modal))

console.log("\nSCOPE — Guest Card and Social Autopilot are deliberately untouched:")
ok("Guest Card still uses the old helper", /social\/PropertySearchField/.test(read("components/crm/GuestCardGuardModal.tsx")))
ok("Social Autopilot still uses the old helper", /PropertySearchField/.test(read("components/crm/social/PostEditor.tsx")))

console.log("\nQUERY SHAPE behaves as the Map's filters expect:")
ok("the apartment-context term is appended", nameSearchTextQuery("ve") === "ve apartments")
// A 2-char query has no "meaningful" tokens, so relevance falls back to a
// whole-query substring test — which is what keeps Vecina/VUE and drops Astra.
ok("'ve' matches Vecina Apartment Villas", nameMatchesQuery("Vecina Apartment Villas", "ve"))
// Precision, not a miss: the relevance filter is a substring test, and "The VUE"
// (v-u-e) contains no "ve". The Map excludes it for this query too — every name
// in the observed result set really does contain the fragment.
ok("'ve' does NOT match The VUE (v-u-e has no 've')", !nameMatchesQuery("The VUE", "ve"))
ok("'ve' matches Villas at Bulverde", nameMatchesQuery("Villas at Bulverde", "ve"))
ok("'ve' matches Vue at Sonoma Verde", nameMatchesQuery("Vue at Sonoma Verde", "ve"))
ok("'ve' matches The View at Westover Hills", nameMatchesQuery("The View at Westover Hills", "ve"))
ok("'ve' does NOT match Astra", !nameMatchesQuery("Astra", "ve"))
ok("'ve' does NOT match Wiregrass at Stone Oak", !nameMatchesQuery("Wiregrass at Stone Oak", "ve"))

console.log(`\nCanonical property search: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
