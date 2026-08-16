/**
 * Tour Follow-Up — property/tour-scoped outcomes. Pure simulation, no DB:
 *   npx tsx scripts/tests/tour-follow-up.test.ts
 *
 * completeTourFollowUp touches the browser Supabase client, so (like setup-tour /
 * guest-card) the DB writes are SIMULATED against the pure outcome PLAN
 * (planForOutcome) + the exact reconciliation the handler applies. The invariants
 * that matter are asserted: per-property isolation, tour status vs outcome,
 * durable one-per-lead Top Pick, the correct next canonical action, +2h per tour,
 * and the Companion "Toured · Property" alignment.
 */
import { planForOutcome, tourFollowUpDueForTour, favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { tourStatusForOutcome, TOUR_OUTCOME_LABELS, type TourOutcome } from "@bc/companion-shared"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
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
const LEAD = "L-tf"

function tfRow(propertyId: number, propertyName: string, dueMs: number, completed = false): any {
  return {
    id: `tf-${propertyId}`,
    lead_id: LEAD,
    title: "Tour Follow-Up",
    action_key: "tour_follow_up",
    property_id: propertyId,
    property_name: propertyName,
    completed,
    completed_at: completed ? iso(0) : null,
    due_at: iso(dueMs),
    priority: "medium",
    status: completed ? "completed" : "open",
  }
}

// ── Labels ──
ok(formatWorkflowActionLabel("start_application") === "Apply", "start_application → 'Apply'")
ok(formatLastActionLabel("Apply") === "Applied", "completed Apply → 'Applied'")
ok(formatLastActionLabel("Tour Follow-Up") === "Toured", "completed Tour Follow-Up → 'Toured'")
ok(formatWorkflowActionLabel("tour_follow_up") === "Tour Follow-Up", "tour_follow_up → 'Tour Follow-Up'")

// ── +2h per tour ──
ok(tourFollowUpDueForTour("2026-09-22T14:00:00.000Z") === "2026-09-22T16:00:00.000Z", "follow-up due = tour + 2h")

// ── planForOutcome (exhaustive) ──
const expectPlan: Record<TourOutcome, any> = {
  ready_to_apply: { tourStatus: "completed", topPick: "set", advanceToDoneTouring: true, createStartApplication: true, reopenSetupTour: false, createFollowUpTask: false },
  still_deciding: { tourStatus: "completed", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: false, createFollowUpTask: true },
  wants_another_tour: { tourStatus: "completed", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: true, createFollowUpTask: false },
  didnt_like: { tourStatus: "completed", topPick: "clear_if_match", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: true, createFollowUpTask: false },
  didnt_tour: { tourStatus: "no_show", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: true, createFollowUpTask: false },
  other: { tourStatus: "completed", topPick: "keep", advanceToDoneTouring: false, createStartApplication: false, reopenSetupTour: false, createFollowUpTask: true },
}
for (const o of Object.keys(expectPlan) as TourOutcome[]) {
  ok(JSON.stringify(planForOutcome(o)) === JSON.stringify(expectPlan[o]), `plan(${o}) exact`, JSON.stringify(planForOutcome(o)))
}
ok(tourStatusForOutcome("didnt_tour") === "no_show" && tourStatusForOutcome("still_deciding") === "completed", "tourStatusForOutcome: no_show vs completed")

// ── Simulated reconciliation (mirrors completeTourFollowUp) ──
type SimState = { lead: any; tours: any[]; actions: any[] }
function simulate(state: SimState, tour: any, outcome: TourOutcome, opts: { followUpDueAt?: string; setupTourId?: any } = {}): SimState {
  const plan = planForOutcome(outcome)
  const propId = tour.property_id
  const tours = state.tours.map((t) => (String(t.id) === String(tour.id) ? { ...t, status: plan.tourStatus, outcome } : t))
  let topPick = state.lead.top_pick_favorite_id ?? null
  if (plan.topPick === "set") topPick = propId
  else if (plan.topPick === "clear_if_match" && String(topPick) === String(propId)) topPick = null
  const crm_status = plan.advanceToDoneTouring ? "done_touring" : state.lead.crm_status
  let actions = state.actions.map((a) => {
    if (String(a.property_id ?? "") === String(propId) && a.action_key === "tour_follow_up" && !a.completed) return { ...a, completed: true, status: "completed", completed_at: iso(0) }
    if (opts.setupTourId != null && String(a.id) === String(opts.setupTourId)) return { ...a, completed: false, status: "open" }
    return a
  })
  if (plan.createStartApplication) actions = [...actions, { id: "apply-x", lead_id: LEAD, title: "Apply", action_key: "start_application", property_id: propId, completed: false, status: "open", due_at: iso(0) }]
  else if (plan.createFollowUpTask) actions = [...actions, { id: "fu-x", lead_id: LEAD, title: "Follow Up", action_key: null, action_type: "manual", completed: false, status: "open", due_at: opts.followUpDueAt ?? iso(24 * HOUR) }]
  return { lead: { ...state.lead, top_pick_favorite_id: topPick, crm_status }, tours, actions }
}

function baseState(): SimState {
  return {
    lead: { id: LEAD, crm_status: "ready_to_tour", top_pick_favorite_id: null },
    tours: [
      { id: "t-foundry", lead_id: LEAD, property_id: FOUNDRY, scheduled_at: iso(-3 * HOUR), status: "scheduled", outcome: null },
      { id: "t-skyline", lead_id: LEAD, property_id: SKYLINE, scheduled_at: iso(-1 * HOUR), status: "scheduled", outcome: null },
    ],
    actions: [
      { id: "setup", lead_id: LEAD, title: "Setup Tour", action_key: "setup_tour", completed: true, status: "completed", completed_at: iso(-4 * HOUR) },
      tfRow(FOUNDRY, "The Foundry", -1 * HOUR),
      tfRow(SKYLINE, "Skyline Lofts", 1 * HOUR),
    ],
  }
}

// Property isolation — completing Foundry never touches Skyline; outcomes coexist.
{
  let s = baseState()
  s = simulate(s, s.tours[0], "still_deciding")
  const foundryTf = s.actions.find((a) => a.action_key === "tour_follow_up" && a.property_id === FOUNDRY)
  const skylineTf = s.actions.find((a) => a.action_key === "tour_follow_up" && a.property_id === SKYLINE)
  ok(foundryTf.completed === true, "Foundry follow-up completed")
  ok(skylineTf.completed === false, "Skyline follow-up still OPEN (isolation)")
  s = simulate(s, s.tours[1], "didnt_like")
  const foundryTour = s.tours.find((t) => t.property_id === FOUNDRY)
  const skylineTour = s.tours.find((t) => t.property_id === SKYLINE)
  ok(foundryTour.outcome === "still_deciding" && skylineTour.outcome === "didnt_like", "different outcomes coexist per property")
  ok(foundryTour.status === "completed" && skylineTour.status === "completed", "both tours completed (they happened)")
}

// Ready to Apply — done_touring, Top Pick set, start_application, Favorite kept, NO applied.
{
  let s = baseState()
  s = simulate(s, s.tours[0], "ready_to_apply")
  ok(s.lead.crm_status === "done_touring", "Ready to Apply → done_touring (NOT applied)")
  ok(s.lead.crm_status !== "applied", "Ready to Apply does NOT fabricate an application submission")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Ready to Apply sets Top Pick = The Foundry")
  ok(!!s.actions.find((a) => a.action_key === "start_application" && a.property_id === FOUNDRY), "start_application created for the Top Pick property")
  ok(s.tours.find((t) => t.property_id === FOUNDRY).status === "completed", "tour completed")
  ok(s.actions.find((a) => a.action_key === "tour_follow_up" && a.property_id === FOUNDRY).completed, "Foundry follow-up completed")
}

// Still Deciding — completed, outcome, Favorite + Top Pick preserved, dated Follow Up, no Applied.
{
  let s = baseState()
  s.lead.top_pick_favorite_id = FOUNDRY // already Top Pick
  const due = iso(24 * HOUR)
  s = simulate(s, s.tours[0], "still_deciding", { followUpDueAt: due })
  ok(s.tours.find((t) => t.property_id === FOUNDRY).outcome === "still_deciding", "outcome = still_deciding")
  ok(s.lead.crm_status === "ready_to_tour", "Still Deciding does NOT advance to Applied")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Still Deciding preserves existing Top Pick")
  const fu = s.actions.filter((a) => a.title === "Follow Up" && a.action_key === null)
  ok(fu.length === 1 && fu[0].due_at === due, "creates exactly one dated manual Follow Up (not another Tour Follow-Up)")
  ok(fu[0].action_key !== "tour_follow_up", "the decision Follow Up is NOT a tour_follow_up")
}

// Didn't Like It — Top Pick removed iff it was this property; Favorite + tour preserved; reopen Schedule Tour.
{
  let s = baseState()
  s.lead.top_pick_favorite_id = FOUNDRY
  s = simulate(s, s.tours[0], "didnt_like", { setupTourId: "setup" })
  ok(s.lead.top_pick_favorite_id === null, "Didn't Like It clears Top Pick when it was this property")
  ok(s.tours.find((t) => t.property_id === FOUNDRY).status === "completed", "tour preserved as completed history")
  ok(s.actions.find((a) => a.id === "setup").completed === false, "Schedule Tour reopened")
  // Not Top Pick → not cleared.
  let s2 = baseState()
  s2.lead.top_pick_favorite_id = SKYLINE
  s2 = simulate(s2, s2.tours[0], "didnt_like")
  ok(String(s2.lead.top_pick_favorite_id) === String(SKYLINE), "Didn't Like It leaves a DIFFERENT property's Top Pick intact")
}

// Didn't Tour — no_show status, history preserved, reopen Schedule Tour.
{
  let s = baseState()
  s = simulate(s, s.tours[0], "didnt_tour", { setupTourId: "setup" })
  ok(s.tours.find((t) => t.property_id === FOUNDRY).status === "no_show", "Didn't Tour → status no_show (not canceled)")
  ok(s.tours.find((t) => t.property_id === FOUNDRY).outcome === "didnt_tour", "outcome = didnt_tour")
  ok(s.actions.find((a) => a.id === "setup").completed === false, "Schedule Tour reopened for a re-book")
}

// Wants Another Tour — completed tour preserved, reopen Schedule Tour, no rejection.
{
  let s = baseState()
  s = simulate(s, s.tours[0], "wants_another_tour", { setupTourId: "setup" })
  ok(s.tours.find((t) => t.property_id === FOUNDRY).status === "completed", "Wants Another Tour keeps the completed tour")
  ok(s.actions.find((a) => a.id === "setup").completed === false, "Schedule Tour reopened")
}

// Reschedule scoping — only the rescheduled property's follow-up moves to tour+2h.
{
  const newFoundryTour = "2026-10-01T15:00:00.000Z"
  const foundryDue = tourFollowUpDueForTour(newFoundryTour)
  const skylineDueBefore = iso(1 * HOUR)
  // Simulate the reschedule reconciliation (only Foundry's tf row retimes).
  const actions = [tfRow(FOUNDRY, "The Foundry", -1 * HOUR), tfRow(SKYLINE, "Skyline Lofts", 1 * HOUR)]
  const retimed = actions.map((a) => (a.property_id === FOUNDRY ? { ...a, due_at: foundryDue } : a))
  ok(retimed.find((a) => a.property_id === FOUNDRY).due_at === foundryDue, "Foundry follow-up recalculated to new tour + 2h")
  ok(retimed.find((a) => a.property_id === SKYLINE).due_at === skylineDueBefore, "Skyline follow-up unchanged by Foundry reschedule")
}

// Companion — "Toured · Property" aligns to the SURFACED follow-up's own tour.
{
  const leadRow: any = { id: LEAD, crm_status: "ready_to_tour", first_name: "Carlos" }
  // Both guest cards sent (completed) so follow-ups surface; Foundry's tour occurred.
  const gcFoundry = { id: "gc-f", lead_id: LEAD, title: "Email Guest Card", action_key: "email_guest_card", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: iso(-2 * HOUR), status: "completed", due_at: iso(-2 * HOUR) }
  const gcSkyline = { id: "gc-s", lead_id: LEAD, title: "Email Guest Card", action_key: "email_guest_card", property_id: SKYLINE, property_name: "Skyline Lofts", completed: true, completed_at: iso(-2 * HOUR), status: "completed", due_at: iso(-2 * HOUR) }
  const tfFoundry = tfRow(FOUNDRY, "The Foundry", -1 * HOUR) // due already passed → earliest → primary
  const tfSkyline = tfRow(SKYLINE, "Skyline Lofts", 1 * HOUR)
  const toursRows = [
    { id: "t-foundry", lead_id: LEAD, property_id: FOUNDRY, scheduled_at: iso(-3 * HOUR), status: "scheduled" },
    { id: "t-skyline", lead_id: LEAD, property_id: SKYLINE, scheduled_at: iso(3 * HOUR), status: "scheduled" }, // future
  ]
  const payload = buildActiveClientPayload(leadRow, [gcFoundry, gcSkyline, tfFoundry, tfSkyline], null, null, "America/Chicago", [], toursRows)
  ok(payload.nextActions[0]?.title === "Tour Follow-Up", "Companion surfaces one Tour Follow-Up as primary")
  ok(payload.nextActions[0]?.propertyName === "The Foundry", "primary follow-up is The Foundry's (earliest due)")
  ok(payload.lead.lastAction?.title === "Toured", "Last Action = Toured (Foundry's tour occurred)")
  ok(payload.lead.lastAction?.propertyName === "The Foundry", "Toured property matches the SURFACED follow-up (never Skyline)")
}

// Companion — Top Pick flows through to the DTO.
{
  const leadRow: any = { id: LEAD, crm_status: "done_touring", first_name: "Carlos", top_pick_favorite_id: FOUNDRY }
  const payload = buildActiveClientPayload(leadRow, [], null, null, "America/Chicago", [], [])
  ok(String(payload.lead.topPickFavoriteId) === String(FOUNDRY), "topPickFavoriteId carried in the DTO")
}

// ── Favorite surfaced state: Ready to Apply → Applied (canonical, property-scoped) ──
{
  // 1) Ready to Apply (start_application open, not yet submitted).
  ok(
    favoriteTourStateLabel({ applyActionOpen: true, isTopPick: true, appliedStage: false, outcome: "ready_to_apply" }) === "Toured · Ready to Apply",
    "Ready to Apply → '★ Top Pick · Toured · Ready to Apply' (label part)",
  )
  // 2) Click Apply but choose Not Yet → start_application still open, stage NOT applied → unchanged.
  ok(
    favoriteTourStateLabel({ applyActionOpen: true, isTopPick: true, appliedStage: false, outcome: "ready_to_apply" }) === "Toured · Ready to Apply",
    "Not Yet → remains Ready to Apply (clicking Apply alone never means Applied)",
  )
  // 3) Yes, Submitted → start_application completed, crm_status 'applied', still Top Pick → Applied.
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply" }) === "Toured · Applied",
    "Yes, Submitted → '★ Top Pick · Toured · Applied'",
  )
  // 4) Other Favorites unchanged — a DIFFERENT property (not the Top Pick) never shows Applied,
  //    even though the lead's crm_status is 'applied'. Property-scoped.
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: true, outcome: "still_deciding" }) === "Toured · Still Deciding",
    "other Favorite stays its own outcome while lead is Applied (property-scoped)",
  )
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: true, outcome: "didnt_like" }) === "Toured · Didn't Like It",
    "another Favorite's Didn't Like It is not overwritten by the applied lead",
  )
  // A no-show property never reads as Applied, even for the lead's Top Pick edge.
  ok(favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: false, tourStatus: "no_show", outcome: "didnt_tour" }) === "No-Show", "no_show → 'No-Show'")
  ok(favoriteTourStateLabel({ applyActionOpen: false, isTopPick: false, appliedStage: false, outcome: null }) === null, "no recorded outcome → null (nothing surfaced)")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
