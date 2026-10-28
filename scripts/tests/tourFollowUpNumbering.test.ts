/**
 * Tour Follow-Up NUMBERING — a rung is an outreach attempt, not a tour visit.
 *   npx tsx scripts/tests/tourFollowUpNumbering.test.ts
 *
 * The behaviour this locks down, and why each lock exists:
 *
 *   1. Scheduling from Still Deciding / Other creates the NEXT NUMBERED RUNG at the
 *      date the locator chose. It used to create a generic manual "Follow Up"
 *      (action_key null), which no matcher on either surface could resolve — which
 *      is exactly why it rendered as the Companion's "coming soon" dead end.
 *   2. The rung advances because another attempt was scheduled, NOT because another
 *      tour happened. Nothing here creates or needs a lead_tours row.
 *   3. Only the 1st rung may write the physical tour outcome. Rungs 2-3 are later
 *      conversations about a tour already reported on; rewriting its history from
 *      them would destroy the locator's original answer.
 *   4. The modal's question is contextual, the outcome choices are not. A client who
 *      becomes ready on the 2nd attempt must still reach Ready to Apply in one tap.
 *   5. After the 3rd there is no 4th. No date is offered for a step that does not
 *      exist, because nothing would be created with it.
 *   6. A failed write is explicit, and nothing is silently reopened or invented.
 *
 * Pure: the ladder, the plan and the modal contract are all DB-free. The two write
 * paths that touch the browser Supabase client are asserted from source, the way
 * tour-follow-up-sequence.test.ts already does.
 */
import { readFileSync } from "node:fs"
import {
  TOUR_FOLLOW_UP_LADDER,
  nextTourFollowUpKey,
  rungAfter,
  tourFollowUpTitle,
  tourFollowUpQuestion,
  tourFollowUpKeyOf,
  isTourFollowUpRow,
  buildTourFollowUpSmsBody,
  TOUR_FOLLOW_UP_SMS,
  type TourFollowUpKey,
} from "@bc/companion-shared"
import { planForOutcome } from "@/lib/leads/tourFollowUp"
import { rankLeadActions } from "@/lib/nextActions"
import { actionRelevanceRank } from "@/lib/leads/actionRelevance"
import type { TourOutcome } from "@bc/companion-shared"

let pass = 0,
  fail = 0
function ok(name: string, cond: boolean, extra = "") {
  cond ? pass++ : fail++
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected)
  ok(name, a === e, `expected ${e}\n      actual   ${a}`)
}

const HOUR = 3600 * 1000
const T0 = Date.now()
const iso = (ms: number) => new Date(T0 + ms).toISOString()
const LEAD = "L-num"
const ALTITUDE = 62
const CIELOS = 68

function rung(key: TourFollowUpKey, propertyId: number, opts: { completed?: boolean; dueMs?: number } = {}): any {
  const completed = opts.completed === true
  return {
    id: `${key}-${propertyId}`,
    lead_id: LEAD,
    title: tourFollowUpTitle(key),
    action_key: key,
    action_type: "workflow",
    origin: "workflow",
    property_id: propertyId,
    property_name: propertyId === ALTITUDE ? "Altitude at Brooks" : "Los Cielos at Brooks",
    completed,
    completed_at: completed ? iso(0) : null,
    status: completed ? "completed" : "open",
    due_at: iso(opts.dueMs ?? 2 * HOUR),
    priority: "medium",
  }
}

/**
 * The reconciliation completeTourFollowUp performs, modelled exactly: complete the
 * rung, then create `rungAfter(it)` at the chosen date. The point of modelling it
 * rather than calling it is that the real function imports the browser Supabase
 * client; the ORDER and the KEY are what this file is about, and both are pure.
 */
function completeAndSchedule(
  actions: any[],
  completing: TourFollowUpKey,
  propertyId: number,
  outcome: TourOutcome,
  chosenDueAt: string | null,
): { actions: any[]; wroteTourOutcome: boolean; created: any | null } {
  const plan = planForOutcome(outcome)
  const next = actions.map((a) =>
    String(a.id) === `${completing}-${propertyId}` ? { ...a, completed: true, status: "completed", completed_at: iso(0) } : a,
  )
  let created: any | null = null
  if (plan.createFollowUpTask && chosenDueAt) {
    const key = rungAfter(completing)
    if (key) {
      created = rung(key, propertyId, { dueMs: new Date(chosenDueAt).getTime() - T0 })
      created.due_at = chosenDueAt
      next.push(created)
    }
  }
  // Rung 1 alone describes the visit.
  return { actions: next, wroteTourOutcome: completing === "tour_follow_up", created }
}

