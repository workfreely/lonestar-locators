// THE PRELIMINARY-TASK ROW on the Companion's Next Action card.
//
// The row is display only. Nothing here may change ranking, stages, completion or the Agenda — so
// most of this file pins what the row does NOT do, plus the one claim it makes: "Do first" is only
// said when the dates actually say so.
import { rankLeadActions, isTourScheduled } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { getActionIcon } from "@/lib/actionDisplay"
import { formatDueDateTime } from "@bc/companion-shared"
import { formatWorkflowActionLabel, isFollowUpAction, isContactFollowUpAction } from "@/lib/leads/workflowActionLabels"
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { c ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`)) }
const lpv = readFileSync("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx", "utf8")
const css = readFileSync("apps/beast-companion/src/sidepanel/lead/panel.css", "utf8")
const panel = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")

// The row's own selection + label rule, mirrored from LeadPanelView so it can be exercised.
type A = { id: number; completed: boolean; actionKey: string | null; dueAt: string | null; title: string }
function rowFor(actions: A[]) {
  const openAction = actions.find((a) => !a.completed) ?? null
  const tasks = actions
    .filter((a) => !a.completed && !a.actionKey && String(a.id) !== String(openAction?.id ?? ""))
    .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime())
  const p = tasks[0] ?? null
  if (!p) return null
  const first = !!p.dueAt && !!openAction?.dueAt && new Date(p.dueAt).getTime() < new Date(openAction.dueAt).getTime()
  return { label: first ? "Do first: " : "Also: ", task: p, more: tasks.length - 1 }
}
const tour = (due: string): A => ({ id: 139, completed: false, actionKey: "setup_tour", dueAt: due, title: "Setup Tour" })
const task = (id: number, due: string, title = "Follow Up"): A => ({ id, completed: false, actionKey: null, dueAt: due, title })

console.log("\n1. THE ROW APPEARS ONLY WHEN THERE IS SOMETHING TO SHOW:")
ok("no manual task → no row, card byte-identical to today", rowFor([tour("2026-11-05T15:00:00Z")]) === null)
ok("a manual task → a row", rowFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")]) !== null)
ok("the row is conditional in the markup, not always rendered", /\{preliminary && \(/.test(lpv))
ok("a WORKFLOW action is never shown as a personal reminder",
  rowFor([tour("2026-11-05T15:00:00Z"), { id: 150, completed: false, actionKey: "email_guest_card", dueAt: "2026-11-01T15:00:00Z", title: "Email Guest Card" }]) === null)
ok("a COMPLETED manual task is never shown",
  rowFor([tour("2026-11-05T15:00:00Z"), { ...task(143, "2026-11-01T15:00:00Z"), completed: true }]) === null)
ok("the task already shown as the headline is not repeated below it",
  rowFor([task(143, "2026-10-25T15:00:00Z")]) === null)

console.log("\n2. \"DO FIRST\" IS ONLY SAID WHEN THE DATES SAY SO:")
ok("manual due BEFORE the action → Do first",
  rowFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")])?.label === "Do first: ")
ok("manual due AFTER the action → Also, never a false ordering",
  rowFor([tour("2026-10-22T02:22:05Z"), task(143, "2026-11-01T15:00:00Z")])?.label === "Also: ")
ok("same day/time is not \"first\" either",
  rowFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-05T15:00:00Z")])?.label === "Also: ")
ok("a task with no due date makes no ordering claim",
  rowFor([tour("2026-11-05T15:00:00Z"), task(143, null as any)])?.label === "Also: ")
ok("the rule is in the component, keyed on the two due dates",
  /preliminaryIsFirst =[\s\S]{0,260}new Date\(preliminary\.dueAt\)\.getTime\(\) < new Date\(openAction\.dueAt\)\.getTime\(\)/.test(lpv))
ok("…and the label is chosen from it", /preliminaryIsFirst \? "Do first: " : "Also: "/.test(lpv))

console.log("\n3. SOONEST FIRST, WITH A QUIET COUNT:")
{
  const r = rowFor([tour("2026-12-01T15:00:00Z"), task(1, "2026-11-20T15:00:00Z", "Call"), task(2, "2026-11-02T15:00:00Z", "Confirm"), task(3, "2026-11-10T15:00:00Z", "Text")])
  ok("shows the soonest-due task", r?.task.title === "Confirm", r?.task.title)
  ok("and counts the rest", r?.more === 2, String(r?.more))
  ok("one task shows no count", rowFor([tour("2026-12-01T15:00:00Z"), task(1, "2026-11-20T15:00:00Z")])?.more === 0)
  ok("the count renders only when >1", /preliminaryTasks\.length > 1 && \(/.test(lpv))
}

console.log("\n4. IT MATCHES THE \"Manually completed\" METADATA, IN NEUTRAL:")
{
  const block = /\.lp-dofirst \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ""
  const done = /\.lp-completed \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ""
  const val = /\.lp-dofirst-val \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ""
  ok("same 12.5px type as the completed line", /font-size: 12\.5px/.test(block) && /font-size: 12\.5px/.test(done))
  ok("same 13px rhythm", /margin-top: 13px/.test(block) && /margin-top: 13px/.test(done))
  ok("same gap 6 flex row", /display: flex/.test(block) && /gap: 6px/.test(block))
  ok("same 12px icon size as the completedVia glyph", /width="12" height="12"[\s\S]{0,200}lp-dofirst|lp-dofirst[\s\S]{0,400}width="12" height="12"/.test(lpv))
  ok("NEUTRAL label colour, not the completed green",
    /color: var\(--lb-text-secondary\)/.test(block) && !/success/.test(block))
  ok("…and a neutral value colour", /color: var\(--lb-text-primary\)/.test(val))
  ok("the completed line keeps its green — untouched", /--lb-success/.test(done))
  ok("no new badge, pill or background was introduced",
    /background: transparent/.test(block) && !/border: 1px/.test(block))
}

console.log("\n4b. THE ROW READS LIKE THE APPROVED MOCK:")
{
  ok("it carries the same ✎ cue as the Due line", /className="lp-dofirst-edit"/.test(lpv))
  ok("…as a span, not a nested button — one tab stop for one action",
    /<span className="lp-dofirst-edit" aria-hidden>✎<\/span>/.test(lpv))
  // THE SHARED FORMATTER, not a second one. A bespoke format here would be a third date style on
  // one card, and the first to drift when the canonical one changes.
  ok("the row uses the SAME formatter as the Due line", /\{preliminary\.title\} · \{fmtDue\(preliminary\.dueAt, tz\)\}/.test(lpv))
  ok("no second date format was introduced", !/fmtShortDue/.test(lpv))
  ok("fmtDue is the shared formatDueDateTime in the locator's zone",
    /function fmtDue\([\s\S]{0,140}formatDueDateTime\(iso, \{ timeZone: tz \}\)/.test(lpv))
  ok("long text WRAPS cleanly rather than truncating the date or time",
    /align-items: flex-start/.test(css) && !/text-overflow: ellipsis/.test(/\.lp-dofirst \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ""))
  ok("the ✎ is styled from the same quiet language as .lp-due-edit",
    /\.lp-dofirst-edit \{[\s\S]{0,160}opacity: 0\.75/.test(css))
}

console.log("\n4c. THE EXACT STRING, THROUGH THE SHARED FORMATTER:")
{
  const tz = "America/Chicago"
  const ref = new Date("2026-10-22T12:00:00Z")
  const shown = (iso: string) => formatDueDateTime(iso, { timeZone: tz, now: ref })
  ok(`Reagan's Nov 1 task renders "Sun, Nov 1 • 9:00 AM" → got "${shown("2026-11-01T15:00:00+00:00")}"`,
    shown("2026-11-01T15:00:00+00:00") === "Sun, Nov 1 • 9:00 AM")
  ok(`a deferred Schedule Tour on Nov 5 renders "Thu, Nov 5 • 9:00 AM" → got "${shown("2026-11-05T15:00:00+00:00")}"`,
    shown("2026-11-05T15:00:00+00:00") === "Thu, Nov 5 • 9:00 AM")
  ok("today and tomorrow keep their existing shorthand",
    shown("2026-10-22T14:00:00Z").startsWith("Today • ") && shown("2026-10-23T14:00:00Z").startsWith("Tomorrow • "))
}

