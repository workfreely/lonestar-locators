// EDITING AN EXISTING NEXT ACTION.
//
// The rule that matters is narrow and the consequence of breaking it is not: a workflow action's
// TITLE is what rankLeadActions matches to suppress the computed stage action, so renaming one
// resurrects a duplicate Schedule Tour that then goes permanently overdue — and completing the
// renamed row flips isTourScheduled with no tour booked. So most of this file is about what a
// caller CANNOT do, and about Reagan's case being achievable without any of that.
import { decideTaskEdit, isWorkflowAction, isOpen } from "@/lib/leads/taskEditPolicy"
import { rankLeadActions, isTourScheduled } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { nextActionSchema } from "@bc/companion-shared"
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const manual = { id: 1, action_key: null, action_type: "manual", completed: false, status: "open" }
const workflow = { id: 2, action_key: "setup_tour", action_type: "workflow", completed: false, status: "open" }

console.log("\n1. WHICH ROWS OWN THEIR OWN NAME:")
ok("a manual task does not", !isWorkflowAction(manual))
ok("a setup_tour row does", isWorkflowAction(workflow))
ok("an unkeyed row of unknown type is treated as workflow-owned (fail closed)",
  isWorkflowAction({ action_key: null, action_type: "workflow" }))
ok("…and a null/null row is treated as manual, which is what createManualTask writes",
  !isWorkflowAction({ action_key: null, action_type: null }))

console.log("\n2. ONLY OPEN TASKS MAY BE EDITED:")
ok("open is open", isOpen(manual))
ok("completed=true is not", !isOpen({ completed: true, status: "open" }))
ok("status=completed is not", !isOpen({ completed: false, status: "completed" }))
ok("status=canceled is not", !isOpen({ completed: false, status: "canceled" }))
ok("a completed task refuses every edit",
  decideTaskEdit({ ...manual, completed: true }, { dueAt: "2026-11-10T15:00:00Z" }).ok === false)
ok("…with a reason the caller can act on",
  (decideTaskEdit({ ...manual, completed: true }, { title: "x" }) as any).reason === "not_open")

console.log("\n3. A MANUAL TASK IS THE LOCATOR'S:")
{
  const d = decideTaskEdit(manual, { title: "  Follow Up  ", dueAt: "2026-10-29T14:00:00Z", notes: " deployed " })
  ok("title, due and notes all accepted", d.ok)
  ok("title trimmed", d.ok && d.patch.title === "Follow Up")
  ok("due normalised to an instant", d.ok && d.patch.due_at === "2026-10-29T14:00:00.000Z")
  ok("notes trimmed", d.ok && d.patch.notes === "deployed")
}

console.log("\n4. A WORKFLOW ACTION'S SCHEDULE MOVES; ITS NAME DOES NOT:")
{
  const move = decideTaskEdit(workflow, { dueAt: "2026-11-10T15:00:00Z" })
  ok("moving setup_tour's date is allowed", move.ok)
  ok("…and touches ONLY due_at",
    move.ok && JSON.stringify(Object.keys(move.patch)) === JSON.stringify(["due_at"]))
  const rename = decideTaskEdit(workflow, { title: "Follow Up", dueAt: "2026-11-10T15:00:00Z" })
  ok("renaming setup_tour is REFUSED", !rename.ok)
  ok("…by reason, not by accident", (rename as any).reason === "rename_workflow_action")
  ok("…and refused outright rather than silently dropping the title", !rename.ok)
  ok("notes on a workflow action are still allowed",
    decideTaskEdit(workflow, { notes: "mother may tour instead" }).ok)
  // The same title it already has is still a rename attempt — refusing is the honest answer.
  ok("even submitting the identical title is refused, not silently ignored",
    !decideTaskEdit(workflow, { title: "Setup Tour" }).ok)
}

console.log("\n5. NOTHING OUTSIDE title/due_at/notes CAN BE PRODUCED:")
{
  const d = decideTaskEdit(manual, {
    title: "x", dueAt: "2026-10-29T14:00:00Z", notes: "n",
    // Fields a hostile or careless caller might hope to smuggle through:
    ...({ action_key: "setup_tour", completed: true, status: "completed", crm_status: "closed", lead_id: 1 } as any),
  })
  ok("the patch has exactly three keys", d.ok && Object.keys(d.patch).sort().join(",") === "due_at,notes,title")
  for (const forbidden of ["action_key", "completed", "status", "crm_status", "lead_id", "completed_at", "property_id"]) {
    ok(`…and never ${forbidden}`, d.ok && !(forbidden in (d.patch as Record<string, unknown>)))
  }
}

