// Canonical Next Action ranking — workflow-relevance rule.
// "Given where this client is right now, what is the most important thing to do next?"
// Foreground (current objective/transaction/prereq) outranks background (stale earlier
// context), then urgency → priority → due decide within the relevant class.
// Run: npx tsx scripts/tests/actionRelevance.test.ts

import { rankLeadActions } from "../../lib/nextActions"
import { getNextAction } from "../../lib/nextAction"
import { actionRelevanceRank, RELEVANCE_FOREGROUND, RELEVANCE_BACKGROUND } from "../../lib/leads/actionRelevance"
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

const DAY = 86400000
const now = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const overdue = iso(now - 2 * DAY)
const today = iso(now)
const upcoming = iso(now + 3 * DAY)

let seq = 100
function act(o: {
  key: string; title: string; due: string; prop?: number; propName?: string;
  priority?: "low" | "medium" | "high"; completed?: boolean; type?: string;
}) {
  return {
    id: seq++, lead_id: 1, title: o.title, due_at: o.due, priority: o.priority ?? "high",
    completed: o.completed ?? false, completed_at: o.completed ? today : null, notes: null,
    created_at: iso(now - 10 * DAY), action_key: o.key, action_type: o.type ?? "workflow",
    status: o.completed ? "completed" : "open", property_id: o.prop ?? null, property_name: o.propName ?? null,
  }
}
const lead = (crm_status: string, extra: Record<string, unknown> = {}) =>
  ({ id: 1, crm_status, created_at: iso(now - 30 * DAY), first_name: "Stefan", follow_up_count: 0, next_action_date: null, ...extra })
const primaryTitle = (l: any, actions: any[]) => rankLeadActions(l, actions, getNextAction(l)).primary.title

console.log("\nrelevance tiers (map sanity)")
check("check_application is foreground at applied", actionRelevanceRank(lead("applied"), { action_key: "check_application" }), RELEVANCE_FOREGROUND)
check("email_guest_card is background at applied", actionRelevanceRank(lead("applied"), { action_key: "email_guest_card" }), RELEVANCE_BACKGROUND)
check("email_guest_card is foreground at ready_to_tour", actionRelevanceRank(lead("ready_to_tour"), { action_key: "email_guest_card" }), RELEVANCE_FOREGROUND)
check("manual task is always foreground (semantics preserved)", actionRelevanceRank(lead("applied"), { action_key: null, action_type: "manual" }), RELEVANCE_FOREGROUND)
check("automatic action is always foreground", actionRelevanceRank(lead("applied"), { isAutomatic: true }), RELEVANCE_FOREGROUND)

console.log("\n1) Applied + old overdue Guest Card (other property) → Check App wins")
check("Check App (Maddox, upcoming) beats overdue Send Guest Card (Oasis)", primaryTitle(lead("applied"), [
  act({ key: "check_application", title: "Check App", due: upcoming, prop: 16, propName: "Maddox Hills" }),
  act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak" }),
]), "Check App")

console.log("\n2) Applied + old overdue Tour Follow-Up (other property) → Check App wins")
check("Check App beats overdue Tour Follow-Up (other property)", primaryTitle(lead("applied"), [
  act({ key: "check_application", title: "Check App", due: upcoming, prop: 16, propName: "Maddox Hills" }),
  act({ key: "tour_follow_up", title: "Tour Follow-Up", due: overdue, prop: 99, propName: "Property C" }),
]), "Check App")

console.log("\n3) Approved → Confirm Lease wins; backup actions preserved")
{
  const l = lead("applied", { next_action_date: upcoming })
  const actions = [
    act({ key: "confirm_lease", title: "Confirm Lease", due: today, prop: 16, propName: "Maddox Hills" }),
    act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak" }),
    act({ key: "check_application", title: "Check App", due: overdue, prop: 16, propName: "Maddox Hills", completed: true }),
  ]
  const ranked = rankLeadActions(l, actions, getNextAction(l))
  check("Confirm Lease is primary", ranked.primary.title, "Confirm Lease")
  check("backup Guest Card preserved in others (not dropped)", ranked.others.some((o) => o.title === "Email Guest Card"), true)
}

console.log("\n4) Same-stage multiple property Guest Cards → overdue urgency decides")
{
  const l = lead("ready_to_tour")
  const p = rankLeadActions(l, [
    act({ key: "email_guest_card", title: "Email Guest Card", due: today, prop: 2, propName: "B" }),
    act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 1, propName: "A" }),
    act({ key: "email_guest_card", title: "Email Guest Card", due: upcoming, prop: 3, propName: "C" }),
  ], getNextAction(l)).primary
  check("overdue Guest Card (A) wins over today (B) and upcoming (C)", p.manualAction?.property_name, "A")
}