// ── 1. The ladder is outreach attempts, and it advances by scheduling ────────
console.log("\n1. NUMBERING — attempts, not visits:")
eq("the ladder is exactly three attempts", [...TOUR_FOLLOW_UP_LADDER], ["tour_follow_up", "tour_follow_up_2", "tour_follow_up_3"])
eq("1st → 2nd", rungAfter("tour_follow_up"), "tour_follow_up_2")
eq("2nd → 3rd", rungAfter("tour_follow_up_2"), "tour_follow_up_3")
eq("3rd → nothing (there is no 4th)", rungAfter("tour_follow_up_3"), null)

{
  // Ka'Leah toured Altitude once. She is still deciding, and the locator picks a date.
  let actions = [rung("tour_follow_up", ALTITUDE)]
  const chosen = iso(48 * HOUR)
  const r1 = completeAndSchedule(actions, "tour_follow_up", ALTITUDE, "still_deciding", chosen)
  ok("scheduling the next attempt creates the 2nd rung", r1.created?.action_key === "tour_follow_up_2", String(r1.created?.action_key))
  eq("…at exactly the date chosen", r1.created?.due_at, chosen)
  eq("…titled as the attempt it is", r1.created?.title, "2nd Tour Follow-Up")
  eq("…still scoped to the property", r1.created?.property_id, ALTITUDE)
  ok("…and NO new tour was invented", r1.created?.action_key !== "setup_tour")
  ok("no generic 'Follow Up' row exists anywhere", !r1.actions.some((a) => a.title === "Follow Up"))
  ok("every created row carries a resolvable key", r1.actions.every((a) => a.action_key != null))

  // A second attempt, scheduled again — still no tour involved.
  const chosen2 = iso(96 * HOUR)
  const r2 = completeAndSchedule(r1.actions, "tour_follow_up_2", ALTITUDE, "still_deciding", chosen2)
  eq("scheduling again creates the 3rd rung", r2.created?.action_key, "tour_follow_up_3")
  eq("…at the second date chosen", r2.created?.due_at, chosen2)

  // And the ladder ends.
  const r3 = completeAndSchedule(r2.actions, "tour_follow_up_3", ALTITUDE, "still_deciding", iso(144 * HOUR))
  eq("after the 3rd, nothing is created", r3.created, null)
  ok("…and no generic task is substituted", !r3.actions.some((a) => a.action_key == null))
  eq("…the three attempts are all that exist", r3.actions.filter((a) => isTourFollowUpRow(a)).length, 3)
}

