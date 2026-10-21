// ONE SECONDARY ACTION PER FAVORITE — never two.
//
// Schedule Tour and Check Application share the same slot on a Favorite's property row, beside
// Guest Card Sent. They belong to different moments: you schedule before a tour, you check an
// application after one was submitted. Showing both would offer an action that cannot apply.
//
// The resolver returns a SINGLE value, so "both" is unrepresentable rather than merely avoided —
// these assertions pin that, and the precedence, across every combination of inputs.
import { favoriteSecondaryAction } from "@/lib/leads/favoriteActions"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const base = {
  checkApplicationOpen: false, canCheckApplication: false,
  hasScheduledTour: false, canScheduleTour: false, hasScheduleTarget: false,
}

console.log("\n1. CHECK APPLICATION — the later state, and it wins:")
ok("an open application shows Check Application",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: true, canCheckApplication: true }) === "check_application")
ok("…even when Schedule Tour would otherwise qualify",
  favoriteSecondaryAction({ checkApplicationOpen: true, canCheckApplication: true, hasScheduledTour: false, canScheduleTour: true, hasScheduleTarget: true }) === "check_application")
ok("a CLOSED application does not show it",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: false, canCheckApplication: true }) === null)
ok("no handler ⇒ not offered",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: true, canCheckApplication: false }) === null)

console.log("\n2. SCHEDULE TOUR — only before a tour exists:")
ok("no tour yet, handler and target present ⇒ Schedule Tour",
  favoriteSecondaryAction({ ...base, canScheduleTour: true, hasScheduleTarget: true }) === "schedule_tour")
ok("a tour already scheduled ⇒ hidden",
  favoriteSecondaryAction({ ...base, hasScheduledTour: true, canScheduleTour: true, hasScheduleTarget: true }) === null)
ok("no scheduling target ⇒ hidden",
  favoriteSecondaryAction({ ...base, canScheduleTour: true, hasScheduleTarget: false }) === null)
ok("no handler ⇒ hidden",
  favoriteSecondaryAction({ ...base, canScheduleTour: false, hasScheduleTarget: true }) === null)

console.log("\n3. EXHAUSTIVE — 32 input combinations, never two actions:")
let both = 0, checked = 0, byState: Record<string, number> = {}
for (let m = 0; m < 32; m++) {
  const input = {
    checkApplicationOpen: !!(m & 1), canCheckApplication: !!(m & 2),
    hasScheduledTour: !!(m & 4), canScheduleTour: !!(m & 8), hasScheduleTarget: !!(m & 16),
  }
  const r = favoriteSecondaryAction(input)
  checked++
  byState[String(r)] = (byState[String(r)] ?? 0) + 1
  // The type permits exactly one value; this guards the shape too.
  if (Array.isArray(r) || (r !== null && r !== "check_application" && r !== "schedule_tour")) both++
}
console.log(`  outcomes across ${checked}: ${JSON.stringify(byState)}`)
ok("every combination yields exactly one value or null", both === 0)
ok("all three outcomes are reachable",
  (byState["check_application"] ?? 0) > 0 && (byState["schedule_tour"] ?? 0) > 0 && (byState["null"] ?? 0) > 0)

console.log("\n4. THE CARD MARKUP USES THE RESOLVER, AND RENDERS ONE BUTTON:")
{
  const src = require("node:fs").readFileSync("components/crm/LeadFavorites.tsx", "utf8")
  ok("the resolver is called", /favoriteSecondaryAction\(\{/.test(src))
  ok("showCheckApp derives from it", /showCheckApp = secondaryAction === "check_application"/.test(src))
  ok("showScheduleTour derives from it", /showScheduleTour = secondaryAction === "schedule_tour"/.test(src))
  ok("exactly ONE Check Application button exists",
    (src.match(/onCheckApplication!?\(lead,/g) ?? []).length === 1,
    String((src.match(/onCheckApplication!?\(lead,/g) ?? []).length))
  ok("the old bottom action row is gone (no button in a justify-between state row)",
    !/justify-between[^]{0,400}Check Application\s*<\/button>/.test(src))
  ok("the state line still renders when there IS a state",
    /checkAppOpen && onCheckApplication && favState &&/.test(src))
  ok("Schedule Tour is still offered", /Schedule Tour\s*<\/button>/.test(src) || /> Schedule Tour/.test(src))
  ok("the Top Pick badge is untouched", /the property this lead is moving on/.test(src))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
