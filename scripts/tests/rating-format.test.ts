/**
 * Shared Google-rating star math (@bc/companion-shared) — the single source both
 * the CRM property card and the Companion Current Property card use, so their
 * partial-fill behavior is identical. No DB, no UI:
 *   npx tsx scripts/tests/rating-format.test.ts
 */
import { starFillPercent, formatRating, displayAddress } from "@bc/companion-shared"
import { placeUrl, placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else { fail++; console.error("✗", name, `(got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`) }
}

// starFillPercent: linear 0–5 → 0–100, clamped, so a decimal partial-fills.
eq(starFillPercent(5), 100, "5.0 → 100%")
eq(starFillPercent(0), 0, "0.0 → 0%")
eq(starFillPercent(4.3), 86, "4.3 → 86%")
eq(starFillPercent(3.4), 68, "3.4 → 68%")
eq(starFillPercent(2.7), 54, "2.7 → 54%")
eq(starFillPercent(6), 100, "out-of-range high clamps to 100%")
eq(starFillPercent(-1), 0, "negative clamps to 0%")

// formatRating: always one decimal place.
eq(formatRating(4.3), "4.3", "4.3 → '4.3'")
eq(formatRating(5), "5.0", "5 → '5.0'")
eq(formatRating(4), "4.0", "4 → '4.0'")

// displayAddress: drop ONLY a trailing country token; keep street/city/state/ZIP.
eq(
  displayAddress("21739 Hardy Oak Blvd, San Antonio, TX 78258, USA"),
  "21739 Hardy Oak Blvd, San Antonio, TX 78258",
  "strips trailing ', USA'",
)
eq(
  displayAddress("100 Main St, Austin, TX 78701, United States"),
  "100 Main St, Austin, TX 78701",
  "strips trailing ', United States'",
)
eq(
  displayAddress("100 Main St, Austin, TX 78701"),
  "100 Main St, Austin, TX 78701",
  "no country token → unchanged",
)
eq(displayAddress(null), "", "null → empty string")
eq(
  displayAddress("1 USA Pkwy, Reno, NV 89434, USA"),
  "1 USA Pkwy, Reno, NV 89434",
  "only the TRAILING country is removed, not 'USA' inside the street",
)

// placeIdFromPropertyUrl: the identifier used to join recs/favorites to the
// catalog. Round-trips the canonical map URL; null for non-Google URLs.
eq(placeIdFromPropertyUrl(placeUrl("ChIJ1S-W1ERjXIYRf8B7XujAZcA")), "ChIJ1S-W1ERjXIYRf8B7XujAZcA", "round-trips place_id from canonical placeUrl")
eq(
  placeIdFromPropertyUrl("https://www.google.com/maps/place/?q=place_id:ChIJxyz&hl=en"),
  "ChIJxyz",
  "extracts place_id even with extra query params",
)
eq(placeIdFromPropertyUrl("https://smartapartmentdata.com/vp/123"), null, "non-Google (SAD) URL → null")
eq(placeIdFromPropertyUrl(null), null, "null URL → null")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
