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

// The card's selection + label rule, mirrored from LeadPanelView so it can be exercised directly.
type A = { id: number | string; completed: boolean; actionKey: string | null; isManual?: boolean | null; dueAt: string | null; title: string }
function headlineFor(actions: A[]) {
  const open = actions.filter((a) => !a.completed)
  return open.find((a) => !a.isManual) ?? open[0] ?? null
}
function rowFor(actions: A[]) {
  const openAction = headlineFor(actions)
  const open = actions.filter((a) => !a.completed)
  const tasks = open
    .filter((a) => a.isManual && String(a.id) !== String(openAction?.id ?? ""))
    .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime())
  const p = tasks[0] ?? null
  if (!p) return null
  const order: "first" | "after" | "none" =
    !p.dueAt || !openAction?.dueAt ? "none"
    : new Date(p.dueAt).getTime() < new Date(openAction.dueAt).getTime() ? "first"
    : new Date(p.dueAt).getTime() > new Date(openAction.dueAt).getTime() ? "after"
    : "none"
  const label = order === "first" ? "First: " : order === "after" ? "After: " : "Reminder: "
  return { label, task: p, more: tasks.length - 1, headline: openAction }
}
const tour = (due: string | null): A => ({ id: 139, completed: false, actionKey: "setup_tour", isManual: false, dueAt: due, title: "Setup Tour" })
const task = (id: number, due: string | null, title = "Follow Up"): A => ({ id, completed: false, actionKey: null, isManual: true, dueAt: due, title })
/** The DTO's SYNTHETIC stage action: no actionKey, isManual explicitly false. */
const computed = (due: string | null): A => ({ id: "computed-94", completed: false, actionKey: null, isManual: false, dueAt: due, title: "Setup Tour" })
/** The DTO's aggregated guest-card entry: also synthetic, also not manual. */
const gcBulk = (due: string | null): A => ({ id: "gc-bulk-94", completed: false, actionKey: null, isManual: false, dueAt: due, title: "Send Guest Cards · 3 properties" })

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

