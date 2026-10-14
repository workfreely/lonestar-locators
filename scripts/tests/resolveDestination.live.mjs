// LIVE resolver check — the real Places API, read-only.
//
// Run: `npx tsx scripts/tests/resolveDestination.live.mjs`
// NOT part of the offline suite: it makes real API calls and needs GOOGLE_PLACES_API_KEY, so it
// is run deliberately rather than on every build.
//
// It exists because the alias map's justification is EMPIRICAL — "Randolph AFB" returns scattered
// candidates and the canonical name does not — and that is a claim about Google's data, not about
// our code. If Google's results change, this is what tells us.
import fs from "node:fs"
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
)
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v

const { resolveDestination } = await import("../../lib/criteria/resolveDestination.ts")

let pass = 0, fail = 0
const ok = (l, c) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("\nThe alias resolves confidently")
for (const q of ["Randolph AFB", "Randolph Air Force Base", "Randolph A.F.B.", "JBSA-Randolph"]) {
  const r = await resolveDestination(q)
  ok(`"${q}" resolves`, r.status === "resolved")
  if (r.status === "resolved") {
    ok("  → a real place id, not a baked one", /^[A-Za-z0-9_-]{15,}$/.test(r.destination.placeId))
    ok("  → label mentions Randolph", /randolph/i.test(r.destination.label))
  }
}

console.log("\nAmbiguity is STILL refused (the rule was not weakened)")
for (const q of ["Methodist Hospital", "Randolph"]) {
  const r = await resolveDestination(q)
  ok(`"${q}" is not forced to a guess`, r.status !== "resolved")
}

console.log("\nUnaliased destinations still work on their own")
ok("Lackland AFB resolves without an alias", (await resolveDestination("Lackland AFB")).status === "resolved")

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
