// ONE SECONDARY ACTION PER FAVORITE — never two.
//
// Schedule Tour, Tour Follow-Up and Check Application share the same slot on a Favorite's property
// row, beside Guest Card Sent. They are consecutive moments in one workflow: you schedule before a
// tour, you record the outcome after it happened, you check the application once one was
// submitted. Showing two would offer an action that cannot apply.
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
  tourFollowUpOpen: false, canTourFollowUp: false,
  hasScheduledTour: false, canScheduleTour: false, hasScheduleTarget: false,
}

console.log("\n1. CHECK APPLICATION — the later state, and it wins:")
ok("an open application shows Check Application",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: true, canCheckApplication: true }) === "check_application")
ok("…even when Schedule Tour would otherwise qualify",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: true, canCheckApplication: true, canScheduleTour: true, hasScheduleTarget: true }) === "check_application")
ok("…and even when Tour Follow-Up would otherwise qualify",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: true, canCheckApplication: true, tourFollowUpOpen: true, canTourFollowUp: true }) === "check_application")
ok("a CLOSED application does not show it",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: false, canCheckApplication: true }) === null)
ok("no handler ⇒ not offered",
  favoriteSecondaryAction({ ...base, checkApplicationOpen: true, canCheckApplication: false }) === null)

console.log("\n2. TOUR FOLLOW-UP — after the tour, before the application:")
ok("an occurred tour with an open follow-up shows Tour Follow-Up",
  favoriteSecondaryAction({ ...base, tourFollowUpOpen: true, canTourFollowUp: true }) === "tour_follow_up")
ok("…and it OUTRANKS Schedule Tour",
  favoriteSecondaryAction({ ...base, tourFollowUpOpen: true, canTourFollowUp: true, canScheduleTour: true, hasScheduleTarget: true }) === "tour_follow_up")
ok("no open follow-up ⇒ not offered",
  favoriteSecondaryAction({ ...base, tourFollowUpOpen: false, canTourFollowUp: true }) === null)
ok("no handler ⇒ not offered",
  favoriteSecondaryAction({ ...base, tourFollowUpOpen: true, canTourFollowUp: false }) === null)
// An UPCOMING tour never reaches this slot: the component passes tourFollowUpOpen=false for one,
// so its card keeps the scheduled date and time it has always shown.
ok("an upcoming tour (follow-up not open) leaves the slot to Schedule Tour's rule",
  favoriteSecondaryAction({ ...base, tourFollowUpOpen: false, canTourFollowUp: true, hasScheduledTour: true, canScheduleTour: true, hasScheduleTarget: true }) === null)

console.log("\n3. SCHEDULE TOUR — only before a tour exists:")
ok("no tour yet, handler and target present ⇒ Schedule Tour",
  favoriteSecondaryAction({ ...base, canScheduleTour: true, hasScheduleTarget: true }) === "schedule_tour")
ok("a tour already scheduled ⇒ hidden",
  favoriteSecondaryAction({ ...base, hasScheduledTour: true, canScheduleTour: true, hasScheduleTarget: true }) === null)
ok("no scheduling target ⇒ hidden",
  favoriteSecondaryAction({ ...base, canScheduleTour: true, hasScheduleTarget: false }) === null)
ok("no handler ⇒ hidden",
  favoriteSecondaryAction({ ...base, canScheduleTour: false, hasScheduleTarget: true }) === null)

console.log("\n4. EXHAUSTIVE — all 128 input combinations, never two actions:")
let bad = 0, checked = 0, byState: Record<string, number> = {}
const VALID = new Set(["check_application", "tour_follow_up", "schedule_tour", "null"])
for (let m = 0; m < 128; m++) {
  const input = {
    checkApplicationOpen: !!(m & 1), canCheckApplication: !!(m & 2),
    hasScheduledTour: !!(m & 4), canScheduleTour: !!(m & 8), hasScheduleTarget: !!(m & 16),
    tourFollowUpOpen: !!(m & 32), canTourFollowUp: !!(m & 64),
  }
  const r = favoriteSecondaryAction(input)
  checked++
  byState[String(r)] = (byState[String(r)] ?? 0) + 1
  // The type permits exactly one value; this guards the shape too.
  if (Array.isArray(r) || !VALID.has(String(r))) bad++
  // PRECEDENCE, checked per combination rather than asserted once.
  if (input.checkApplicationOpen && input.canCheckApplication && r !== "check_application") bad++
  if (r === "schedule_tour" && input.tourFollowUpOpen && input.canTourFollowUp) bad++
}
console.log(`  outcomes across ${checked}: ${JSON.stringify(byState)}`)
ok("every combination yields exactly one value or null, in precedence order", bad === 0, `${bad} violations`)
ok("all four outcomes are reachable",
  (byState["check_application"] ?? 0) > 0 && (byState["tour_follow_up"] ?? 0) > 0 &&
  (byState["schedule_tour"] ?? 0) > 0 && (byState["null"] ?? 0) > 0)

console.log("\n5. THE CARD MARKUP USES THE RESOLVER, AND RENDERS ONE BUTTON:")
{
  const src = require("node:fs").readFileSync("components/crm/LeadFavorites.tsx", "utf8")
  ok("the resolver is called", /favoriteSecondaryAction\(\{/.test(src))
  ok("showCheckApp derives from it", /showCheckApp = secondaryAction === "check_application"/.test(src))
  ok("showScheduleTour derives from it", /showScheduleTour = secondaryAction === "schedule_tour"/.test(src))
  ok("showTourFollowUp derives from it", /showTourFollowUp = secondaryAction === "tour_follow_up"/.test(src))
  ok("exactly ONE Check Application button exists",
    (src.match(/onCheckApplication!?\(lead,/g) ?? []).length === 1,
    String((src.match(/onCheckApplication!?\(lead,/g) ?? []).length))
  ok("the old bottom action row is gone (no button in a justify-between state row)",
    !/justify-between[^]{0,400}Check Application\s*<\/button>/.test(src))
  // The Check Application STATE LINE was removed in an earlier approved cleanup — this assertion
  // still expected it and had been failing since. It now pins the opposite, which is what the card
  // actually does: the action row carries the next step, and no lone status band restates it.
  ok("the removed Check Application state line has NOT come back",
    !/checkAppOpen && onCheckApplication && favState &&/.test(src))
  ok("Schedule Tour is still offered", /Schedule Tour\s*<\/button>/.test(src) || /> Schedule Tour/.test(src))
  ok("the Top Pick badge is untouched", /the property this lead is moving on/.test(src))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
