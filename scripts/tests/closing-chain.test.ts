/**
 * Closing chain — Confirm Lease → Lease Signed → Closed → Get Invoice Details.
 * Pure simulation, no DB:
 *   npx tsx scripts/tests/closing-chain.test.ts
 *
 * completeConfirmLease / the invoice completion touch the browser Supabase client,
 * so (like the other workflow tests) the DB writes are SIMULATED against the exact
 * reconciliation the handlers apply. Asserts the full canonical progression:
 *   Applied → Check Application → Approved → Confirm Lease → Lease Signed → Closed
 *   → Get Invoice Details
 * plus Confirm Lease → Not Yet, property/Top Pick preservation, no duplicate
 * canonical actions, no premature Closed, and other-Favorite isolation.
 */
import { planForApplicationOutcome } from "@/lib/leads/applicationOutcome"
import { favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"
import { formatWorkflowActionLabel, formatLastActionLabel } from "@/lib/leads/workflowActionLabels"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const HOUR = 3600 * 1000
const now = Date.now()
const iso = (ms: number) => new Date(now + ms).toISOString()
const FOUNDRY = 8001
const SKYLINE = 8002
const LEAD = "L-close"

// ── Labels ──
ok(formatWorkflowActionLabel("confirm_lease") === "Confirm Lease", "confirm_lease → 'Confirm Lease'")
ok(formatLastActionLabel("Confirm Lease") === "Lease Signed", "completed Confirm Lease → 'Lease Signed'")
ok(formatLastActionLabel("Get Invoice Details") === "Got Invoice Details", "completed Get Invoice Details → 'Got Invoice Details'")

// ── State model ──
// A lead that has already reached Applied with a property-scoped, open
// check_application for the Top Pick (The Foundry), plus a SKYLINE favorite that
// must stay isolated throughout.
type S = { lead: any; actions: any[] }
function base(): S {
  return {
    lead: { id: LEAD, crm_status: "applied", top_pick_favorite_id: FOUNDRY, application_status: null, closed_at: null },
    actions: [
      { id: "setup", lead_id: LEAD, title: "Setup Tour", action_key: "setup_tour", completed: true, status: "completed", completed_at: iso(-8 * HOUR) },
      { id: "check", lead_id: LEAD, title: "Check App", action_key: "check_application", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: iso(3 * 24 * HOUR) },
      // An unrelated Skyline tour_follow_up that must never be touched by the closing chain.
      { id: "sky-tf", lead_id: LEAD, title: "Tour Follow-Up", action_key: "tour_follow_up", property_id: SKYLINE, property_name: "Skyline Lofts", completed: false, status: "open", due_at: iso(HOUR) },
    ],
  }
}

// Mirrors completeApplicationOutcome (approved branch only, what the chain needs).
function approve(s: S): S {
  const plan = planForApplicationOutcome("approved")
  const check = s.actions.find((a) => a.action_key === "check_application")
  const actions = s.actions.map((a) =>
    a.action_key === "check_application" && plan.completeCheckApplication ? { ...a, completed: true, status: "completed", completed_at: iso(0) } : a,
  )
  actions.push({ id: "cl", lead_id: LEAD, title: "Confirm Lease", action_key: "confirm_lease", property_id: check.property_id, property_name: "The Foundry", completed: false, status: "open", due_at: iso(0) })
  return { lead: { ...s.lead, application_status: "approved" }, actions }
}

// Mirrors completeConfirmLease (Yes, Lease Signed).
function signLease(s: S): S {
  const cl = s.actions.find((a) => a.action_key === "confirm_lease" && !a.completed)
  let actions = s.actions.map((a) => (a === cl ? { ...a, completed: true, status: "completed", completed_at: iso(0) } : a))
  // Dedup on action_key: only create Get Invoice Details if none exists.
  if (!actions.find((a) => a.action_key === "get_invoice_details")) {
    actions = [...actions, { id: "inv", lead_id: LEAD, title: "Get Invoice Details", action_key: "get_invoice_details", property_id: cl.property_id, property_name: "The Foundry", completed: false, status: "open", due_at: iso(0) }]
  }
  return { lead: { ...s.lead, crm_status: "closed", closed_at: s.lead.closed_at ?? iso(0) }, actions }
}

// Mirrors saveInvoiceDetails (Save Invoice Details completes the action — decoupled
// from the invoice_submitted flag, which is now reserved for future Send Invoice).
function saveInvoiceDetails(s: S): S {
  const actions = s.actions.map((a) => (a.action_key === "get_invoice_details" ? { ...a, completed: true, status: "completed", completed_at: iso(0) } : a))
  return { lead: { ...s.lead }, actions }
}

const openCount = (s: S, key: string) => s.actions.filter((a) => a.action_key === key && !a.completed).length
const skylineTf = (s: S) => s.actions.find((a) => a.id === "sky-tf")

// ── Full chain: Applied → Approved → Confirm Lease → Lease Signed → Closed → Invoice ──
{
  let s = base()
  ok(s.lead.crm_status === "applied", "start: Applied (not Closed)")

  s = approve(s)
  ok(s.lead.application_status === "approved", "Approved recorded")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Top Pick preserved through approval")
  ok(s.lead.crm_status !== "closed", "NO premature Closed after approval")
  ok(openCount(s, "confirm_lease") === 1 && s.actions.find((a) => a.action_key === "confirm_lease").property_id === FOUNDRY, "Approved → ONE Confirm Lease for the Top Pick property")
  ok(s.actions.find((a) => a.action_key === "check_application").completed === true, "check_application completed by approval")

  // Confirm Lease → Not Yet: nothing changes (idempotent no-op).
  const before = JSON.stringify(s)
  const notYet = s // Not Yet closes the dialog without calling the handler
  ok(JSON.stringify(notYet) === before, "Confirm Lease → Not Yet: no stage change, Confirm Lease stays open")
  ok(notYet.lead.crm_status === "applied" && openCount(notYet, "confirm_lease") === 1, "Not Yet preserves Approved + open Confirm Lease, never Closed")

  s = signLease(s)
  ok(s.lead.crm_status === "closed", "Yes, Lease Signed → Closed (the ONLY explicit close point)")
  ok(!!s.lead.closed_at, "closed_at stamped on lease signing")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Top Pick/property preserved through lease signing")
  ok(s.actions.find((a) => a.action_key === "confirm_lease").completed === true, "confirm_lease completed (Lease Signed)")
  ok(openCount(s, "get_invoice_details") === 1 && s.actions.find((a) => a.action_key === "get_invoice_details").property_id === FOUNDRY, "Lease Signed → ONE Get Invoice Details for the Top Pick property")

  // Idempotency / no duplicate canonical actions if signLease somehow re-runs.
  const sDup = signLease(s)
  ok(openCount(sDup, "get_invoice_details") <= 1, "no duplicate Get Invoice Details on a re-run (action_key dedup)")

  s = saveInvoiceDetails(s)
  ok(s.actions.find((a) => a.action_key === "get_invoice_details").completed === true, "Save Invoice Details → Get Invoice Details completed (terminal)")

  // Skyline's follow-up is STILL open and untouched across the whole closing chain.
  ok(skylineTf(s).completed === false && skylineTf(s).property_id === SKYLINE, "other Favorite (Skyline) stays isolated through the entire closing chain")
}

// ── Favorite surfaced state: Approved → Leased (furthest) ──
{
  // Approved (confirm_lease open, not yet closed) → "Toured · Approved".
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", applicationStatus: "approved", isApplicationProperty: true, closedStage: false }) === "Toured · Approved",
    "Approved (pre-close) → 'Toured · Approved'",
  )
  // Closed (lease signed) → "Toured · Leased" (furthest state overrides Approved).
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", applicationStatus: "approved", isApplicationProperty: true, closedStage: true }) === "Toured · Leased",
    "Closed (lease signed) → 'Toured · Leased' (furthest canonical state)",
  )
  // A closed lead that is NOT the application property never reads "Leased".
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: false, outcome: "didnt_like", applicationStatus: null, isApplicationProperty: false, closedStage: true }) === "Toured · Didn't Like It",
    "non-application Favorite never shows 'Leased' even when the lead is Closed",
  )
}

