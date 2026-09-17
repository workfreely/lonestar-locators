// Property-specific Guest Card guard — pure core. The orchestration (modal,
// timeline write, move continuation) is wired in DashboardClient and verified by
// build; here we lock down the property resolution + per-property "handled" logic.
// Run: npx tsx scripts/tests/guestCardGuard.test.ts

import {
  resolveGuardPropertyId,
  hasCompletedGuestCardAction,
  isGuestCardHandled,
  isGuardedStage,
} from "../../lib/leads/guestCardGuard"

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

const gc = (property_id: number | string, done = true) => ({
  action_key: "email_guest_card",
  property_id,
  completed: done,
  status: done ? "completed" : "open",
})

console.log("\nresolveGuardPropertyId — applied hierarchy")
check("open start_application wins",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [{ action_key: "start_application", property_id: 11, status: "open" }], "applied"), 11)
check("open check_application next",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [{ action_key: "check_application", property_id: 22, status: "open" }], "applied"), 22)
check("falls back to top_pick",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [], "applied"), 99)
check("null when nothing known",
  resolveGuardPropertyId({ top_pick_favorite_id: null }, [], "applied"), null)
check("completed start_application does NOT count (must be open)",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [{ action_key: "start_application", property_id: 11, status: "completed" }], "applied"), 99)

console.log("\nresolveGuardPropertyId — closed hierarchy")
check("open confirm_lease wins",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [{ action_key: "confirm_lease", property_id: 33, status: "open" }], "closed"), 33)
check("closed reads open check_application before top_pick (drag/Voice Applied path, no Top Pick)",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [{ action_key: "check_application", property_id: 44, status: "open" }], "closed"), 44)
check("closed: confirm_lease still beats check_application",
  resolveGuardPropertyId({ top_pick_favorite_id: 99 }, [
    { action_key: "check_application", property_id: 44, status: "open" },
    { action_key: "confirm_lease", property_id: 33, status: "open" },
  ], "closed"), 33)
check("closed falls back to top_pick (legacy) when no open action",
  resolveGuardPropertyId({ top_pick_favorite_id: 77 }, [], "closed"), 77)
check("closed: completed check_application does NOT count",
  resolveGuardPropertyId({ top_pick_favorite_id: 77 }, [{ action_key: "check_application", property_id: 44, status: "completed" }], "closed"), 77)

console.log("\nhasCompletedGuestCardAction — PER-PROPERTY")
check("completed card for A satisfies A", hasCompletedGuestCardAction(1, [gc(1)]), true)
check("completed card for B does NOT satisfy A", hasCompletedGuestCardAction(1, [gc(2)]), false)
check("OPEN card for A does NOT satisfy A (not sent yet)", hasCompletedGuestCardAction(1, [gc(1, false)]), false)
check("string/number id match", hasCompletedGuestCardAction("1", [gc(1)]), true)
check("no cards → not handled", hasCompletedGuestCardAction(1, []), false)

console.log("\nisGuestCardHandled — action OR external confirmation set")
check("completed action for A → handled", isGuestCardHandled(1, [gc(1)]), true)
check("confirmed set for A → handled", isGuestCardHandled(1, [], [1]), true)
check("confirmed set for B + applying A → NOT handled", isGuestCardHandled(1, [], [2]), false)
check("nothing → not handled", isGuestCardHandled(1, [], []), false)

console.log("\nisGuardedStage")
check("applied guarded", isGuardedStage("applied"), true)
check("closed guarded", isGuardedStage("closed"), true)
check("searching not guarded", isGuardedStage("searching"), false)
check("contacted not guarded", isGuardedStage("contacted"), false)

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
