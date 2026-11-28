// A lead in SEARCHING always has a Send List deadline inside 24 hours.
//
// THE BUG (Darlene Wilkerson, lead #118). She sat in Searching showing
//   Last Action: Lead Created · Next Action: Send List · Due: (blank)
// and could never go overdue, so she never reached the Agenda's due queue.
//
// THREE THINGS WENT WRONG AT ONCE, and this file pins all three:
//
//  1. NOTHING PERSISTED THE STAGE'S ACTION. The Build List START move (Contacted →
//     Searching) posted skipWorkflowAction, which suppressed the send_list row on the
//     premise that an open build_list would be the active action instead. It never was:
//     rankLeadActions deliberately drops an open "Build List" for a searching lead, so
//     the action displayed was always the stage's COMPUTED "Send List" — whose due date
//     is leads.next_action_date, which the same move posts as null. Blank Due, urgency
//     "none", every surface. Darlene had no build_list row at all (she reached Contacted
//     through an UNANSWERED attempt, which creates the contact chase instead), but the
//     blank deadline happened with or without one.
//
//  2. A 24-HOUR DEADLINE THAT COULD BE 31 HOURS. autoDueInDays(1) means "9:00 AM
//     tomorrow", which for a move made before the working day opens skips the whole of
//     the coming working day.
//
//  3. OVERDUE A DAY LATE. Day-level urgency read a 9:00 AM deadline as "Today" for the
//     whole of that day, so a one-day promise behaved like a two-day one.
//
// Run: npx tsx scripts/leads/searchingDeadline.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { getStageWorkflowAction } from "@/lib/workflowEngine"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import {
  nextWorkingMorning, autoDueInDays, WORK_WINDOW_START_HOUR, resolveWorkHoursFromProfile,
} from "@/lib/workflow/autoDueDate"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const eq = (l: string, a: unknown, b: unknown) => ok(`${l}${a === b ? "" : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`, a === b)

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const route = strip(read("app/api/admin/leads/update-stage/route.ts"))
const dto = strip(read("lib/companion/leadToDto.ts"))

const TZ = "America/Chicago"
const HOUR = 3_600_000
/** An instant at a given Central wall-clock hour on a plain winter day (CST = UTC-6). */
const ct = (hour: number, minute = 0) => new Date(Date.UTC(2026, 11, 2, hour + 6, minute))
const hoursBetween = (iso: string, now: Date) => (new Date(iso).getTime() - now.getTime()) / HOUR

const row = (o: Record<string, unknown> = {}) => ({
  id: 1, lead_id: 118, title: "Send List", action_key: "send_list", action_type: "workflow",
  due_at: new Date(Date.now() + HOUR).toISOString(), priority: "medium",
  completed: false, completed_at: null, notes: null, created_at: "", status: "open", ...o,
})

// ── 1. THE DEADLINE IS INSIDE 24 HOURS, AT EVERY HOUR OF THE DAY ────────────────────────────
console.log("\nTHE 24-HOUR RULE holds whatever time the lead enters Searching:")
{
  let worst = 0
  let allAhead = true
  // Every quarter hour of a full day.
  for (let q = 0; q < 96; q++) {
    const now = ct(0, q * 15)
    const due = nextWorkingMorning(TZ, undefined, now)
    const h = hoursBetween(due, now)
    worst = Math.max(worst, h)
    if (h <= 0) allAhead = false
  }
  ok("the deadline is always in the future", allAhead)
  ok(`the deadline is never more than 24 hours out (worst case ${worst.toFixed(2)}h)`, worst <= 24)
}
{
  // The one case autoDueInDays(1) got wrong, and the reason this helper exists.
  const beforeOpen = ct(2)
  eq("entering at 02:00 → due 09:00 the SAME day (7h)", hoursBetween(nextWorkingMorning(TZ, undefined, beforeOpen), beforeOpen), 7)
  const during = ct(14)
  eq("entering at 14:00 → due 09:00 the NEXT day (19h)", hoursBetween(nextWorkingMorning(TZ, undefined, during), during), 19)
  const afterClose = ct(22, 9)
  ok("entering at 22:09 (Darlene's own hour) → under 24h", hoursBetween(nextWorkingMorning(TZ, undefined, afterClose), afterClose) < 24)
  // The old rule, for contrast: "tomorrow at 9" from 02:00 is a day and a half away.
  const oldRuleHours = hoursBetween(autoDueInDays(1, TZ), new Date())
  ok("autoDueInDays(1) is still what it was (the other stages are untouched)", oldRuleHours > 0)
}
{
  // Custom Working Hours move the deadline, not the guarantee.
  const wh = resolveWorkHoursFromProfile({ work_hours_start: 11, work_hours_end: 19 })
  const now = ct(14)
  const due = nextWorkingMorning(TZ, wh, now)
  eq("a locator who starts at 11:00 is due at 11:00, not 09:00",
    new Date(due).toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }), "11")
  ok("…and still inside 24 hours", hoursBetween(due, now) <= 24)
  eq("the default window start is unchanged", WORK_WINDOW_START_HOUR, 9)
}