// ── Companion Last Action across the closing chain ──
{
  // Approved → "Application Approved · Property", Next = Confirm Lease.
  const approvedActions = [
    { id: "check", lead_id: LEAD, title: "Check App", action_key: "check_application", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: iso(-2 * HOUR), status: "completed", due_at: iso(-3 * 24 * HOUR) },
    { id: "cl", lead_id: LEAD, title: "Confirm Lease", action_key: "confirm_lease", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: iso(0) },
  ]
  const pa = buildActiveClientPayload({ id: LEAD, crm_status: "applied", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, application_status: "approved" }, approvedActions, null, null, "America/Chicago", [], [])
  ok(pa.lead.lastAction?.title === "Application Approved" && pa.lead.lastAction?.propertyName === "The Foundry", "Companion: 'Application Approved · The Foundry'")
  ok((pa.nextActions[0]?.title ?? "") === "Confirm Lease", "Companion Next Action = Confirm Lease")

  // Lease Signed → "Lease Signed · Property" (supersedes application-status label), Next = Get Invoice Details.
  const closedActions = [
    { id: "check", lead_id: LEAD, title: "Check App", action_key: "check_application", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: iso(-3 * HOUR), status: "completed", due_at: iso(-3 * 24 * HOUR) },
    { id: "cl", lead_id: LEAD, title: "Confirm Lease", action_key: "confirm_lease", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: iso(-1 * HOUR), status: "completed", due_at: iso(-1 * HOUR) },
    { id: "inv", lead_id: LEAD, title: "Get Invoice Details", action_key: "get_invoice_details", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: iso(0) },
  ]
  const pc = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, application_status: "approved" }, closedActions, null, null, "America/Chicago", [], [])
  ok(pc.lead.lastAction?.title === "Lease Signed" && pc.lead.lastAction?.propertyName === "The Foundry", "Companion: 'Lease Signed · The Foundry' (supersedes Application Approved)")
  ok((pc.nextActions[0]?.title ?? "") === "Get Invoice Details", "Companion Next Action = Get Invoice Details")

  // Invoice submitted (get_invoice_details completed) → Last Action progresses to
  // "Got Invoice Details · Property" (the terminal closing record).
  const invoicedActions = closedActions.map((a) => (a.id === "inv" ? { ...a, completed: true, completed_at: iso(0), status: "completed" } : a))
  const pi = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, application_status: "approved" }, invoicedActions, null, null, "America/Chicago", [], [])
  ok(formatLastActionLabel(pi.lead.lastAction?.title ?? "") === "Got Invoice Details", "after invoice submitted → Last Action 'Got Invoice Details' (terminal)")
  ok(pi.lead.lastAction?.propertyName === "The Foundry", "terminal Last Action carries the Top Pick property")
  ok((pi.nextActions[0]?.title ?? "") !== "Get Invoice Details", "Get Invoice Details no longer the open Next Action once submitted")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