console.log("\n2. FIRST / AFTER / REMINDER — a statement about dates, never a dependency:")
ok("reminder due BEFORE the leasing step → First",
  rowFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")])?.label === "First: ")
ok("reminder due AFTER it → After",
  rowFor([tour("2026-11-01T15:00:00Z"), task(143, "2026-11-05T15:00:00Z")])?.label === "After: ")
ok("EQUAL dates → Reminder, because neither word is true",
  rowFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-05T15:00:00Z")])?.label === "Reminder: ")
ok("MISSING reminder date → Reminder",
  rowFor([tour("2026-11-05T15:00:00Z"), task(143, null)])?.label === "Reminder: ")
ok("MISSING headline date → Reminder",
  rowFor([tour(null), task(143, "2026-11-01T15:00:00Z")])?.label === "Reminder: ")
ok("the three-way rule is in the component", /preliminaryOrder: "first" \| "after" \| "none"/.test(lpv))
ok("…and the labels are chosen from it",
  /preliminaryOrder === "first" \? "First: " : preliminaryOrder === "after" \? "After: " : "Reminder: "/.test(lpv))
ok("no dependency is created — the row only compares two dates",
  !/depends|blocked|prerequisite|require/i.test(/const preliminaryOrder[\s\S]*?: "none"/.exec(lpv)?.[0] ?? ""))

console.log("\n2b. THE HEADLINE IS THE LEASING STEP, NOT THE SOONEST THING:")
ok("a REAL canonical action outranks an earlier reminder",
  headlineFor([tour("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")])?.title === "Setup Tour")
ok("a SYNTHETIC computed stage action does too — it has no actionKey, only isManual:false",
  headlineFor([computed("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")])?.id === "computed-94")
ok("…and the aggregated guest-card entry is treated the same way",
  headlineFor([gcBulk("2026-11-05T15:00:00Z"), task(143, "2026-11-01T15:00:00Z")])?.id === "gc-bulk-94")
ok("an OVERDUE reminder still does NOT take the headline",
  headlineFor([tour("2026-12-01T15:00:00Z"), task(143, "2026-09-01T15:00:00Z")])?.title === "Setup Tour")
ok("…and it is shown in the row instead, labelled First",
  rowFor([tour("2026-12-01T15:00:00Z"), task(143, "2026-09-01T15:00:00Z")])?.label === "First: ")
ok("with NO workflow action open, the reminder IS the headline",
  headlineFor([task(143, "2026-11-01T15:00:00Z")])?.id === 143)
ok("…and then there is no row to draw", rowFor([task(143, "2026-11-01T15:00:00Z")]) === null)
ok("a missing isManual reads as NOT manual, so an older payload behaves as today",
  headlineFor([{ id: 9, completed: false, actionKey: null, dueAt: "2026-11-01T15:00:00Z", title: "Legacy" }])?.id === 9)
ok("the component selects on isManual, not on actionKey",
  /openActions\.find\(\(a\) => !a\.isManual\) \?\? openActions\[0\]/.test(lpv))

console.log("\n2c. THE SERVER STATES isManual — it is not inferred:")
{
  const dto = readFileSync("lib/companion/leadToDto.ts", "utf8")
  ok("real rows derive it from action_key + action_type",
    /isManual: !a\.action_key && String\(a\.action_type \?\? ""\)\.toLowerCase\(\) === "manual"/.test(dto))
  ok("the computed stage action states false", /id: `computed-\$\{lead\.id\}`[\s\S]{0,420}isManual: false/.test(dto))
  ok("the aggregated guest card states false", /id: `gc-bulk-\$\{lead\.id\}`[\s\S]{0,420}isManual: false/.test(dto))
  const contract = readFileSync("packages/companion-shared/src/leads/contract.ts", "utf8")
  ok("and it is DECLARED in the schema, or zod would strip it", /isManual: z\.boolean\(\)\.nullish\(\)/.test(contract))
  ok("the DTO documents why the card may differ from the Agenda",
    /ONE ORDER, TWO QUESTIONS/.test(dto) && /due\s*\n?\s*\/\/ queue|due queue/.test(dto))
}

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

console.log("\n6b. SHARED RANKING AND EVERY OTHER SURFACE ARE UNTOUCHED:")
{
  // The strongest statement available: these files are byte-identical to the last commit.
  const { execSync } = require("node:child_process") as typeof import("node:child_process")
  const changed = execSync("git diff --name-only HEAD", { encoding: "utf8" }).split("\n").filter(Boolean)
  const mustNotChange = [
    "lib/nextActions.ts", "lib/nextAction.ts", "lib/workflowEngine.ts",
    "lib/leads/actionRelevance.ts", "lib/leads/actionCompletion.ts", "lib/leads/setupTourWorkflow.ts",
    "lib/leads/stageTransition.ts", "app/api/admin/leads/update-stage/route.ts",
    "lib/followup/gate.ts", "lib/followup/engine.ts", "lib/followup/autoEnroll.ts",
    "components/crm/FollowUpRow.tsx", "components/crm/LeadCard.tsx", "lib/actionDisplay.ts",
  ]
  for (const f of mustNotChange) ok(`untouched — ${f}`, !changed.includes(f), "MODIFIED")
}

console.log("\n6c. THE TASK SHEET'S CALENDAR — stylesheet facts:")
{
  // Behaviour is tested where the component lives (apps/beast-companion, npm run test:datefield);
  // these are the stylesheet and wiring facts, asserted here because that project deliberately
  // keeps @types/node out of its `types`.
  const css = readFileSync("apps/beast-companion/src/sidepanel/menu/calendar.css", "utf8")
  const panel = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
  const field = readFileSync("apps/beast-companion/src/sidepanel/menu/DateField.tsx", "utf8")
  const menu = readFileSync("apps/beast-companion/src/sidepanel/menu/menu.css", "utf8")

  ok("the component owns its stylesheet", /import "\.\/calendar\.css";/.test(field))
  ok("menu.css no longer carries calendar rules — no silent dependency left", !/\.bc-cal/.test(menu))
  ok("…and the rules survived the move", (css.match(/\.bc-cal/g) ?? []).length > 25)

  const w = /\.bc-cal--lg \.bc-cal-pop \{[^}]*width: (\d+)px/.exec(css)?.[1]
  ok(`the large popover is ${w}px, inside the 384px panel with 14px sheet padding each side`,
    !!w && Number(w) + 28 <= 384, `${w}px + 28 > 384`)
  ok("…and is the approved ~256px", w === "256")
  const h = /\.bc-cal--lg \.bc-cal-cell \{[^}]*height: (\d+)px/.exec(css)?.[1]
  ok(`date targets are ${h}px — within the approved 30–32px`, !!h && Number(h) >= 30 && Number(h) <= 32)
  ok("the popover stays right-aligned, so it cannot widen the panel", /\.bc-cal-pop \{[\s\S]*?right: 0/.test(css))
  ok("the upward modifier flips the anchor and nothing else",
    /\.bc-cal--up \.bc-cal-pop \{\s*top: auto;\s*bottom: calc\(100% \+ 6px\);\s*\}/.test(css))
  ok("both modifiers are opt-in, so Out of Office is unchanged",
    /\.bc-cal--up \.bc-cal-pop/.test(css) && /\.bc-cal--lg \.bc-cal-pop/.test(css))

  ok("the task sheet uses DateField, not a native date input",
    /<DateField[\s\S]{0,260}placement="up"[\s\S]{0,80}size="lg"/.test(panel))
  ok("…and the native Due Date input is gone", !/Due Date \*[\s\S]{0,160}type="date"/.test(panel))
  ok("the value contract is preserved both ways",
    /value=\{taskDate \|\| null\}/.test(panel) && /onChange=\{\(next\) => setTaskDate\(next \?\? ""\)\}/.test(panel))
  ok("SCHEDULE TOUR is untouched — still its native input", /Tour Date \*[\s\S]{0,200}type="date"/.test(panel))
  const tour = readFileSync("apps/beast-companion/src/sidepanel/tour/TourModeView.tsx", "utf8")
  ok("TOUR MODE is untouched — still native with colorScheme dark", /type="date"/.test(tour) && /colorScheme: "dark"/.test(tour))
  const ooo = readFileSync("apps/beast-companion/src/sidepanel/menu/OutOfOfficeControl.tsx", "utf8")
  ok("OUT OF OFFICE passes neither modifier, so it renders exactly as before",
    /<DateField/.test(ooo) && !/placement=|size=/.test(ooo))
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
  // HER LIVE STATE: setup_tour deferred to Nov 5 9:00 PM, reminder Nov 1 9:00 AM.
  const live = [tour("2026-11-06T03:00:00+00:00"), task(143, "2026-11-01T15:00:00+00:00")]
  ok("Schedule Tour is the Companion headline again", headlineFor(live)?.title === "Setup Tour")
  ok("…with her Nov 1 Follow Up in the row underneath", rowFor(live)?.task.id === 143)
  ok("…labelled First, because it genuinely comes first", rowFor(live)?.label === "First: ")
  ok("…and no count, since it is her only reminder", rowFor(live)?.more === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