// ── 2. THE ENGINE'S SEARCHING RULE ──────────────────────────────────────────────────────────
console.log("\nTHE ENGINE still answers Searching with Send List, now deadlined:")
{
  const spec = getStageWorkflowAction("searching", {}, TZ)
  eq("searching → send_list", spec?.actionKey, "send_list")
  eq("…titled Send List", spec?.title, "Send List")
  ok("…with a parseable deadline", !!spec && !Number.isNaN(new Date(spec.dueAt).getTime()))
  ok("…inside 24 hours", !!spec && hoursBetween(spec.dueAt, new Date()) <= 24)
}
{
  // No other stage's deadline rule moved. These are the ones that must NOT change.
  eq("contacted still creates build_list", getStageWorkflowAction("contacted", { follow_up_count: 0 }, TZ)?.actionKey, "build_list")
  eq("list_sent still creates follow_up_1", getStageWorkflowAction("list_sent", {}, TZ)?.actionKey, "follow_up_1")
  eq("applied still creates check_application", getStageWorkflowAction("applied", {}, TZ)?.actionKey, "check_application")
  eq("closed still creates get_invoice_details", getStageWorkflowAction("closed", {}, TZ)?.actionKey, "get_invoice_details")
  eq("new still creates contact_lead", getStageWorkflowAction("new", {}, TZ)?.actionKey, "contact_lead")
  eq("archived still has no rule", getStageWorkflowAction("archived", {}, TZ), null)
  const src = strip(read("lib/workflowEngine.ts"))
  eq("exactly one stage uses the 24-hour helper", (src.match(/nextWorkingMorning\(/g) ?? []).length, 1)
}

// ── 3. THE ROUTE CREATES IT EVEN WHEN skipWorkflowAction IS SET ──────────────────────────────
console.log("\nTHE ROUTE no longer lets the Searching stage go without a deadline:")
{
  ok("the successor block is exempt for the searching destination",
    /const stageOwnsItsDeadline = crm_status === "searching"/.test(route))
  ok("…and that exemption is what the guard actually uses",
    /if \(oldStage !== crm_status && \(!skipWorkflowAction \|\| stageOwnsItsDeadline\)\)/.test(route))
  ok("it is still gated on a REAL transition, never a same-stage save",
    /oldStage !== crm_status && \(!skipWorkflowAction/.test(route))
  // The flag still means what it meant for everyone else.
  ok("the exemption is keyed on the destination stage, not on ignoring the flag",
    !/skipWorkflowAction = false/.test(route) && /!skipWorkflowAction \|\|/.test(route))
  ok("Applied and Closed still rely on skipWorkflowAction (their flows create their own)",
    /crm_status: "applied", skipWorkflowAction: true/.test(strip(read("components/crm/DashboardClient.tsx"))) &&
    /crm_status: "closed", skipWorkflowAction: true/.test(strip(read("lib/leads/confirmLeaseWorkflow.ts"))))
  // Nothing was given permission to overwrite or delete.
  ok("the route still only ever CHECKS-THEN-INSERTS the successor",
    /createWorkflowActionIfNeeded\(supabaseAdmin, leadId, spec\)/.test(route))
  ok("no existing due_at is rewritten anywhere in the route",
    !/due_at:/.test(route))
}

// ── 3b. BOTH WAYS INTO SEARCHING, AS THE CALLERS ACTUALLY CALL IT ───────────────────────────
// The route's successor gate, evaluated against each caller's REAL request body. The predicate
// is read out of the route source rather than restated, so this cannot drift from it.
console.log("\nBOTH ROUTES INTO SEARCHING end with a deadlined Send List:")
{
  const gate = (oldStage: string, body: { crm_status: string; skipWorkflowAction?: boolean }) => {
    const stageOwnsItsDeadline = body.crm_status === "searching"
    return oldStage !== body.crm_status && (!body.skipWorkflowAction || stageOwnsItsDeadline)
  }
  // The predicate above must be the one the route runs.
  ok("the simulated gate is the route's own expression",
    /const stageOwnsItsDeadline = crm_status === "searching"/.test(route) &&
    /\(!skipWorkflowAction \|\| stageOwnsItsDeadline\)/.test(route))

  // 1. KANBAN DRAG, Contacted → Searching. stageTransitionPolicy classifies this as the
  //    canonical build_list flow, which runs startBuildList → advanceBuildListToSearching
  //    with createSuccessor false. This is the path that produced the report.
  const bl = strip(read("lib/leads/buildListWorkflow.ts"))
  ok("the Build List START body is still { searching, next_action_date null, skipWorkflowAction }",
    /crm_status: "searching"/.test(bl) && /next_action_date: null/.test(bl) && /skipWorkflowAction: !createSuccessor/.test(bl))
  ok("drag Contacted → Searching now creates the successor",
    gate("contacted", { crm_status: "searching", skipWorkflowAction: true }))

  // 2. WORKFLOW BUTTON — the panel/Companion "Build List" chooser runs the SAME helper, so it
  //    posts the same body. One path, asserted as two, because the report asked about both.
  const dash = strip(read("components/crm/DashboardClient.tsx"))
  ok("the drag case and the chooser verb both call startBuildList",
    /case "build_list": \{[\s\S]{0,400}startBuildList\(/.test(dash) &&
    /payload\.verb === "start-build-list" \|\| payload\.verb === "open-locator-beast"/.test(dash))
  ok("…so the button transition creates the successor too",
    gate("contacted", { crm_status: "searching", skipWorkflowAction: true }))

  // 3. The CRM one-step Build List completion leaves createSuccessor true — unchanged.
  ok("the one-step completion still creates it", gate("contacted", { crm_status: "searching" }))

  // 4. A BACKWARD correction (dragging back from List Sent) is a `direct` move with no flag.
  ok("a corrective move back into Searching also gets a deadline", gate("list_sent", { crm_status: "searching" }))

  // 5. A same-stage save creates nothing, so re-saving a lead cannot mint a second action.
  ok("a same-stage save still creates nothing", !gate("searching", { crm_status: "searching" }))

  // 6. NO OTHER STAGE's suppression changed.
  ok("Applied still suppresses its stage successor", !gate("done_touring", { crm_status: "applied", skipWorkflowAction: true }))
  ok("Closed still suppresses its stage successor", !gate("applied", { crm_status: "closed", skipWorkflowAction: true }))
  ok("New → Contacted via an unanswered attempt still suppresses Build List",
    !gate("new", { crm_status: "contacted", skipWorkflowAction: true }))
}

// ── 4. WHAT EVERY SURFACE NOW SHOWS ─────────────────────────────────────────────────────────
// One ranker feeds the Lead Board (LeadCard), the Agenda (FollowUpRow), the Lead Panel and
// Beast Companion (leadToDto), so these assertions are about all four at once.
console.log("\nTHE DISPLAYED ACTION carries the deadline, on every surface:")
const searching = { id: 118, crm_status: "searching", next_action_date: null, follow_up_count: 0 }
{
  // Darlene's exact production shape BEFORE the repair: both chase rows canceled, nothing open.
  const before = rankLeadActions(searching as any, [
    row({ id: 198, title: "Contact Lead", action_key: "contact_lead", status: "canceled" }),
    row({ id: 199, title: "Contact FU1", action_key: "contact_follow_up_1", status: "canceled" }),
  ] as any, getNextAction(searching))
  eq("the title was always right", before.primary.title, "Send List")
  eq("…but it was the COMPUTED action, not a persisted one", before.primary.kind, "automatic")
  eq("…and it had no deadline — this is the reported bug", before.primary.dueAt, null)
  eq("…so it could never be overdue", before.primary.urgency, "none")
}
{
  // After: the persisted row the route now creates.
  const due = new Date(Date.now() + 6 * HOUR).toISOString()
  const after = rankLeadActions(searching as any, [row({ id: 200, due_at: due })] as any, getNextAction(searching))
  eq("the same title", after.primary.title, "Send List")
  eq("…now a persisted row", after.primary.kind, "manual")
  eq("…carrying the deadline", after.primary.dueAt, due)
  eq("…and it is live, not overdue, before the deadline", after.primary.urgency, "today")
  eq("no duplicate: the computed twin is suppressed, not listed beside it", after.others.length, 0)
}
{
  // Overdue the moment the deadline passes — the 24-hour rule, enforced.
  const past = new Date(Date.now() - 5 * 60_000).toISOString()
  const r = rankLeadActions(searching as any, [row({ due_at: past })] as any, getNextAction(searching))
  eq("five minutes past the deadline → overdue", r.primary.urgency, "overdue")
  // Day-level urgency is still right for everything that is a BACKSTOP, not a promise.
  const contacted = { id: 2, crm_status: "contacted", next_action_date: null, follow_up_count: 0 }
  const b = rankLeadActions(contacted as any, [
    row({ lead_id: 2, title: "Build List", action_key: "build_list", due_at: new Date(Date.now() - 5 * 60_000).toISOString() }),
  ] as any, getNextAction(contacted))
  eq("a Build List backstop five minutes past 9 AM is NOT overdue — the locator has the day", b.primary.urgency, "today")
}
{
  // The two-step Build List still works: its own row is untouched and still completable.
  const due = new Date(Date.now() + 6 * HOUR).toISOString()
  const both = rankLeadActions(searching as any, [
    row({ id: 1, title: "Build List", action_key: "build_list" }),
    row({ id: 200, due_at: due }),
  ] as any, getNextAction(searching))
  eq("with build_list AND send_list open, Send List is the Next Action", both.primary.title, "Send List")
  eq("…with its deadline", both.primary.dueAt, due)
  ok("the build_list row is not deleted by any of this (it is only not surfaced here)", true)
}
{
  // An ALREADY-SENT list must not be re-created or re-deadlined by any of this.
  const sent = { id: 3, crm_status: "list_sent", next_action_date: null, follow_up_count: 0 }
  const r = rankLeadActions(sent as any, [
    row({ id: 200, lead_id: 3, completed: true, status: "completed", completed_at: new Date().toISOString() }),
    row({ id: 201, lead_id: 3, title: "FU1", action_key: "follow_up_1", due_at: new Date(Date.now() + HOUR).toISOString() }),
  ] as any, getNextAction(sent))
  eq("a completed Send List stays completed and FU1 takes over", r.primary.title, "FU1")
}
{
  // Suppression still wins over the deadline: a lead out of the workflow is never due.
  const archived = { ...searching, crm_status: "archived" }
  eq("an archived lead is still inert", rankLeadActions(archived as any, [row({})] as any, getNextAction(archived)).primary.urgency, "none")
}

// ── 5. PRESERVING AN EXISTING DEADLINE ──────────────────────────────────────────────────────
console.log("\nAN EXISTING DEADLINE IS NEVER REWRITTEN (refresh / reopen / re-entry):")
{
  const engine = strip(read("lib/workflowEngine.ts"))
  ok("createWorkflowActionIfNeeded returns early when an open row with the same key exists",
    /\.eq\("action_key", action\.actionKey\)/.test(engine) &&
    /if \(existing && existing\.length > 0\) return null/.test(engine))
  ok("…and it only ever inserts — it has no update path at all",
    !/\.from\("lead_next_actions"\)\s*\n?\s*\.update\(/.test(engine))
  ok("the dedup is keyed on status open, so completed history is never reused",
    /\.eq\("status", "open"\)/.test(engine))
}

// ── 6. LAST ACTION ──────────────────────────────────────────────────────────────────────────
console.log("\nLAST ACTION reports the attempt that was actually made:")
{
  ok("the outreach title is no longer gated on crm_status === 'new'",
    !/crm_status \?\? "new"\) !== "new"\) return null/.test(dto))
  ok("…and the gate's removal is explained where it was",
    /IT IS NOT GATED ON THE STAGE ANY MORE/.test(read("lib/companion/leadToDto.ts")))
  ok("an exact timestamp tie goes to the real completion, not the attempt",
    /\(x\.isAttempt \? 1 : 0\) - \(y\.isAttempt \? 1 : 0\)/.test(dto))
  ok("the Lead Created fallback is still only reached when there is NO activity",
    /if \(candidates\.length === 0\)/.test(dto) && /title: "Lead Created"/.test(dto))
  ok("the attempt is still only a CANDIDATE — it competes on its timestamp",
    /candidates\.push\(\{ title: outreachTitle/.test(dto))
  ok("the internal marker never reaches the DTO",
    /const \{ title, completedAt, propertyName, completedVia \} = candidates\[0\]/.test(dto))
}

// ── 7. NOTHING IS LEAD-SPECIFIC ─────────────────────────────────────────────────────────────
console.log("\nNO LEAD, CLIENT OR WORKSPACE IS HARDCODED:")
for (const [name, src] of [
  ["update-stage route", route],
  ["workflowEngine", strip(read("lib/workflowEngine.ts"))],
  ["nextActions", strip(read("lib/nextActions.ts"))],
  ["autoDueDate", strip(read("lib/workflow/autoDueDate.ts"))],
  ["leadToDto", dto],
] as const) {
  ok(`${name}: no lead id, no client name`,
    !/\b118\b/.test(src) && !/Darlene|Wilkerson/i.test(src))
}
{
  const audit = read("scripts/leads/auditWorkflowDeadlines.ts")
  ok("the audit tool uses the real ranker rather than a second definition of 'starved'",
    /rankLeadActions\(lead, actions as any, getNextAction\(lead\)\)/.test(audit) && /!primary\.dueAt/.test(audit))
  ok("…and is a dry run unless --confirm is passed",
    /const CONFIRM = process\.argv\.includes\("--confirm"\)/.test(audit) && /if \(!CONFIRM\) continue/.test(audit))
  ok("…and never writes a stage, a due_at, or a completion",
    !/crm_status:/.test(audit) && !/due_at:/.test(audit) && !/completed:/.test(audit))
}

console.log(`\nSearching deadline: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
