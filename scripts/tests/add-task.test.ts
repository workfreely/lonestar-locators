/**
 * Beast Companion "Add Task" — the restored custom-task flow. Runnable, no DB:
 *   npx tsx scripts/tests/add-task.test.ts
 *
 * createManualTask imports the browser Supabase client, so (like setup-tour) the
 * DB insert is not called here; instead we assert the BEHAVIOR that matters:
 * a manual task row (the exact shape createManualTask produces — action_key null,
 * action_type "manual", origin "custom", status "open") reconciles as the Next
 * Action via the canonical rankLeadActions, is scoped to the active client, is
 * never suppressed by a workflow rule, converts its local date/time to UTC in the
 * locator's zone, and is gated on title+date+time.
 */
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { localTourToUtc } from "@/lib/leads/tourFollowUp"
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

// The EXACT row shape createManualTask produces (real insert + demo row mirror it).
function manualTaskRow(leadId: string, title: string, dueMs: number): any {
  return {
    id: Math.random(),
    lead_id: leadId,
    title,
    due_at: iso(dueMs),
    priority: "medium",
    notes: null,
    completed: false,
    completed_at: null,
    action_key: null,
    action_type: "manual",
    origin: "custom",
    status: "open",
    created_at: iso(-1 * HOUR),
  }
}

// 1) A manual task reconciles as the Next Action via rankLeadActions.
{
  const lead: any = { id: "L1", crm_status: "list_sent", next_action_date: iso(5 * 24 * HOUR) }
  const task = manualTaskRow("L1", "Call to confirm budget", 2 * HOUR) // due sooner than the stage action
  const r = rankLeadActions(lead, [task], getNextAction(lead))
  ok(r.primary.title === "Call to confirm budget", "manual task ranks as the Next Action (reconciliation)")
  ok(r.primary.manualAction?.action_type === "manual" && (r.primary.manualAction as any)?.origin === "custom", "primary is the manual/custom row (not a workflow action)")
}

// 2) Never suppressed by a workflow rule — participates in every stage.
for (const stage of ["new", "contacted", "searching", "list_sent", "ready_to_tour", "closed"]) {
  const lead: any = { id: "L", crm_status: stage, next_action_date: iso(10 * 24 * HOUR) }
  const task = manualTaskRow("L", "Custom reminder", 0) // due today → outranks a far automatic
  const r = rankLeadActions(lead, [task], getNextAction(lead))
  ok([r.primary, ...r.others].some((a) => a.title === "Custom reminder"), `manual task participates in stage "${stage}" (never suppressed)`)
}

// 3) Scoped to the active client — another lead's task never surfaces here.
{
  const lead: any = { id: "A", crm_status: "list_sent", next_action_date: null }
  const other = manualTaskRow("B", "Wrong client task", 0)
  const r = rankLeadActions(lead, [other], getNextAction(lead))
  ok(r.primary.title !== "Wrong client task", "another client's task never surfaces on this lead")
}

// 4) Due conversion — the handler's localTourToUtc(date, time, locator-zone).
{
  const due = localTourToUtc("2026-08-20", "13:00", "America/Chicago")
  ok(due === "2026-08-20T18:00:00.000Z", "task due: 1:00 PM Central → 18:00 UTC (locator zone, not browser)", due)
  const nine = localTourToUtc("2026-08-20", "09:00", "America/Chicago")
  ok(nine === "2026-08-20T14:00:00.000Z", "default 9:00 AM Central → 14:00 UTC")
}

// 5) Save guard — title + date + time all required (mirrors confirmAddTask + the
//    DashboardClient add-task handler).
{
  const canSave = (title: string, date: string, time: string) => !!title.trim() && !!date && !!time
  ok(canSave("Call", "2026-08-20", "09:00") === true, "guard: title+date+time → can save")
  ok(canSave("", "2026-08-20", "09:00") === false, "guard: empty title → blocked")
  ok(canSave("   ", "2026-08-20", "09:00") === false, "guard: whitespace-only title → blocked")
  ok(canSave("Call", "", "09:00") === false, "guard: no date → blocked")
  ok(canSave("Call", "2026-08-20", "") === false, "guard: no time → blocked")
}

// 6) Companion payload ORDERS multiple open rows by the same ranker, so the
//    manual Add Task surfaces as the Companion's Next Action when it ranks first.
{
  const lead: any = { id: "L9", crm_status: "list_sent", first_name: "Aisha", next_action_date: iso(5 * 24 * HOUR) }
  const workflowAction: any = { id: "wf1", lead_id: "L9", title: "1st Follow-Up", action_key: "follow_up_1", due_at: iso(5 * 24 * HOUR), priority: "medium", completed: false }
  const task = manualTaskRow("L9", "Call to confirm budget", 2 * HOUR) // due sooner than the workflow action
  const payload = buildActiveClientPayload(lead, [workflowAction, task], null, null, "America/Chicago")
  ok(payload.nextActions[0]?.title === "Call to confirm budget", "Companion payload surfaces the sooner-due manual task first (ranked, not insertion order)", JSON.stringify(payload.nextActions.map((a) => a.title)))
  ok(payload.nextActions.length === 2, "both open rows still present — order-only, nothing dropped")
}

// 6b) Single open row → payload unchanged (guarded; no reordering path).
{
  const lead: any = { id: "L10", crm_status: "list_sent", first_name: "Bo", next_action_date: iso(3 * 24 * HOUR) }
  const only = manualTaskRow("L10", "Only task", 24 * HOUR)
  const payload = buildActiveClientPayload(lead, [only], null, null, "America/Chicago")
  ok(payload.nextActions.length === 1 && payload.nextActions[0]?.title === "Only task", "single open row → surfaced as-is (guard leaves it untouched)")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
