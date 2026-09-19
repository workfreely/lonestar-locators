// Verifies the Social Beast History "Published" column format: "Sep 19, 2026 · 2:42 AM".
// Run: npx tsx scripts/social/formatPublishedAt.test.ts
import { formatPublishedAt } from "@/lib/social/formatPublishedAt"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("formatPublishedAt (America/Chicago, published_at semantics):")
// 07:42 UTC on 2026-09-05 = 02:42 CDT → the exact target format.
ok('exact target format', formatPublishedAt("2026-09-05T07:42:00Z") === "Sep 5, 2026 · 2:42 AM")
// PM time, 2-digit minutes, no leading zero on the hour.
ok('afternoon time', formatPublishedAt("2026-09-04T18:15:00Z") === "Sep 4, 2026 · 1:15 PM")
ok('single line contains one · separator', (formatPublishedAt("2026-09-02T21:05:00Z").match(/·/g) || []).length === 1)
ok('no newline (one line)', !formatPublishedAt("2026-09-02T21:05:00Z").includes("\n"))
// The literal example from the spec (19th, 07:42 UTC → 2:42 AM CDT).
ok('spec example Sep 19', formatPublishedAt("2026-09-19T07:42:00Z") === "Sep 19, 2026 · 2:42 AM")
// Robustness: nullish / invalid → em dash, never a crash or "Invalid Date".
ok('null → em dash', formatPublishedAt(null) === "—")
ok('undefined → em dash', formatPublishedAt(undefined) === "—")
ok('garbage → em dash', formatPublishedAt("not-a-date") === "—")
ok('accepts a Date object', formatPublishedAt(new Date("2026-09-05T07:42:00Z")) === "Sep 5, 2026 · 2:42 AM")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
