// Guest Card objective aggregation — genuine-Favorite outstanding Guest Cards.
// Run: npx tsx scripts/tests/guestCardAggregate.test.ts

import { outstandingFavoriteGuestCards, guestCardObjectiveLabel, isFavoriteGuestCardAction } from "../../lib/leads/guestCardAggregate"
import { buildActiveClientPayload } from "../../lib/companion/leadToDto"

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

const LEAD = 1
const fav = (id: number, name: string, origin: string | null = null) => ({ id, lead_id: LEAD, property_name: name, origin })
const gc = (id: number, propertyId: number | null, done = false) => ({
  id, lead_id: LEAD, action_key: "email_guest_card", title: "Email Guest Card", property_id: propertyId,
  completed: done, status: done ? "completed" : "open",
})

// A/B/C are genuine favorites; X is an application-only identity row.
const favorites = [fav(10, "Atlantica at Alamo"), fav(11, "Verandas at Alamo Ranch"), fav(12, "Abacus West"), fav(99, "Applied Only", "application")]

const names = (items: { propertyName: string }[]) => items.map((i) => i.propertyName)

console.log("\noutstanding — genuine favorites only")
check("3 open genuine-Favorite guest cards → all three",
  names(outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 11), gc(3, 12)], favorites)),
  ["Atlantica at Alamo", "Verandas at Alamo Ranch", "Abacus West"])
check("excludes a guest card for an application-only identity row (origin='application')",
  names(outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 99)], favorites)),
  ["Atlantica at Alamo"])
check("excludes a guest card whose property is NOT a Favorite of this lead",
  names(outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 500)], favorites)),
  ["Atlantica at Alamo"])
check("excludes COMPLETED guest cards",
  names(outstandingFavoriteGuestCards(LEAD, [gc(1, 10, true), gc(2, 11)], favorites)),
  ["Verandas at Alamo Ranch"])
check("dedupes multiple open rows for the same property",
  names(outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 10)], favorites)),
  ["Atlantica at Alamo"])
check("4+ favorites supported (no hard cap)",
  outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 11), gc(3, 12), gc(4, 13)], [...favorites, fav(13, "Fourth")]).length, 4)

console.log("\nlabel — singular vs aggregate")
check("0 outstanding → null", guestCardObjectiveLabel([]), null)
check("1 outstanding → 'Send Guest Card · {Property}'",
  guestCardObjectiveLabel(outstandingFavoriteGuestCards(LEAD, [gc(1, 10)], favorites)),
  { title: "Send Guest Card", detail: "Atlantica at Alamo" })
check("2 outstanding → 'Send Guest Cards · 2 properties'",
  guestCardObjectiveLabel(outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 11)], favorites)),
  { title: "Send Guest Cards", detail: "2 properties" })
check("3 outstanding → 'Send Guest Cards · 3 properties'",
  guestCardObjectiveLabel(outstandingFavoriteGuestCards(LEAD, [gc(1, 10), gc(2, 11), gc(3, 12)], favorites)),
  { title: "Send Guest Cards", detail: "3 properties" })

console.log("\naggregate collapse 3 → 2 → 1 → none (derived, no stored state)")
{
  const all = [gc(1, 10), gc(2, 11), gc(3, 12)]
  const label = (rows: any[]) => guestCardObjectiveLabel(outstandingFavoriteGuestCards(LEAD, rows, favorites))
  check("3 open", label(all), { title: "Send Guest Cards", detail: "3 properties" })
  // complete A (id 1)
  const after1 = [gc(1, 10, true), gc(2, 11), gc(3, 12)]
  check("after completing A → 2 properties", label(after1), { title: "Send Guest Cards", detail: "2 properties" })
  // complete A + B
  const after2 = [gc(1, 10, true), gc(2, 11, true), gc(3, 12)]
  check("after completing A+B → single 'Abacus West'", label(after2), { title: "Send Guest Card", detail: "Abacus West" })
  // complete all
  const after3 = [gc(1, 10, true), gc(2, 11, true), gc(3, 12, true)]
  check("after completing all → null (no objective)", label(after3), null)
}

console.log("\nisFavoriteGuestCardAction — aggregate gating predicate")
check("genuine-Favorite guest card → true", isFavoriteGuestCardAction(gc(1, 10), LEAD, favorites), true)
check("application-only property guest card → false", isFavoriteGuestCardAction(gc(1, 99), LEAD, favorites), false)
check("non-Favorite property guest card → false", isFavoriteGuestCardAction(gc(1, 500), LEAD, favorites), false)
check("check_application → false (not a guest card)", isFavoriteGuestCardAction({ action_key: "check_application", property_id: 10, lead_id: LEAD }, LEAD, favorites), false)

console.log("\nCompanion (buildActiveClientPayload) aggregate primary — CRM/Companion parity")
{
  const overdue = new Date(Date.now() - 2 * 86400000).toISOString()
  const nameOf: Record<number, string> = { 10: "Atlantica at Alamo", 11: "Verandas at Alamo Ranch", 12: "Abacus West", 99: "Applied Only" }
  const gcd = (id: number, propertyId: number) => ({ ...gc(id, propertyId), due_at: overdue, priority: "high", property_name: nameOf[propertyId] })
  const lead = { id: LEAD, crm_status: "ready_to_tour", created_at: overdue, first_name: "Test", follow_up_count: 0, next_action_date: null }
  const p3 = buildActiveClientPayload(lead, [gcd(1, 10), gcd(2, 11), gcd(3, 12)], null, null, "UTC", favorites)
  check("3 outstanding → primary 'Send Guest Cards'", p3.nextActions[0]?.title, "Send Guest Cards")
  check("3 outstanding → detail '3 properties'", p3.nextActions[0]?.propertyName, "3 properties")
  const p1 = buildActiveClientPayload(lead, [gcd(1, 10)], null, null, "UTC", favorites)
  check("1 outstanding → single guest card (not aggregated)", p1.nextActions[0]?.title, "Email Guest Card")
  check("1 outstanding → carries the property name", p1.nextActions[0]?.propertyName, "Atlantica at Alamo")
  // application-only property must NOT be aggregated
  const pApp = buildActiveClientPayload(lead, [gcd(1, 10), gcd(2, 99)], null, null, "UTC", favorites)
  check("application-only property excluded → single genuine favorite, not 'Send Guest Cards'", pApp.nextActions[0]?.title, "Email Guest Card")
}

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
