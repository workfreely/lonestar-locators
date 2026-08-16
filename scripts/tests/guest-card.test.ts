/**
 * Schedule Tour → Send Guest Card → Tour Follow-Up (Phase 1). Runnable, no DB:
 *   npx tsx scripts/tests/guest-card.test.ts
 *
 * createGuestCardForProperty / completeSetupTour touch the browser Supabase
 * client, so (like setup-tour) the DB writes are SIMULATED and the reconciliation
 * that matters is asserted against the pure ranking + labels + Companion payload:
 * a per-property Send Guest Card is the primary Next Action after a tour is
 * scheduled and GATES Tour Follow-Up (even when the follow-up is overdue) until
 * every scheduled property's card is sent.
 */
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { formatWorkflowActionLabel, formatLastActionLabel } from "@/lib/leads/workflowActionLabels"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const HOUR = 3600 * 1000
const now = Date.now()
const iso = (ms: number) => new Date(now + ms).toISOString()

function row(leadId: string, title: string, key: string, completed: boolean, dueMs: number, propertyId?: number, propertyName?: string): any {
  return {
    id: Math.random(),
    lead_id: leadId,
    title,
    action_key: key,
    completed,
    completed_at: completed ? iso(0) : null,
    due_at: iso(dueMs),
    priority: key === "email_guest_card" ? "high" : "medium",
    notes: null,
    property_id: propertyId ?? null,
    property_name: propertyName ?? null,
    created_at: iso(-2 * HOUR),
    status: completed ? "completed" : "open",
  }
}

// ── Labels ──
ok(formatWorkflowActionLabel("email_guest_card") === "Send Guest Card", "action_key email_guest_card → 'Send Guest Card'")
ok(formatWorkflowActionLabel("Email Guest Card") === "Send Guest Card", "legacy title 'Email Guest Card' → 'Send Guest Card'")
ok(formatLastActionLabel("Email Guest Card") === "Guest Card Sent", "Last Action → 'Guest Card Sent'")

const L = "L-gc"
const scheduled = { id: L, crm_status: "ready_to_tour", next_action_date: iso(2 * HOUR) }
const completedSetup = row(L, "Setup Tour", "setup_tour", true, 0)

// 1) After Tour Scheduled: Send Guest Card is the primary Next Action; the
//    (future) Tour Follow-Up is gated (not primary, not even surfaced).
{
  const gc = row(L, "Email Guest Card", "email_guest_card", false, 0, 8001, "The Foundry")
  const fu = row(L, "Tour Follow-Up", "tour_follow_up", false, 2 * HOUR)
  const r = rankLeadActions(scheduled, [completedSetup, gc, fu], getNextAction(scheduled))
  ok(r.primary.title === "Email Guest Card", "primary Next Action = Send Guest Card (not Tour Follow-Up)")
  ok(![r.primary, ...r.others].some((a) => a.title === "Tour Follow-Up"), "Tour Follow-Up gated while a guest card is open")
}

// 2) Send Guest Card is primary because it is DUE NOW + the guard — even when the
//    Tour Follow-Up is already OVERDUE (tour time passed).
{
  const gc = row(L, "Email Guest Card", "email_guest_card", false, 0, 8001, "The Foundry")
  const fuOverdue = row(L, "Tour Follow-Up", "tour_follow_up", false, -3 * HOUR) // overdue
  const r = rankLeadActions(scheduled, [completedSetup, gc, fuOverdue], getNextAction(scheduled))
  ok(r.primary.title === "Email Guest Card", "guest card still primary even vs an OVERDUE follow-up (guard, not just due)")
}

// 3) Once the guest card is SENT (completed) → Tour Follow-Up becomes primary.
{
  const gcDone = row(L, "Email Guest Card", "email_guest_card", true, 0, 8001, "The Foundry")
  const fu = row(L, "Tour Follow-Up", "tour_follow_up", false, 2 * HOUR)
  const r = rankLeadActions(scheduled, [completedSetup, gcDone, fu], getNextAction(scheduled))
  ok(r.primary.title === "Tour Follow-Up", "after Guest Card Sent → Tour Follow-Up surfaces as primary")
}

// 4) MULTIPLE scheduled properties → one guest card per property; Tour Follow-Up
//    stays gated until EVERY card is sent.
{
  const gc1 = row(L, "Email Guest Card", "email_guest_card", false, 0, 8001, "The Foundry")
  const gc2open = row(L, "Email Guest Card", "email_guest_card", false, 0, 8002, "Skyline Lofts")
  const fu = row(L, "Tour Follow-Up", "tour_follow_up", false, 4 * HOUR)
  // Both open → a guest card primary; follow-up gated.
  let r = rankLeadActions(scheduled, [completedSetup, gc1, gc2open, fu], getNextAction(scheduled))
  ok(r.primary.title === "Email Guest Card" && !r.others.some((a) => a.title === "Tour Follow-Up"), "2 open guest cards → still a guest card primary; follow-up gated")
  // One sent, one still open → follow-up STILL gated.
  const gc1done = { ...gc1, completed: true, completed_at: iso(0), status: "completed" }
  r = rankLeadActions(scheduled, [completedSetup, gc1done, gc2open, fu], getNextAction(scheduled))
  ok(r.primary.title === "Email Guest Card", "1 of 2 sent → the remaining guest card is primary (follow-up still gated)")
  // Both sent → follow-up surfaces.
  const gc2done = { ...gc2open, completed: true, completed_at: iso(0), status: "completed" }
  r = rankLeadActions(scheduled, [completedSetup, gc1done, gc2done, fu], getNextAction(scheduled))
  ok(r.primary.title === "Tour Follow-Up", "all guest cards sent → Tour Follow-Up becomes primary")
}

// 5) Companion payload surfaces the Send Guest Card first (with its property name),
//    and the gated Tour Follow-Up is not the shown action.
{
  const gc = row(L, "Email Guest Card", "email_guest_card", false, 0, 8001, "The Foundry")
  const fu = row(L, "Tour Follow-Up", "tour_follow_up", false, 2 * HOUR)
  const leadRow: any = { id: L, crm_status: "ready_to_tour", first_name: "Carlos", next_action_date: iso(2 * HOUR) }
  const payload = buildActiveClientPayload(leadRow, [completedSetup, gc, fu], null, null, "America/Chicago")
  ok(payload.nextActions[0]?.title === "Email Guest Card", "Companion shows Send Guest Card as the Next Action", JSON.stringify(payload.nextActions.map((a) => a.title)))
  ok(payload.nextActions[0]?.propertyName === "The Foundry", "Companion guest-card action carries the property name")
}

// 6) Guest card is per-property scoped (another lead's / another property's card
//    does not gate this lead's follow-up).
{
  const otherLeadGc = row("OTHER", "Email Guest Card", "email_guest_card", false, 0, 9999, "Not this lead")
  const fu = row(L, "Tour Follow-Up", "tour_follow_up", false, 2 * HOUR)
  const r = rankLeadActions(scheduled, [completedSetup, otherLeadGc, fu], getNextAction(scheduled))
  ok(r.primary.title === "Tour Follow-Up", "another lead's guest card does NOT gate this lead's Tour Follow-Up")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