console.log("\n6. NOTES ARE PRESERVED UNLESS EXPLICITLY CHANGED:")
ok("omitting notes leaves the column alone",
  (() => { const d = decideTaskEdit(manual, { dueAt: "2026-10-29T14:00:00Z" }); return d.ok && !("notes" in d.patch) })())
ok("explicit null clears them",
  (() => { const d = decideTaskEdit(manual, { notes: null }); return d.ok && d.patch.notes === null })())
ok("an all-whitespace value clears them rather than storing blanks",
  (() => { const d = decideTaskEdit(manual, { notes: "   " }); return d.ok && d.patch.notes === null })())

console.log("\n7. BAD INPUT IS REFUSED, NOT COERCED:")
ok("an unparseable due date is refused", !decideTaskEdit(manual, { dueAt: "not-a-date" }).ok)
ok("…by reason", (decideTaskEdit(manual, { dueAt: "nope" }) as any).reason === "invalid_due_at")
ok("an empty title on a manual task is refused", !decideTaskEdit(manual, { title: "   " }).ok)
ok("an edit that changes nothing is refused rather than reported as a save",
  (decideTaskEdit(manual, {}) as any).reason === "nothing_to_change")

console.log("\n8. THE SERVER IS THE ENFORCER, NOT THE DISABLED INPUT:")
{
  const route = readFileSync("app/api/admin/leads/task/route.ts", "utf8")
  ok("the route exists and is a PATCH", /export async function PATCH/.test(route))
  ok("it requires an authenticated workspace member", /requireWorkspaceMember\(\)/.test(route))
  ok("it re-reads the row server-side rather than trusting the message",
    /from\("lead_next_actions"\)[\s\S]{0,160}\.eq\("id", taskId\)/.test(route))
  ok("it re-checks the row's workspace against the SESSION's",
    /leadRow\.workspace_id !== guard\.workspaceId/.test(route))
  ok("…and 404s rather than 403s, so another tenant's task is indistinguishable from none",
    /workspace_id !== guard\.workspaceId[\s\S]{0,220}status: 404/.test(route))
  ok("the decision comes from the shared policy, not from route-local logic",
    /decideTaskEdit\(row as TaskRow/.test(route))
  ok("the write re-asserts completed=false, so a race cannot edit a finished task",
    /\.eq\("completed", false\)/.test(route))
  // Pinned structurally rather than by proximity: the refusal returns the policy's own message and
  // reason under a 4xx chosen from that reason, and never falls through to the success response.
  ok("a refusal returns an error status, never success",
    /if \(!decision\.ok\) \{[\s\S]*?return NextResponse\.json\(\s*\{ error: decision\.message, reason: decision\.reason \},\s*\{ status \}\s*\)/.test(route))
  ok("…and that status is a 4xx picked from the reason",
    /const status = decision\.reason === "invalid_due_at" \|\| decision\.reason === "empty_title" \? 400 : 409/.test(route))
  const panel = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
  ok("the Companion does not even SEND a title for a workflow action",
    /\.\.\.\(editing\.actionKey \? \{\} : \{ title \}\)/.test(panel))
}

console.log("\n9. THE COMPANION DTO CARRIES IDENTITY (zod strips unknown keys):")
{
  const parsed = nextActionSchema.parse({
    id: 139, leadId: 94, title: "Setup Tour", dueAt: "2026-10-22T02:22:05Z",
    priority: "medium", notes: null, completed: false, actionKey: "setup_tour",
  })
  ok("actionKey survives the schema", (parsed as any).actionKey === "setup_tour")
  ok("a manual task's null actionKey survives too",
    (nextActionSchema.parse({ id: 1, leadId: 94, title: "Follow Up", priority: "medium", completed: false, actionKey: null }) as any).actionKey === null)
  const dto = readFileSync("lib/companion/leadToDto.ts", "utf8")
  ok("the mapper actually sets it", /actionKey: str\(a\.action_key\)/.test(dto))
}

console.log("\n10. THE UI ENTRY POINTS, AND WHAT STAYS HIDDEN:")
{
  const menu = readFileSync("apps/beast-companion/src/sidepanel/menu/CompanionMenu.tsx", "utf8")
  ok("Add Task is in the hamburger menu", /<span className="bc-pop-label">Add Task<\/span>/.test(menu))
  ok("…directly BELOW Edit Client Profile and ABOVE Edit Follow-up Templates", (() => {
    const edit = menu.indexOf("{editClientLabel}")
    const add = menu.indexOf(">Add Task<")
    const tpl = menu.indexOf(">Edit Follow-up Templates<")
    return edit > 0 && add > edit && tpl > add
  })())
  const lpv = readFileSync("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx", "utf8")
  ok("SHOW_ADD_TASK is still false — no new main-panel button", /const SHOW_ADD_TASK = false;/.test(lpv))
  ok("the edit control sits on the EXISTING Due row — no new section",
    /className="lp-due">[\s\S]*?lp-due-edit[\s\S]*?<\/div>/.test(lpv))
  ok("…and it opens the shared task sheet rather than its own dialog",
    /onClick=\{onEditTask\}/.test(lpv))
  ok("…and is a real button with an accessible name", /aria-label="Edit this task's due date"/.test(lpv))
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("the legacy Lead Panel stays hidden", /const SHOW_LEGACY_LEAD_PANEL = false/.test(dash))
  ok("edit-task is allow-listed (an unlisted verb is silently dead)", /payload\.verb !== "edit-task"/.test(dash))
  ok("add-task now forwards notes", /createManualTask\(\{ lead, title, dueAt, notes: taskNotes, now \}\)/.test(dash))
  ok("the edit path is NOT optimistic — state changes only after the server confirms",
    /if \(!res\.ok \|\| !json\?\.task\)[\s\S]{0,200}return/.test(dash))
  ok("a failed save surfaces an error rather than looking successful", /window\.alert\(json\?\.error/.test(dash))
  ok("a successful save UPDATES the row in place rather than appending a duplicate",
    /prev\.map\(\(a: any\) => \(String\(a\.id\) === String\(saved\.id\)/.test(dash))
  ok("…and re-posts to the Companion so all three surfaces agree",
    /postCompanionActiveClient\([\s\S]{0,200}String\(a\.id\) === String\(saved\.id\)/.test(dash))
  ok("the sheet defaults a NEW task to Follow Up", /setTaskTitle\("Follow Up"\)/.test(readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx","utf8")))
}

console.log("\n11. REAGAN — the real scenario, simulated, her record untouched:")
{
  // Her ACTUAL live row, read earlier: lead 94, ready_to_tour, one open setup_tour.
  const lead = { id: 94, crm_status: "ready_to_tour", next_action_date: "2026-10-22T02:22:05.162", held_at: null }
  const setupTour = {
    id: 139, lead_id: 94, title: "Setup Tour", action_key: "setup_tour", action_type: "workflow",
    origin: "workflow", status: "open", completed: false, completed_at: null,
    due_at: "2026-10-22T02:22:05.162+00:00", priority: "medium" as const, notes: null,
    created_at: "2026-10-22T02:05:15Z",
  }
  // Step 1 — defer Setup Tour to Nov 10. Date only; the policy decides, not the caller.
  const deferral = decideTaskEdit(setupTour, { dueAt: "2026-11-10T15:00:00Z", notes: "Deployed; mother may tour on her behalf." })
  ok("Setup Tour can be deferred to Nov 10", deferral.ok)
  ok("…changing only its schedule and notes",
    deferral.ok && JSON.stringify(Object.keys(deferral.patch).sort()) === JSON.stringify(["due_at", "notes"]))
  const deferred = { ...setupTour, ...(deferral.ok ? deferral.patch : {}) }
  // Step 2 — the Oct 29 Follow Up, exactly what createManualTask writes.
  const followUp = {
    id: 999, lead_id: 94, title: "Follow Up", action_key: null, action_type: "manual", origin: "custom",
    status: "open", completed: false, completed_at: null, due_at: "2026-10-29T14:00:00+00:00",
    priority: "medium" as const, notes: "Deployed; mother may tour on her behalf.", created_at: "2026-10-22T04:00:00Z",
  }
  const { primary, others } = rankLeadActions(lead, [deferred, followUp] as any, getNextAction(lead))
  ok("Follow Up becomes the PRIMARY action", primary.title === "Follow Up", primary.title)
  ok("…and Schedule Tour is still open behind it, not gone",
    others.some((o) => o.title === "Setup Tour"))
  ok("neither is overdue or due today, so the Agenda is clear",
    primary.urgency === "upcoming" && others.every((o) => o.urgency === "upcoming"))
  ok("NO tour is marked booked", isTourScheduled(lead, [deferred, followUp] as any) === false)
  ok("she stays Ready to Tour — nothing here writes crm_status", lead.crm_status === "ready_to_tour")
  ok("no guest-card action is created by any of this",
    ![deferred, followUp].some((a) => String(a.action_key) === "email_guest_card"))
  ok("the deferral did NOT rename setup_tour, so no duplicate stage action appears",
    deferred.title === "Setup Tour" && deferred.action_key === "setup_tour")
  ok("and a later date change is just another edit",
    decideTaskEdit(deferred as any, { dueAt: "2026-11-17T15:00:00Z" }).ok)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
