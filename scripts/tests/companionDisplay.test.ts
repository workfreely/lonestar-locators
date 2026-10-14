// BEAST COMPANION DISPLAY — the completion method, and compact Desired Areas.
//
// Pure and offline. Run: `npx tsx scripts/tests/companionDisplay.test.ts`
//
// ── WHY THE APPROVED INDICATOR NEVER APPEARED ───────────────────────────────────────────────
// leadToDto HAS been setting lastAction.completedVia since f41c53b, and lead 91's action 110
// carries completed_via = "followup_agent" in production. The field never reached the panel
// because lastActionSchema did not declare it, and zod strips unknown keys — so the DTO was
// validated into a shape without it, silently, on every request. A field that is produced and
// not declared does not exist.

import { readFileSync } from "node:fs"
import { compactDesiredAreas } from "@bc/companion-shared"
import { lastActionSchema } from "../../packages/companion-shared/src/leads/contract"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

// ── THE CONTRACT ────────────────────────────────────────────────────────────────────────────
console.log("\nThe DTO carries the completion method")
const parsed = lastActionSchema.parse({
  title: "Contact Lead",
  completedAt: "2026-10-14T14:00:47+00:00",
  propertyName: null,
  completedVia: "followup_agent",
})
ok("completedVia survives validation", parsed.completedVia === "followup_agent")
ok("the title is untouched", parsed.title === "Contact Lead")
ok("manual survives too", lastActionSchema.parse({ title: "Contact Lead", completedVia: "manual" }).completedVia === "manual")
ok("a legacy row stays null", lastActionSchema.parse({ title: "Contact Lead", completedVia: null }).completedVia === null)
ok("an absent field is permitted", lastActionSchema.parse({ title: "Contact Lead" }).completedVia === undefined)

// ── THE RENDER ──────────────────────────────────────────────────────────────────────────────
console.log("\nThe Companion renders the approved state")
const view = readFileSync("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx", "utf8")
ok("a green check-circle, inline with the title", /stroke="#059669"[\s\S]{0,220}m9 12 2 2 4-4/.test(view))
ok("the title is still the task's own label", /formatLastActionLabel\(lastAction\.title\)/.test(view))
ok("a bot glyph for Automated", /completedVia === "followup_agent" \? \([\s\S]{0,400}M12 8V4H8/.test(view))
ok("a person glyph for Manually completed", /M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2/.test(view))
ok("the wording matches the CRM", /"Automated" : "Manually completed"/.test(view))
ok("the indicator appears ONLY for an explicit method", /lastAction\.completedVia === "followup_agent" \|\| lastAction\.completedVia === "manual"/.test(view))
ok("the completed timestamp line is unchanged", /Completed: <span className="lp-completed-val">/.test(view))
ok("the divider and Next Action section are untouched", /borderTop: "1px solid color-mix/.test(view))
// The CRM and the Companion must say the same words.
const crm = readFileSync("components/crm/CompletedActionLine.tsx", "utf8")
for (const w of ["Automated", "Manually completed"]) ok(`both panels say ${JSON.stringify(w)}`, crm.includes(w) && view.includes(w))

// ── COMPACT DESIRED AREAS ───────────────────────────────────────────────────────────────────
console.log("\nCompact Desired Areas")
ok("the reported case", compactDesiredAreas("Downtown San Antonio, Alamo Heights", "San Antonio") === "Downtown, Alamo Heights")
ok("a label with no city suffix is untouched", compactDesiredAreas("Stone Oak, Alamo Heights", "San Antonio") === "Stone Oak, Alamo Heights")
ok("other markets keep their city", compactDesiredAreas("Downtown Dallas", "Dallas") === "Downtown")
ok("Houston", compactDesiredAreas("Uptown Houston, Montrose", "Houston") === "Uptown, Montrose")

console.log("\nIt never creates ambiguity")
ok("a label that IS the city stays whole", compactDesiredAreas("San Antonio", "San Antonio") === "San Antonio")
ok("a lone compass remainder keeps its city", compactDesiredAreas("North San Antonio", "San Antonio") === "North San Antonio")
ok("the city must be a whole-word SUFFIX", compactDesiredAreas("San Antonio Heights", "San Antonio") === "San Antonio Heights")
ok("ANOTHER city's name is never stripped", compactDesiredAreas("Downtown Austin, The Domain", "San Antonio") === "Downtown Austin, The Domain")
ok("no city ⇒ no trim", compactDesiredAreas("Downtown San Antonio", null) === "Downtown San Antonio")
ok("no areas ⇒ nothing", compactDesiredAreas("", "San Antonio") === "")
ok("a partial word is not a suffix", compactDesiredAreas("Downtown SanAntonio", "San Antonio") === "Downtown SanAntonio")

console.log("\nThe stored value is never what is shown")
// Display only: the formatter is called at render, and no writer passes through it.
for (const f of ["lib/criteria/processNotesLocation.ts", "lib/criteria/reconcileLocation.ts", "lib/propertyExplorer/locationFit.ts"]) {
  ok(`${f} does not use it`, !readFileSync(f, "utf8").includes("compactDesiredAreas"))
}
const panel = readFileSync("components/crm/LeadPanel.tsx", "utf8")
ok("the CRM calls it at render", panel.includes("compactDesiredAreas(raw, city)"))
ok("the Companion calls it at render", view.includes("compactDesiredAreas(sc.desiredAreas, sc.city)"))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
