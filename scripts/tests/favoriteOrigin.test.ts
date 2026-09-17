// Favorite provenance helpers — the rule that separates a genuine Client Favorite
// from an application-only property-identity anchor.
// Run: npx tsx scripts/tests/favoriteOrigin.test.ts

import { FAVORITE_ORIGIN, isClientFavorite, isApplicationIdentity } from "../../lib/leads/favoriteOrigin"

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

console.log("\nisClientFavorite — legacy/null and 'favorite' are genuine favorites")
check("null origin (legacy row) → genuine favorite", isClientFavorite({ origin: null }), true)
check("undefined origin (pre-migration) → genuine favorite", isClientFavorite({}), true)
check("origin 'favorite' → genuine favorite", isClientFavorite({ origin: FAVORITE_ORIGIN.favorite }), true)
check("origin 'application' → NOT a favorite", isClientFavorite({ origin: FAVORITE_ORIGIN.application }), false)
check("nullish row → treated as favorite (no crash)", isClientFavorite(null), true)

console.log("\nisApplicationIdentity — only 'application'")
check("origin 'application' → identity row", isApplicationIdentity({ origin: FAVORITE_ORIGIN.application }), true)
check("null origin → not an identity row", isApplicationIdentity({ origin: null }), false)
check("origin 'favorite' → not an identity row", isApplicationIdentity({ origin: FAVORITE_ORIGIN.favorite }), false)
check("undefined origin → not an identity row", isApplicationIdentity({}), false)

console.log("\nmutually exclusive")
for (const origin of [null, undefined, "favorite", "application"]) {
  const row = { origin } as { origin?: string | null }
  check(`origin=${JSON.stringify(origin)}: exactly one of client/application`, isClientFavorite(row) !== isApplicationIdentity(row), true)
}

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