console.log("\n5) Same-property blocking prerequisite outranks the stage/tour action")
check("Ready to Tour: unsent Guest Card outranks Tour Follow-Up (existing gating)", primaryTitle(lead("ready_to_tour"), [
  act({ key: "email_guest_card", title: "Email Guest Card", due: today, prop: 16, propName: "Maddox Hills" }),
  act({ key: "tour_follow_up", title: "Tour Follow-Up", due: upcoming, prop: 16, propName: "Maddox Hills" }),
]), "Email Guest Card")

console.log("\n6) Workflow regression re-relevantizes a demoted action")
{
  const actions = [
    act({ key: "check_application", title: "Check App", due: upcoming, prop: 16, propName: "Maddox Hills" }),
    act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak" }),
  ]
  check("at applied → Check App primary (guest card demoted)", primaryTitle(lead("applied"), actions), "Check App")
  // Same rows, stage regressed to ready_to_tour → the guest card is foreground again.
  check("regressed to ready_to_tour → the guest card is primary again", primaryTitle(lead("ready_to_tour"), actions), "Email Guest Card")
}

console.log("\n6b) Applied + denied/canceled application → reopened touring action is foreground again")
{
  // Denial/cancel reopens setup_tour but keeps crm_status='applied' (only
  // application_status flips) — the objective has regressed to touring.
  const setup = act({ key: "setup_tour", title: "Setup Tour", due: today, priority: "high" })
  const doneCheck = act({ key: "check_application", title: "Check App", due: overdue, prop: 16, propName: "Maddox Hills", completed: true })
  check("applied+denied → Setup Tour is foreground (beats the stale automatic Check App)",
    primaryTitle(lead("applied", { application_status: "denied" }), [setup, doneCheck]), "Setup Tour")
  check("applied+canceled → same",
    primaryTitle(lead("applied", { application_status: "canceled" }), [setup, doneCheck]), "Setup Tour")
  check("applied+null (active application) → a reopened setup_tour would NOT outrank the app transaction",
    actionRelevanceRank(lead("applied", { application_status: null }), { action_key: "setup_tour" }), RELEVANCE_BACKGROUND)
}

console.log("\n7) Closed transaction outranks stale touring/searching actions")
check("Closed: Get Invoice Details beats overdue Send Guest Card (other property)", primaryTitle(lead("closed"), [
  act({ key: "get_invoice_details", title: "Get Invoice Details", due: today, prop: 16, propName: "Maddox Hills" }),
  act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak" }),
]), "Get Invoice Details")

console.log("\n8) Completed historical actions are never surfaced nor mutated")
{
  const completedRow = act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak", completed: true })
  const snapshot = JSON.stringify(completedRow)
  const actions = [act({ key: "check_application", title: "Check App", due: upcoming, prop: 16, propName: "Maddox Hills" }), completedRow]
  check("completed action is not the primary", primaryTitle(lead("applied"), actions), "Check App")
  check("completed action row is not mutated by ranking", JSON.stringify(completedRow), snapshot)
}

console.log("\n9) CRM ranker and Companion resolve the SAME primary for equivalent data")
{
  const l = lead("applied")
  const actions = [
    act({ key: "check_application", title: "Check App", due: upcoming, prop: 16, propName: "Maddox Hills" }),
    act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak" }),
  ]
  const crmPrimary = rankLeadActions(l, actions, getNextAction(l)).primary.title
  const companion = buildActiveClientPayload(l, actions)
  check("CRM primary === Companion actions[0].title", companion.nextActions[0]?.title, crmPrimary)
  check("both resolve to Check App", crmPrimary, "Check App")
}

console.log("\n10) Property-scoped Companion Next Action carries the property name")
{
  const l = lead("applied")
  const companion = buildActiveClientPayload(l, [
    act({ key: "check_application", title: "Check App", due: upcoming, prop: 16, propName: "Maddox Hills" }),
    act({ key: "email_guest_card", title: "Email Guest Card", due: overdue, prop: 15, propName: "Oasis Stone Oak" }),
  ])
  check("Companion primary is Check App with propertyName 'Maddox Hills'", { title: companion.nextActions[0]?.title, propertyName: companion.nextActions[0]?.propertyName }, { title: "Check App", propertyName: "Maddox Hills" })
}

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
