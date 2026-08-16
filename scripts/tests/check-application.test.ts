/**
 * Check Application — application-status outcomes for the Top Pick. Pure
 * simulation, no DB:
 *   npx tsx scripts/tests/check-application.test.ts
 *
 * completeApplicationOutcome touches the browser Supabase client, so (like
 * tour-follow-up / setup-tour) the DB writes are SIMULATED against the pure plan
 * (planForApplicationOutcome) + the exact reconciliation the handler applies. The
 * invariants that matter are asserted: durable application_status, the canonical
 * next action per outcome (Confirm Lease / re-dated Check / Schedule Tour / note),
 * Top Pick preserved vs cleared, property-scoping to the Top Pick, NO fabricated
 * Closed state, no duplicate open Check Application, and Companion "Action · Property".
 */
import { planForApplicationOutcome } from "@/lib/leads/applicationOutcome"
import { favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { APPLICATION_OUTCOMES, type ApplicationStatus } from "@bc/companion-shared"
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
const LEAD = "L-ca"

// ── Labels ──
ok(formatWorkflowActionLabel("check_application") === "Check Application", "check_application → 'Check Application'")
ok(formatWorkflowActionLabel("Check App") === "Check Application", "legacy title 'Check App' → 'Check Application'")
ok(formatWorkflowActionLabel("confirm_lease") === "Confirm Lease", "confirm_lease → 'Confirm Lease'")
ok(formatLastActionLabel("Confirm Lease") === "Lease Signed", "completed Confirm Lease → 'Lease Signed'")
ok(formatLastActionLabel("Check Application") === "Checked Application", "completed Check Application → 'Checked Application'")

// ── planForApplicationOutcome (exhaustive) ──
const expectPlan: Record<ApplicationStatus, any> = {
  approved: { applicationStatus: "approved", topPick: "keep", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: true, reopenSetupTour: false, createFollowUpTask: false, needsFollowUpDate: false, needsNote: false },
  pending: { applicationStatus: "pending", topPick: "keep", completeCheckApplication: false, recheckCheckApplication: true, createConfirmLease: false, reopenSetupTour: false, createFollowUpTask: false, needsFollowUpDate: true, needsNote: false },
  canceled: { applicationStatus: "canceled", topPick: "clear", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: false, reopenSetupTour: true, createFollowUpTask: false, needsFollowUpDate: false, needsNote: false },
  denied: { applicationStatus: "denied", topPick: "clear", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: false, reopenSetupTour: true, createFollowUpTask: false, needsFollowUpDate: false, needsNote: false },
  other: { applicationStatus: "other", topPick: "keep", completeCheckApplication: true, recheckCheckApplication: false, createConfirmLease: false, reopenSetupTour: false, createFollowUpTask: true, needsFollowUpDate: true, needsNote: true },
}
for (const s of Object.keys(expectPlan) as ApplicationStatus[]) {
  ok(JSON.stringify(planForApplicationOutcome(s)) === JSON.stringify(expectPlan[s]), `plan(${s}) exact`, JSON.stringify(planForApplicationOutcome(s)))
}
ok(JSON.stringify([...APPLICATION_OUTCOMES]) === JSON.stringify(["approved", "pending", "canceled", "denied", "other"]), "modal order = Approved / Still Pending / Canceled / Denied / Other")

// ── Simulated reconciliation (mirrors completeApplicationOutcome) ──
type SimState = { lead: any; actions: any[] }
function checkRow(propertyId: number, completed = false): any {
  return { id: "check-1", lead_id: LEAD, title: "Check App", action_key: "check_application", property_id: propertyId, property_name: "The Foundry", completed, completed_at: completed ? iso(0) : null, due_at: iso(3 * 24 * HOUR), priority: "medium", status: completed ? "completed" : "open" }
}
function baseState(): SimState {
  return {
    lead: { id: LEAD, crm_status: "applied", top_pick_favorite_id: FOUNDRY, application_status: null },
    actions: [
      { id: "setup", lead_id: LEAD, title: "Setup Tour", action_key: "setup_tour", completed: true, status: "completed", completed_at: iso(-8 * HOUR) },
      checkRow(FOUNDRY),
    ],
  }
}
function simulate(state: SimState, status: ApplicationStatus, opts: { followUpDueAt?: string; note?: string } = {}): SimState {
  const plan = planForApplicationOutcome(status)
  const check = state.actions.find((a) => a.action_key === "check_application")
  const propId = check?.property_id ?? null
  let topPick = state.lead.top_pick_favorite_id ?? null
  if (plan.topPick === "clear") topPick = null
  let actions = state.actions.map((a) => {
    if (a.action_key === "check_application") {
      if (plan.completeCheckApplication) return { ...a, completed: true, status: "completed", completed_at: iso(0) }
      if (plan.recheckCheckApplication && opts.followUpDueAt) return { ...a, due_at: opts.followUpDueAt }
    }
    if (plan.reopenSetupTour && a.id === "setup") return { ...a, completed: false, status: "open", completed_at: null }
    return a
  })
  if (plan.createConfirmLease) actions = [...actions, { id: "cl-x", lead_id: LEAD, title: "Confirm Lease", action_key: "confirm_lease", property_id: propId, property_name: "The Foundry", completed: false, status: "open", due_at: iso(0) }]
  else if (plan.createFollowUpTask) actions = [...actions, { id: "fu-x", lead_id: LEAD, title: "Follow Up", action_key: null, action_type: "manual", notes: opts.note ?? null, completed: false, status: "open", due_at: opts.followUpDueAt ?? iso(24 * HOUR) }]
  // crm_status is NEVER touched here (no fabricated Closed; stays Applied).
  return { lead: { ...state.lead, top_pick_favorite_id: topPick, application_status: plan.applicationStatus }, actions }
}
const openChecks = (s: SimState) => s.actions.filter((a) => a.action_key === "check_application" && !a.completed).length

// Approved — check completed, Top Pick kept, Confirm Lease produced, NOT Closed.
{
  const s = simulate(baseState(), "approved")
  ok(s.lead.application_status === "approved", "Approved → application_status = approved")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Approved preserves the Top Pick")
  ok(!!s.actions.find((a) => a.action_key === "confirm_lease" && a.property_id === FOUNDRY), "Approved creates Confirm Lease for the Top Pick property")
  ok(s.actions.find((a) => a.action_key === "check_application").completed === true, "Approved completes Check Application")
  ok(s.lead.crm_status === "applied" && s.lead.crm_status !== "closed", "Approved does NOT fabricate a Closed state")
}

// Still Pending — same Top Pick, re-dated Check (no duplicate), lead stays Applied.
{
  const due = iso(2 * 24 * HOUR)
  const s = simulate(baseState(), "pending", { followUpDueAt: due })
  ok(s.lead.application_status === "pending", "Pending → application_status = pending")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Pending preserves the Top Pick")
  ok(s.lead.crm_status === "applied", "Pending keeps the lead Applied")
  ok(openChecks(s) === 1, "Pending leaves exactly ONE open Check Application (no duplicate)")
  ok(s.actions.find((a) => a.action_key === "check_application").due_at === due, "Pending re-dates the SAME Check Application")
  ok(!s.actions.find((a) => a.action_key === "confirm_lease"), "Pending creates no Confirm Lease")
}

// Denied — Top Pick cleared, history preserved, Schedule Tour reopened, NOT Closed.
{
  const s = simulate(baseState(), "denied")
  ok(s.lead.application_status === "denied", "Denied → application_status = denied")
  ok(s.lead.top_pick_favorite_id === null, "Denied clears the live Top Pick")
  const completedCheck = s.actions.find((a) => a.action_key === "check_application")
  ok(completedCheck.completed === true && String(completedCheck.property_id) === String(FOUNDRY), "Denied preserves the application/property history (completed check keeps property_id)")
  ok(s.actions.find((a) => a.id === "setup").completed === false, "Denied reopens Schedule Tour")
  ok(s.lead.crm_status === "applied" && s.lead.crm_status !== "closed", "Denied does NOT destroy history into a Closed state")
}

// Canceled — DISTINCT from Denied: Top Pick cleared, history preserved, Schedule
// Tour reopened, lead stays Applied (NOT Closed), nothing deleted.
{
  const s = simulate(baseState(), "canceled")
  ok(s.lead.application_status === "canceled", "Canceled → application_status = canceled (distinct from denied)")
  ok(s.lead.top_pick_favorite_id === null, "Canceled clears the live Top Pick")
  const completedCheck = s.actions.find((a) => a.action_key === "check_application")
  ok(completedCheck.completed === true && String(completedCheck.property_id) === String(FOUNDRY), "Canceled preserves the application/property history")
  ok(s.actions.find((a) => a.id === "setup").completed === false, "Canceled reopens Schedule Tour")
  ok(s.lead.crm_status === "applied" && s.lead.crm_status !== "closed", "Canceled does NOT mark Closed")
  ok(!s.actions.find((a) => a.action_key === "confirm_lease"), "Canceled creates no Confirm Lease")
}

// Other — note + dated Follow Up, lead stays Applied, Top Pick preserved.
{
  const due = iso(24 * HOUR)
  const s = simulate(baseState(), "other", { followUpDueAt: due, note: "Waiting on a co-signer" })
  ok(s.lead.application_status === "other", "Other → application_status = other")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Other preserves the Top Pick")
  ok(s.lead.crm_status === "applied", "Other keeps the lead Applied")
  const fu = s.actions.filter((a) => a.title === "Follow Up" && a.action_key === null)
  ok(fu.length === 1 && fu[0].due_at === due && fu[0].notes === "Waiting on a co-signer", "Other creates ONE dated manual Follow Up carrying the note")
  ok(s.actions.find((a) => a.action_key === "check_application").completed === true, "Other completes the Check Application")
}

// ── Favorite surfaced state (furthest canonical state, property-scoped) ──
{
  const A = (applicationStatus: ApplicationStatus, isTopPick: boolean) =>
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick, appliedStage: true, outcome: "ready_to_apply", applicationStatus, isApplicationProperty: true })
  ok(A("approved", true) === "Toured · Approved", "Approved → '★ Top Pick · Toured · Approved'")
  ok(A("pending", true) === "Toured · Application Pending", "Pending → '★ Top Pick · Toured · Application Pending'")
  ok(A("canceled", false) === "Toured · Application Canceled", "Canceled → 'Toured · Application Canceled' (no ★, Top Pick cleared)")
  ok(A("denied", false) === "Toured · Application Denied", "Denied → 'Toured · Application Denied' (no ★, Top Pick cleared)")
  ok(A("other", true) === "Toured · Applied", "Other → keeps 'Toured · Applied' display")
  // Applied but no outcome yet → "Toured · Applied".
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", applicationStatus: null, isApplicationProperty: true }) === "Toured · Applied",
    "Applied, pre-outcome → 'Toured · Applied'",
  )
  // A NON-application Favorite never surfaces the lead's application status.
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: true, outcome: "still_deciding", applicationStatus: "approved", isApplicationProperty: false }) === "Toured · Still Deciding",
    "other Favorite keeps its own outcome even while the lead's application is Approved (property-scoped)",
  )
  // start_application still open takes precedence (pre-submission).
  ok(
    favoriteTourStateLabel({ applyActionOpen: true, isTopPick: true, appliedStage: false, outcome: "ready_to_apply", applicationStatus: null, isApplicationProperty: true }) === "Toured · Ready to Apply",
    "pre-submission stays 'Ready to Apply'",
  )
}

