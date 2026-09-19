// Coverage for the shared canonicalPropertyKey helper — the property dedupe identity
// used by Map/Companion "already recommended" button state. It must mirror the DB
// `canonical_property_key` generated column exactly. Identity only — this asserts NO
// collection-transition behavior (Recommendation ↔ Favorite remain mutually exclusive,
// governed by the DashboardClient verb handler).
// Run: npx tsx scripts/leads/canonicalPropertyKey.test.ts
import { canonicalPropertyKey } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const ATLANTICA_URL = "https://www.google.com/maps/place/?q=place_id:ChIJA_VnzrNDXIYROEWwiRVMAk4"
const ATLANTICA_KEY = "pid:ChIJA_VnzrNDXIYROEWwiRVMAk4"

console.log("canonicalPropertyKey (mirrors the DB canonical_property_key generated column):")
ok("place_id URL → pid: key", canonicalPropertyKey(ATLANTICA_URL) === ATLANTICA_KEY)
ok("non-map URL → lowercased url: key", canonicalPropertyKey("HTTPS://Example.com/View?ID=5 ") === "url:https://example.com/view?id=5")
ok("empty/nullish → null", canonicalPropertyKey("") === null && canonicalPropertyKey(null) === null && canonicalPropertyKey(undefined) === null)
ok("pid: and url: forms are distinct", canonicalPropertyKey(ATLANTICA_URL) !== canonicalPropertyKey("https://sad.example/ViewProperty?id=1"))
ok("two different place_ids don't collide", canonicalPropertyKey(ATLANTICA_URL) !== canonicalPropertyKey("https://www.google.com/maps/place/?q=place_id:ChIJDIFFERENT000000000000000"))
ok("place_id key is case-sensitive (not lowercased)", canonicalPropertyKey(ATLANTICA_URL) === ATLANTICA_KEY && ATLANTICA_KEY !== ATLANTICA_KEY.toLowerCase())
ok("same property, trailing whitespace → same key", canonicalPropertyKey(`  ${ATLANTICA_URL}  `) === ATLANTICA_KEY)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