console.log("\n5. THE ROW OPENS THE EXISTING EDITOR — no new controls:")
ok("the row IS the control (a button)", /className="lp-dofirst"/.test(lpv) && /type="button"/.test(lpv))
ok("it opens the editor for THAT task", /onClick=\{\(\) => onEditTask\?\.\(preliminary\.id\)\}/.test(lpv))
ok("the pencil still edits the headline action", /onClick=\{\(\) => onEditTask\(\)\}/.test(lpv))
ok("the handler resolves an explicit id, else the headline",
  /taskId === undefined \? \(open\[0\] \?\? null\) : \(open\.find/.test(panel))
ok("it carries an accessible name", /aria-label=\{`Edit task: \$\{preliminary\.title\}/.test(lpv))
ok("and a visible focus ring", /\.lp-dofirst:focus-visible/.test(css))

console.log("\n6. STANDARDISED TITLES, WITHOUT REWRITING HISTORY:")
{
  const OPTIONS = ["Follow Up", "Confirm", "Call", "Text", "Email"]
  ok("the five options are the list", /TASK_TITLE_OPTIONS = \["Follow Up", "Confirm", "Call", "Text", "Email"\] as const/.test(panel))
  ok("a new task defaults to Follow Up", /DEFAULT_TASK_TITLE = "Follow Up"/.test(panel) && /setTaskTitle\(DEFAULT_TASK_TITLE\)/.test(panel))
  ok("notes stay optional alongside it", /placeholder="Optional — context for this task"/.test(panel))
  ok("an EXISTING custom title is preserved as its own option, never silently rewritten",
    /!TASK_TITLE_OPTIONS\.includes\(taskTitle as \(typeof TASK_TITLE_OPTIONS\)\[number\]\) && \(/.test(panel))
  for (const t of OPTIONS) {
    ok(`"${t}" is not a canonical workflow key`, formatWorkflowActionLabel(t) === t)
    ok(`"${t}" is not mistaken for a follow-up row`, !isFollowUpAction(t) && !isContactFollowUpAction(t))
  }
  const autos = ["Contact Lead","Build List","Send List","FU1","Setup Tour","Tour Follow-Up","Check App","Invoice Details"]
  ok("none equals a stage's automatic label (so none suppresses one)", OPTIONS.every((t) => !autos.includes(t)))
}

console.log("\n7. THE AGENDA IS UNTOUCHED:")
ok("Follow Up keeps its existing icon", getActionIcon("Follow Up") === "💬")
ok("the new types fall back to the existing default glyph",
  ["Confirm","Call","Text","Email"].every((t) => getActionIcon(t) === "📌"))
{
  const icons = readFileSync("lib/actionDisplay.ts", "utf8")
  ok("no new icon entries were added for them",
    !/"Confirm":|"Call":|"Text":|"Email":/.test(icons))
  const row = readFileSync("components/crm/FollowUpRow.tsx", "utf8")
  ok("the Agenda component was not modified for this", !/lp-dofirst|preliminary|Do first/.test(row))
}

console.log("\n8. RANKING, STAGES AND COMPLETION ARE UNCHANGED — Reagan, from her real row:")
{
  const lead = { id: 94, crm_status: "ready_to_tour", next_action_date: "2026-10-22T02:22:05.162", held_at: null }
  const rows = [
    { id:139, lead_id:94, title:"Setup Tour", action_key:"setup_tour", action_type:"workflow", status:"open",
      completed:false, completed_at:null, due_at:"2026-10-22T02:22:05.162+00:00", priority:"medium" as const, notes:null, created_at:"2026-10-22T02:05:15Z" },
    { id:143, lead_id:94, title:"Follow Up", action_key:null, action_type:"manual", status:"open",
      completed:false, completed_at:null, due_at:"2026-11-01T15:00:00+00:00", priority:"medium" as const, notes:"Tour Follow-Up", created_at:"2026-10-22T04:09:40Z" },
  ]
  const { primary, others } = rankLeadActions(lead, rows as any, getNextAction(lead))
  ok("Schedule Tour is still the primary — the row changed no ranking", primary.title === "Setup Tour")
  ok("the reminder is still ranked below it", others[0]?.title === "Follow Up")
  ok("no tour is booked", isTourScheduled(lead, rows as any) === false)
  ok("she is still Ready to Tour", lead.crm_status === "ready_to_tour")
  // TODAY the reminder is due AFTER Schedule Tour, so the row must NOT claim "Do first".
  ok("with her CURRENT dates the row would read \"Also\", not \"Do first\"",
    rowFor([tour("2026-10-22T02:22:05.162Z"), task(143, "2026-11-01T15:00:00Z")])?.label === "Also: ")
  // After deferring Schedule Tour to Nov 5 and moving the reminder to Nov 1 — then it IS first.
  ok("once Schedule Tour is deferred past it, the row honestly reads \"Do first\"",
    rowFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")])?.label === "Do first: ")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