// ── Companion — "Approved · Property" / "Denied · Property" Last Action ──
{
  const completedCheck = { id: "check-1", lead_id: LEAD, title: "Check App", action_key: "check_application", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: iso(-1 * HOUR), status: "completed", due_at: iso(-3 * 24 * HOUR) }
  // Approved → open Confirm Lease + completed check.
  const confirmLease = { id: "cl-x", lead_id: LEAD, title: "Confirm Lease", action_key: "confirm_lease", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: iso(0) }
  const approvedLead: any = { id: LEAD, crm_status: "applied", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, application_status: "approved" }
  const pa = buildActiveClientPayload(approvedLead, [completedCheck, confirmLease], null, null, "America/Chicago", [], [])
  ok(pa.lead.lastAction?.title === "Application Approved", "Approved → Last Action 'Application Approved'")
  ok(pa.lead.lastAction?.propertyName === "The Foundry", "Approved Last Action carries the Top Pick property")
  ok((pa.nextActions[0]?.title ?? "") === "Confirm Lease", "Approved → Next Action = Confirm Lease")
  ok(String(pa.lead.applicationStatus) === "approved", "applicationStatus flows into the DTO")

  // Denied → open reopened Setup Tour + completed check, Top Pick cleared.
  const setupTour = { id: "setup", lead_id: LEAD, title: "Setup Tour", action_key: "setup_tour", completed: false, status: "open", due_at: iso(0) }
  const deniedLead: any = { id: LEAD, crm_status: "applied", first_name: "Carlos", top_pick_favorite_id: null, application_status: "denied" }
  const pd = buildActiveClientPayload(deniedLead, [completedCheck, setupTour], null, null, "America/Chicago", [], [])
  ok(pd.lead.lastAction?.title === "Application Denied", "Denied → Last Action 'Application Denied'")
  ok(pd.lead.lastAction?.propertyName === "The Foundry", "Denied Last Action carries the (historical) property")
  ok((pd.nextActions[0]?.title ?? "") === "Setup Tour", "Denied → Next Action = Schedule Tour (reopened setup_tour)")

  // Canceled → same shape as Denied, distinct contextual label.
  const canceledLead: any = { id: LEAD, crm_status: "applied", first_name: "Carlos", top_pick_favorite_id: null, application_status: "canceled" }
  const pc = buildActiveClientPayload(canceledLead, [completedCheck, setupTour], null, null, "America/Chicago", [], [])
  ok(pc.lead.lastAction?.title === "Application Canceled", "Canceled → Last Action 'Application Canceled'")
  ok((pc.nextActions[0]?.title ?? "") === "Setup Tour", "Canceled → Next Action = Schedule Tour (reopened setup_tour)")
}

// ── Companion — Pending surfaces the contextual label; check stays the next action ──
{
  const openCheck = { id: "check-1", lead_id: LEAD, title: "Check App", action_key: "check_application", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: iso(2 * 24 * HOUR) }
  const pendingLead: any = { id: LEAD, crm_status: "applied", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, application_status: "pending" }
  const pp = buildActiveClientPayload(pendingLead, [openCheck], null, null, "America/Chicago", [], [])
  ok(pp.lead.lastAction?.title === "Application Still Pending", "Pending → Last Action 'Application Still Pending'")
  ok(pp.lead.lastAction?.propertyName === "The Foundry", "Pending Last Action carries the property")
  ok(pp.lead.lastAction?.completedAt == null, "Pending Last Action has no completion timestamp (check stays open)")
  ok((pp.nextActions[0]?.title ?? "") === "Check App", "Pending → Next Action stays Check Application")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
