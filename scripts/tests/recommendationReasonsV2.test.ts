// "WHY I CHOSE THIS FOR YOU" — why the cards were empty, and what may fill them.
//
// Pure and offline. Run: `npx tsx scripts/tests/recommendationReasonsV2.test.ts`
//
// ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────
// Generation was never broken. It was STARVED. collectRecommendationReasons consumes evidence
// the evaluators supply, and the Map/Explorer path supplies exactly one thing — a location
// match — because Google gives the map no rent, amenities, approval terms or drive times. So a
// property inside a preferred area produced one generic line and a property outside it produced
// nothing at all. Lead 91's five recommendations: three reading "In your preferred area", two
// empty.
//
// The corrections are therefore about saying MORE with the same evidence, never about finding
// new evidence to claim:
//   • name the area the client themselves saved, instead of alluding to it
//   • stop discarding a third grounded reason the database already allows
// A property whose only truthful statement is "it is in San Antonio" still earns none, which is
// the whole point of the file this tests.

import { readFileSync } from "node:fs"
import { collectRecommendationReasons, AUTO_REASON_LIMIT, MAX_REASONS } from "@bc/companion-shared"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

// ── the ceiling ─────────────────────────────────────────────────────────────────────────────
console.log("\nUp to three")
ok("automatic generation may now produce three", AUTO_REASON_LIMIT === 3)
ok("which is the database ceiling, not above it", AUTO_REASON_LIMIT === MAX_REASONS && MAX_REASONS === 3)
const three = collectRecommendationReasons({
  amenities: ["pool", "in-unit washer"],
  locationMatch: true,
  locationArea: "Alamo Heights",
  budget: "Within budget",
  approvalReason: "Second chance",
})
ok("three grounded families produce three reasons", three.length === 3)
ok("never four, whatever the evidence", three.length <= MAX_REASONS)
ok("priority order is unchanged: amenities, location, budget", /^Has the /.test(three[0]) && /preferred areas$/.test(three[1]) && three[2] === "Within your budget")

// ── the location reason names the evidence ──────────────────────────────────────────────────
console.log("\nA specific location reason")
const specific = collectRecommendationReasons({ locationMatch: true, locationArea: "Alamo Heights" })
ok("it names the client's own area", specific[0] === "In Alamo Heights, one of your preferred areas")
ok("the area came from the client, so nothing is invented", specific[0].includes("Alamo Heights"))
for (const [label, v] of [["absent", undefined], ["null", null], ["empty", ""], ["whitespace", "  "]] as const) {
  ok(`${label} detail falls back to the original line`, collectRecommendationReasons({ locationMatch: true, locationArea: v })[0] === "In your preferred area")
}
ok("no location match ⇒ no location reason, detail or not", collectRecommendationReasons({ locationMatch: false, locationArea: "Alamo Heights" }).length === 0)

// ── NOTHING IS INVENTED ─────────────────────────────────────────────────────────────────────
console.log("\nNever invented")
const mapOnly = collectRecommendationReasons({ locationMatch: true, locationArea: "Downtown San Antonio" })
ok("no price appears when no rent is known", !/\$|budget/i.test(mapOnly.join(" ")))
ok("no commute time appears when none was computed", !/\bmin\b|minute/i.test(mapOnly.join(" ")))
ok("no amenity appears when none was verified", !/pool|washer|gym|parking/i.test(mapOnly.join(" ")))
ok("a property with no evidence at all earns ZERO reasons", collectRecommendationReasons({}).length === 0)
ok("zero stays zero — slots are never padded", collectRecommendationReasons({ locationMatch: false }).length === 0)
// Being in the client's market is NOT evidence; it is true of every search result.
const neutral = assessLocationFit({ propertyAddress: "100 Main St, San Antonio, TX" } as never, { city: "San Antonio", desiredAreas: "Alamo Heights" })
ok("'inside the market' is a neutral tone, so it produces no reason", neutral?.tone === "neutral" && collectRecommendationReasons({ locationMatch: neutral?.tone === "match" }).length === 0)

// ── the evidence the Map path really has ────────────────────────────────────────────────────
console.log("\nThe Map path, end to end")
const client = { city: "San Antonio", desiredAreas: "Downtown San Antonio, Alamo Heights" }
const inArea = assessLocationFit({ propertyAddress: "200 Broadway, Alamo Heights, San Antonio, TX" } as never, client)
ok("a property in a saved area is a match", inArea?.tone === "match")
ok("and it carries the matched wording", typeof inArea?.match === "string" && inArea!.match!.length > 0)
const fromMap = collectRecommendationReasons({ locationMatch: inArea?.tone === "match", locationArea: inArea?.match ?? null })
ok("which becomes a specific client-facing reason", fromMap.length === 1 && fromMap[0].startsWith("In ") && fromMap[0].endsWith("one of your preferred areas"))
const outside = assessLocationFit({ propertyAddress: "1 Main St, Austin, TX" } as never, client)
ok("a property outside the market still earns nothing", outside?.tone !== "match" && collectRecommendationReasons({ locationMatch: outside?.tone === "match" }).length === 0)

// ── nothing already saved is touched ────────────────────────────────────────────────────────
console.log("\nSaved reasons are never rewritten")
const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
ok("reasons are computed on the INSERT row only", /const recRow = \{ \.\.\.rowBase[^}]*reasons: recReasons \}/.test(dash))
ok("both paths pass the area detail", (dash.match(/locationArea:/g) || []).length === 2)
// THE GUARANTEE HE ASKED FOR: no code path recomputes reasons for a row that already exists, so
// an agent's hand-edited list cannot be overwritten by generation. The only writer is the
// explicit manual save.
const writers = ["app", "lib", "components"]
  .flatMap((d) => listTs(d))
  .filter((f) => !f.endsWith("DashboardClient.tsx"))
  .filter((f) => {
    const src = readFileSync(f, "utf8")
    return /\.update\(\s*\{[^}]*\breasons\b/.test(src)
  })
ok(`no background writer updates reasons (found ${writers.length}: ${writers.join(", ") || "none"})`, writers.length === 0)

// ── "Not viewed yet" ────────────────────────────────────────────────────────────────────────
// A viewing status is a statement about a list the client was GIVEN. Lead 91 has zero rows in
// client_recommendation_shares and the panel still announced the client had not viewed it.
console.log("\nViewing status")
const eng = readFileSync("components/crm/RecommendationEngagement.tsx", "utf8")
ok("no share row ⇒ the label is hidden entirely", /if \(rows\.length === 0\) return null/.test(eng))
// Anchored on the RENDERED span, not the word — the file also discusses the old wrong label
// in a comment above the fetch.
ok("that check runs BEFORE anything renders", eng.indexOf("rows.length === 0") < eng.indexOf("<span>Not viewed yet</span>"))
ok("sent but unopened still says 'Not viewed yet'", /Not viewed yet/.test(eng))
ok("a verified view still reports count and recency", /Viewed \{views\}×/.test(eng) && /Last viewed \{ago\(last\)\}/.test(eng))
// PRESERVED: this is a read-only consumer of the existing endpoint — no tracking is altered.
ok("it still reads the existing share endpoint, adding no tracking", /\/api\/admin\/client-shares\?leadId=/.test(eng))
ok("view counts are still summed across the client's lists", /rows\.reduce\(\(n, r\) => n \+ \(r\.viewSessionCount \?\? 0\), 0\)/.test(eng))

function listTs(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = `${d}/${e}`
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
  }
  walk(dir)
  return out
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
