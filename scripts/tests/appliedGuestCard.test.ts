// Applied-flow guest-card reconciliation (Yes = "guest card already sent for the
// selected property"). Locks down the pure decisions behind the fix:
//   • an existing open email_guest_card for the property is COMPLETED (not left open),
//   • no existing one → CREATE-then-complete (Guest Card Sent recorded once),
//   • an already-completed one → NOOP (never duplicate Guest Card Sent),
//   • a DIFFERENT property's guest card is never touched,
//   • existing Check App → stamped, never duplicated,
//   • an application-only property is excluded from Favorite Properties.
// Run: npx tsx scripts/tests/appliedGuestCard.test.ts

import { planGuestCardSent, planCheckAppAssociation } from "../../lib/leads/appliedGuestCard"
import { isClientFavorite } from "../../lib/leads/favoriteOrigin"

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

const gc = (property_id: number | string, id: number | string, done = false) => ({
  id, action_key: "email_guest_card", property_id, completed: done, status: done ? "completed" : "open",
})

console.log("\n1) Existing open Send Guest Card + Applied Yes → complete THAT action")
check("open email_guest_card for the property → complete(actionId)",
  planGuestCardSent(16, [gc(16, 900)]), { action: "complete", actionId: 900 })
check("string/number id match still completes",
  planGuestCardSent("16", [gc(16, 901)]), { action: "complete", actionId: 901 })

console.log("\n2) No existing Send Guest Card for the property + Applied Yes → create-complete")
check("no email_guest_card for the property → create-complete",
  planGuestCardSent(16, []), { action: "create-complete" })
check("a DIFFERENT property's open guest card is NOT completed (property-scoped)",
  planGuestCardSent(16, [gc(15, 800)]), { action: "create-complete" })

console.log("\nNo duplicate Guest Card Sent history")
check("already-completed guest card for the property → noop",
  planGuestCardSent(16, [gc(16, 902, true)]), { action: "noop" })
check("completed for property wins even if a stray open row exists → noop",
  planGuestCardSent(16, [gc(16, 902, true), gc(16, 903)]), { action: "noop" })

console.log("\n3) Existing Check App → stamp, never a duplicate")
check("open check_application exists → stamp it (no new Check App)",
  planCheckAppAssociation(16, [{ id: 500, action_key: "check_application", property_id: 16, status: "open" }], "applied"),
  { action: "stamp", actionId: 500, actionKey: "check_application" })
check("open start_application wins over check_application",
  planCheckAppAssociation(16, [
    { id: 400, action_key: "start_application", property_id: 16, status: "open" },
    { id: 500, action_key: "check_application", property_id: 16, status: "open" },
  ], "applied"),
  { action: "stamp", actionId: 400, actionKey: "start_application" })
check("applied + no open application action → create the property-scoped Check App",
  planCheckAppAssociation(16, [], "applied"), { action: "create" })
check("closed + no open action → create nothing here (lease flow owns confirm_lease)",
  planCheckAppAssociation(16, [], "closed"), { action: "noop" })
check("completed check_application does NOT count as open → create",
  planCheckAppAssociation(16, [{ id: 500, action_key: "check_application", property_id: 16, status: "completed", completed: true }], "applied"),
  { action: "create" })

console.log("\n4) Application-only property is excluded from Favorite Properties")
const favs = [
  { id: 15, lead_id: 62, property_name: "Oasis Stone Oak", origin: null },
  { id: 16, lead_id: 62, property_name: "Maddox Hills", origin: "application" },
]
const shown = favs.filter((f) => f.lead_id === 62 && isClientFavorite(f)).map((f) => f.id)
check("Favorites display excludes the application-only row (16), keeps genuine (15)", shown, [15])

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
