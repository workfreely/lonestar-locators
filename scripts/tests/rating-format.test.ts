/**
 * Shared Google-rating star math (@bc/companion-shared) — the single source both
 * the CRM property card and the Companion Current Property card use, so their
 * partial-fill behavior is identical. No DB, no UI:
 *   npx tsx scripts/tests/rating-format.test.ts
 */
import { starFillPercent, formatRating } from "@bc/companion-shared"

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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