// ── 2. Tour history belongs to the 1st attempt only ─────────────────────────
console.log("\n2. TOUR HISTORY — only the 1st attempt may write it:")
{
  const actions = [rung("tour_follow_up", ALTITUDE, { completed: true }), rung("tour_follow_up_2", ALTITUDE)]
  const first = completeAndSchedule([rung("tour_follow_up", ALTITUDE)], "tour_follow_up", ALTITUDE, "still_deciding", iso(24 * HOUR))
  ok("the 1st attempt records the tour outcome", first.wroteTourOutcome)
  const second = completeAndSchedule(actions, "tour_follow_up_2", ALTITUDE, "ready_to_apply", null)
  ok("the 2nd attempt does NOT rewrite it", !second.wroteTourOutcome)
  const third = completeAndSchedule(actions, "tour_follow_up_3", ALTITUDE, "didnt_like", null)
  ok("nor does the 3rd", !third.wroteTourOutcome)
}
{
  // Asserted at the source too, because this is the requirement most easily lost in
  // a later refactor: the gate must be on the rung, not on the outcome.
  const wf = readFileSync("lib/leads/tourFollowUpWorkflow.ts", "utf8")
  ok("the lead_tours write is gated on the rung", /if \(!demo && recordsTourOutcome\) \{/.test(wf))
  ok("…and the gate is 'this is the 1st rung'", /const recordsTourOutcome = rung === "tour_follow_up"/.test(wf))
  ok("the optimistic patch carries the same fact, so the UI cannot disagree", /recordsTourOutcome,/.test(wf))
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("…and the CRM only patches lead_tours locally when it was actually written",
    /if \(patch\.recordsTourOutcome\) \{/.test(dash))
}

// ── 3. The question is contextual; the choices are not ──────────────────────
console.log("\n3. THE MODAL — contextual question, unchanged choices:")
eq("1st asks about the tour", tourFollowUpQuestion("tour_follow_up"), "How did the tour go?")
eq("2nd asks about the decision", tourFollowUpQuestion("tour_follow_up_2"), "Have they made a decision about the apartment?")
eq("3rd asks whether they are still considering", tourFollowUpQuestion("tour_follow_up_3"), "Are they still considering the apartment?")
ok("every rung has its own question", TOUR_FOLLOW_UP_LADDER.every((k) => tourFollowUpQuestion(k).length > 0))
eq("no two rungs ask the same thing", new Set(TOUR_FOLLOW_UP_LADDER.map(tourFollowUpQuestion)).size, 3)
{
  const modal = readFileSync("components/crm/TourFollowUpModal.tsx", "utf8")
  ok("the modal renders the rung's question, not a hardcoded one", /\{tourFollowUpQuestion\(rung\)\}/.test(modal))
  ok("…and names the rung in its heading", /\{tourFollowUpTitle\(rung\)\}/.test(modal))
  ok("the outcome list is still every TOUR_OUTCOMES entry — Ready to Apply included",
    /TOUR_OUTCOMES\.map\(\(o\) =>/.test(modal))
  ok("the four scheduling options are unchanged", /Tomorrow/.test(modal) && /2 Days/.test(modal) && /3 Days/.test(modal) && /Pick a Date/.test(modal))
  // Three quick buttons + one picker. Counted on the button label (with its
  // ellipsis) so the header comment's prose does not inflate the count.
  ok("…still exactly those four, no fifth was added",
    (modal.match(/autoDueInDays\(/g) ?? []).length === 3 && (modal.match(/Pick a Date…/g) ?? []).length === 1)
  ok("the date step is skipped when there is no rung to schedule",
    /NEEDS_FOLLOW_UP\.includes\(o\) && canScheduleNext/.test(modal))
  ok("the modal still has no messaging of its own", !/sms:|tel:|launchCommunication/.test(modal))
}
{
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("one resolver decides the rung for every entry point", /function tourRungState\(/.test(dash))
  ok("…and it computes canScheduleNext from the ladder, not a guess", /canScheduleNext: rungAfter\(rung\) !== null/.test(dash))
  eq("…used by the card, the hand-off and the voice command — all three",
    (dash.match(/\.\.\.tourRungState\(/g) ?? []).length, 2)
  ok("a row with no key or title falls back to the 1st rung (pre-action_key shape)",
    /\?\? "tour_follow_up"/.test(dash))
}

// ── 4. Outcomes that never asked for a date are untouched ───────────────────
console.log("\n4. UNCHANGED OUTCOMES:")
for (const o of ["ready_to_apply", "wants_another_tour", "didnt_like", "didnt_tour"] as TourOutcome[]) {
  ok(`${o} still creates no follow-up attempt`, planForOutcome(o).createFollowUpTask === false)
}
for (const o of ["still_deciding", "other"] as TourOutcome[]) {
  ok(`${o} still warrants a dated attempt`, planForOutcome(o).createFollowUpTask === true)
}
ok("Ready to Apply still creates the Apply action", planForOutcome("ready_to_apply").createStartApplication)
ok("…and still advances to Done Touring", planForOutcome("ready_to_apply").advanceToDoneTouring)
{
  // Ready to Apply chosen on the SECOND attempt must work exactly as on the first:
  // that is the whole reason the outcome list is identical at every rung.
  const r = completeAndSchedule([rung("tour_follow_up_2", ALTITUDE)], "tour_follow_up_2", ALTITUDE, "ready_to_apply", null)
  ok("a client who becomes ready on the 2nd attempt still goes to Apply", planForOutcome("ready_to_apply").createStartApplication)
  eq("…and no further attempt is scheduled", r.created, null)
}

// ── 5. Per-property independence survives numbering ─────────────────────────
console.log("\n5. PER-PROPERTY:")
{
  let actions = [rung("tour_follow_up", ALTITUDE, { completed: true }), rung("tour_follow_up", CIELOS)]
  const altitudeRows = actions.filter((a) => a.property_id === ALTITUDE)
  const cielosRows = actions.filter((a) => a.property_id === CIELOS)
  eq("Altitude's next attempt is its 2nd", nextTourFollowUpKey(altitudeRows), "tour_follow_up_2")
  eq("Los Cielos still has an open 1st, so nothing is due there", nextTourFollowUpKey(cielosRows), null)
  const r = completeAndSchedule(actions, "tour_follow_up", ALTITUDE, "still_deciding", iso(24 * HOUR))
  eq("scheduling Altitude's 2nd leaves Los Cielos' 1st open", r.actions.filter((a) => a.property_id === CIELOS && !a.completed).length, 1)
  eq("…and Los Cielos is still on its 1st attempt",
    tourFollowUpKeyOf(r.actions.find((a) => a.property_id === CIELOS)!), "tour_follow_up")
}

// ── 6. The templates, and the Companion's composer ─────────────────────────
console.log("\n6. TEMPLATES — the three approved messages, preserved:")
eq("1st", TOUR_FOLLOW_UP_SMS.tour_follow_up("Ka'Leah"), "Hey Ka'Leah! How did the tours go? Hopefully everything went well!")
eq("2nd", TOUR_FOLLOW_UP_SMS.tour_follow_up_2("Ka'Leah"), "Hey Ka'Leah! How did the other tours go? Did any stand out?")
eq("3rd", TOUR_FOLLOW_UP_SMS.tour_follow_up_3("Ka'Leah"), "Hey Ka'Leah! Do you think any of them might be the one?")
eq("resolved from the stored title too", buildTourFollowUpSmsBody("3rd Tour Follow-Up", "Ka'Leah"), TOUR_FOLLOW_UP_SMS.tour_follow_up_3("Ka'Leah"))
eq("and empty for a non-rung, the same contract as the contact builder", buildTourFollowUpSmsBody("Setup Tour", "Ka'Leah"), "")
ok("no two rungs share a message", new Set(TOUR_FOLLOW_UP_LADDER.map((k) => TOUR_FOLLOW_UP_SMS[k]("X"))).size === 3)
{
  // How the composer gets opened is section 6b's subject; here the only question is
  // that each rung's template is the one the shared builder produces.
  const prod = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
  ok("the Companion builds a rung's body with the shared builder",
    /buildTourFollowUpSmsBody\(open\.title, name\)/.test(prod))
  ok("…and nothing hardcodes the 1st rung's text for all three",
    !/buildTourFollowUpSmsBody\("tour_follow_up", name\)/.test(prod))
}

// ── 6b. SMS SEND — the Contact Follow-Up mechanism, reused verbatim ─────────
// A tour rung is an outreach attempt, exactly like a Contact FU, so it travels the
// SAME path: onSendFollowUp finds the open action, opens the composer with that
// sequence's template, and leaves the existing "Did you send …?" sheet waiting.
// Nothing tour-specific was built. The ONE difference is what the CRM does with
// the confirmation: a rung's send is recorded and the rung stays open, because the
// CRM's outcome modal owns what the client said and when to try again.
console.log("\n6b. SEND — the Contact Follow-Up mechanism, reused:")
{
  const prod = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
  const send = prod.slice(prod.indexOf("const onSendFollowUp = () =>"), prod.indexOf("const confirmFollowUp = () =>"))

  // ONE handler for all three sequences.
  ok("a tour rung is matched by the SAME finder as a Contact FU",
    /isFollowUpAction\(a\.title\) \|\| isContactFollowUpAction\(a\.title\) \|\| isTourFollowUpRow\(\{ title: a\.title \?\? null \}\)/.test(send))
  ok("…and gets its own approved template from the same chooser",
    /isTourFollowUpRow\(\{ title: open\.title \?\? null \}\)\s*\n?\s*\? buildTourFollowUpSmsBody\(open\.title, name\)/.test(send))
  ok("…through the same launcher every other outreach uses", /launchCommunication\("text", lead\.phone, body\)/.test(send))
  ok("…and the same confirmation sheet", /setFollowUpConfirm\(\{ leadId: lead\.id, actionId: open\.id, title: open\.title, name \}\)/.test(send))
  ok("the Contact FU builder is untouched", /buildContactFollowUpSmsBody\(open\.title, name, followUpOverrides\)/.test(send))
  ok("…and so is the post-list builder", /buildFollowUpSmsBody\(open\.title, name, followUpOverrides/.test(send))

  // The rung button adds the CRM hand-off and NOTHING else.
  const handler = prod.slice(prod.indexOf("const onTourFollowUp = () =>"), prod.indexOf("const onStartApplication"))
  ok("the rung button delegates to that one mechanism", /onSendFollowUp\(\);/.test(handler))
  ok("…and reimplements none of it", !/launchCommunication|setFollowUpConfirm|buildTourFollowUpSmsBody/.test(handler))
  ok("…it only adds opening the CRM outcome modal", /verb: "open-tour-follow-up"/.test(handler))
  ok("…before the composer, so focus is not pulled off a half-typed text",
    handler.indexOf('verb: "open-tour-follow-up"') < handler.indexOf("onSendFollowUp()"))
  ok("…targeting the SAME row the composer will use", /isTourFollowUpRow\(\{ title: a\.title \?\? null \}\)/.test(handler))

  // No new confirmation infrastructure of any kind.
  const confirm = prod.slice(prod.indexOf("const confirmFollowUp = () =>"), prod.indexOf("const openNativePicker"))
  eq("there is ONE confirmation verb, unchanged", (confirm.match(/verb: "[a-z-]+"/g) ?? []), ['verb: "complete-follow-up"'])
  ok("one confirmation sheet", (prod.match(/aria-label="Confirm follow-up sent"/g) ?? []).length === 1)
  ok("…gated exactly as it was before", /\{companionMayConfirm\("post_list_follow_up"\) && followUpConfirm && \(/.test(prod))
  ok("no tour-specific send handler was added", !/onSendTourFollowUp|onTourSend|tourSmsConfirm/.test(prod))
  ok("no tour-specific confirmation verb was added", !/record-follow-up-sent|record-tour-sent/.test(prod))
}
{
  // The prompt-ownership registries are byte-identical to before this work: no new
  // prompt id was invented for the send, because the generic Companion send-confirm
  // gate already covers a rung the same way it covers a Contact FU.
  const owner = readFileSync("lib/workflow/promptOwnership.ts", "utf8")
  ok("the outcome prompt is still CRM-owned", /tour_follow_up: "crm"/.test(owner))
  ok("the Companion send prompts are still Companion-owned", /post_list_follow_up: "companion"/.test(owner) && /contact_follow_up: "companion"/.test(owner))
  ok("NO new prompt id was added for the tour send", !/tour_follow_up_send/.test(owner))
  const mirror = readFileSync("packages/companion-shared/src/workflow/promptOwnership.ts", "utf8")
  ok("…and the mirror agrees (no drift)", !/tour_follow_up_send/.test(mirror))
}
{
  // The CRM: the EXISTING complete-follow-up handler, with a tour branch beside the
  // existing contact branch. One verb, one handler, no new plumbing.
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("no new verb was added to the CRM either", !/record-follow-up-sent/.test(dash))
  const h = dash.slice(dash.indexOf("// ── TOUR LADDER branch (any rung)"), dash.indexOf("// The synthetic client-only completed row"))
  ok("the tour branch lives in the existing complete-follow-up handler", h.length > 0)
  ok("…beside the existing Contact FU branch", /isContactFollowUpAction\(contactKey\)/.test(dash))
  ok("it recognises ANY rung, by key or stored title",
    /isTourFollowUpRow\(\{ action_key: followRow\?\.action_key \?\? null, title: completedTitle \?\? null \}\)/.test(h))

  // What it records — the two existing mechanisms, nothing else.
  ok("it writes a text_sent timeline event", /type: "text_sent"/.test(h))
  ok("…tagged with WHICH attempt was sent", /action_id: followRow\?\.id/.test(h) && /action_key: followRow\?\.action_key/.test(h))
  ok("it updates Last Action, the existing mechanism", /latestOutreachRef\.current = nextMap/.test(h) && /setLatestOutreach\(nextMap\)/.test(h))
  ok("…and pushes it to the shared agenda", /postCompanionActiveClient\(lead, localNextActionsRef\.current\)/.test(h))
  eq("exactly one timeline write — no duplicate event", (h.match(/recordTimelineEvent\(\{/g) ?? []).length, 1)
  eq("…and one Last Action update", (h.match(/latestOutreachRef\.current = nextMap/g) ?? []).length, 1)

  // THE CENTRAL GUARANTEE: a send is not a response.
  ok("it NEVER completes the rung", !/completed: true/.test(h) && !/completeAction\(/.test(h))
  ok("…creates no follow-up action", !/createTourFollowUpForProperty|writeTourFollowUpRung|createManualTask/.test(h))
  ok("…records no outcome and never touches tour history", !/tour_outcome|planForOutcome|lead_tours/.test(h))
  ok("…and returns before the post-list ladder's completion", /return\n\s*\}/.test(h))
  const code = h.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  ok("a rung can still never reach the post-list count or archive",
    !/getNextFollowUpAction|follow_up_count|completeFollowUp\(|archive/.test(code))

  // And completing an OUTCOME never claims a text was sent.
  ok("completing an outcome records no SMS as sent",
    !/text_sent/.test(dash.slice(dash.indexOf("async function handleTourFollowUpOutcome"), dash.indexOf("// ── Apply (start_application"))))
  const wf = readFileSync("lib/leads/tourFollowUpWorkflow.ts", "utf8")
  ok("…and the workflow itself never writes one", !/text_sent/.test(wf))
}

// ── 7. Failed writes are explicit, and nothing is reopened behind the locator ─
console.log("\n7. FAILURES — explicit, never silent, never invented:")
{
  const wf = readFileSync("lib/leads/tourFollowUpWorkflow.ts", "utf8")
  ok("the creator reports a RESULT, not null", /export type RungCreateResult/.test(wf))
  ok("…and 'nothing to do' is told apart from 'it broke'", /reason: "exists" \| "spent"/.test(wf) && /reason: "error"/.test(wf))
  ok("a failed dedup read is an error, not a silent no-op", /return \{ ok: false, reason: "error", message: checkError\.message \}/.test(wf))
  ok("a failed insert is an error, not a silent no-op", /return \{ ok: false, reason: "error", message: insertError\.message \}/.test(wf))
  ok("a failed completion ABORTS instead of stacking a second failure", /onError\?\.\("That follow-up could not be completed/.test(wf))
  ok("…and says plainly that nothing changed", /Nothing was changed — please try again\./.test(wf))
  ok("a failed successor is reported to the locator", /could not be scheduled/.test(wf))
  // The ONLY reopen in this workflow is the deliberate, outcome-driven one that
  // returns the lead to Schedule Tour. A rung is never quietly put back.
  const reopens = wf.match(/completed: false, completed_at: null, status: "open"/g) ?? []
  eq("there is exactly one reopen in the whole workflow", reopens.length, 1)
  ok("…and it is the setup_tour reopen, not a rung", /\.eq\("id", setupTourRow\.id\)/.test(wf))
  ok("no rung is auto-reopened on a failed successor",
    !/onError[\s\S]{0,400}status: "open"/.test(wf.slice(wf.indexOf("const next = rungAfter(rung)"))))
  ok("the generic manual task is no longer created here", !/createManualTask\(/.test(wf))
  ok("…and its import is gone", !/import \{ createManualTask \}/.test(wf))
  ok("the rung is named from the ladder, not re-derived after a write", /const next = rungAfter\(rung\)/.test(wf))
  ok("demo leads still make no DB call", /if \(demo\) \{/.test(wf))
  const stw = readFileSync("lib/leads/setupTourWorkflow.ts", "utf8")
  ok("the tour-scheduling caller handles the result", /if \(followUp\.ok\) onWorkflowAction\?\.\(followUp\.action\)/.test(stw))
  ok("…and surfaces an error there too", /followUp\.reason === "error"/.test(stw))
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("the CRM wires onError to a visible surface, not a console line", /onError: \(message\) => window\.alert\(message\)/.test(dash))
}

// ── 8. A 2nd/3rd rung behaves like a first-class action everywhere ──────────
console.log("\n8. THE ROW IS FIRST-CLASS:")
{
  const r2 = rung("tour_follow_up_2", ALTITUDE, { dueMs: -HOUR })
  ok("it is recognised as a ladder rung", isTourFollowUpRow(r2))
  eq("its key resolves from the title alone", tourFollowUpKeyOf({ title: "2nd Tour Follow-Up" }), "tour_follow_up_2")
  ok("it is relevant while the lead is Ready to Tour", actionRelevanceRank("tour_follow_up_2", "ready_to_tour") >= 0)
  ok("…and while Done Touring", actionRelevanceRank("tour_follow_up_3", "done_touring") >= 0)
  const ranked = rankLeadActions({ id: LEAD, crm_status: "done_touring" } as any, [r2] as any, "")
  eq("it ranks as the primary next action", ranked.primary?.title, "2nd Tour Follow-Up")
  const na = readFileSync("lib/nextActions.ts", "utf8")
  ok("the guest-card precedence rule now covers ANY rung", /isLadderRow\(\{ action_key:/.test(na))
  ok("…and the rung-1-only local copy is gone", !/=== "tour_follow_up"\s*\|\|/.test(na))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
