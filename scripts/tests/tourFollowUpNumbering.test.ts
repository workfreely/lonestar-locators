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
  TOUR_OUTCOMES,
  isTourOutcome,
  formatWorkflowActionLabel,
  buildTourFollowUpSmsBody,
  TOUR_FOLLOW_UP_SMS,
  type TourFollowUpKey,
} from "@bc/companion-shared"
import { planForOutcome, AWAITING_REPLY_PLAN, WAITING_FOR_REPLY, isAwaitingReply } from "@/lib/leads/tourFollowUp"
import { rankLeadActions } from "@/lib/nextActions"
import { actionRelevanceRank } from "@/lib/leads/actionRelevance"
import { TOUR_OUTCOME_LABELS, type TourOutcome } from "@bc/companion-shared"

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
    /NEEDS_FOLLOW_UP\.includes\(pending\) && canScheduleNext/.test(modal))
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
eq("2nd", TOUR_FOLLOW_UP_SMS.tour_follow_up_2("Ka'Leah"), "Hey Ka'Leah! How did the other tours go? Did any of them seem like a good fit?")
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

  // The rung button adds NOTHING — it is the Contact Follow-Up path verbatim.
  const handler = prod.slice(prod.indexOf("const onTourFollowUp = () =>"), prod.indexOf("const onStartApplication"))
  ok("the rung button delegates to that one mechanism", /onSendFollowUp\(\);/.test(handler))
  ok("…and reimplements none of it", !/launchCommunication|setFollowUpConfirm|buildTourFollowUpSmsBody/.test(handler))

  // No new confirmation infrastructure of any kind.
  const confirm = prod.slice(prod.indexOf("const confirmFollowUp = () =>"), prod.indexOf("const openNativePicker"))
  eq("there is ONE confirmation verb, unchanged", (confirm.match(/verb: "[a-z-]+"/g) ?? []), ['verb: "complete-follow-up"'])
  ok("one confirmation sheet", (prod.match(/aria-label="Confirm follow-up sent"/g) ?? []).length === 1)
  ok("…gated exactly as it was before", /\{companionMayConfirm\("post_list_follow_up"\) && followUpConfirm && \(/.test(prod))
  ok("no tour-specific send handler was added", !/onSendTourFollowUp|onTourSend|tourSmsConfirm/.test(prod))
  ok("no tour-specific confirmation verb was added", !/record-follow-up-sent|record-tour-sent/.test(prod))
}
// ── 6c. ORDER OF OPERATIONS — the modal opens only on a CONFIRMED send ──────
// The reported defect: clicking a rung opened the CRM outcome modal immediately,
// before the agent had answered the Companion's "Did you send …?" sheet. So the
// modal appeared for a text that had not gone out, and Cancel left it sitting
// there. The hand-off was not duplicated or rebuilt — it MOVED from the click to
// the confirmed-send point, and the CRM, which owns the modal, now opens it there.
//
//   click  →  composer opens with the rung's template  →  sheet waits
//   Yes, Sent  →  text_sent recorded  →  THEN the outcome modal
//   Cancel     →  no verb posted at all → no send, no modal, rung still open
console.log("\n6c. ORDER — send first, modal only once the send is confirmed:")
{
  const prod = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
  const handler = prod.slice(prod.indexOf("const onTourFollowUp = () =>"), prod.indexOf("const onStartApplication"))

  // 1. The click no longer opens the modal, for any rung.
  ok("the click posts NO modal hand-off", !/verb: "open-tour-follow-up"/.test(handler))
  ok("…and posts no verb of any kind", !/verb: "/.test(handler))
  ok("…and no longer steals focus before the composer", !/focusExistingCrmTab\(\)/.test(handler))
  ok("the whole handler is now just the shared send", /=> \{\s*\n\s*onSendFollowUp\(\);\s*\n\s*\};/.test(handler))

  // 2. The confirmed send is the only place the modal is opened from.
  const confirm = prod.slice(prod.indexOf("const confirmFollowUp = () =>"), prod.indexOf("const openNativePicker"))
  ok("Yes, Sent still posts exactly the one existing verb",
    (confirm.match(/verb: "[a-z-]+"/g) ?? []).join() === 'verb: "complete-follow-up"')
  ok("…and brings the CRM tab forward for a rung, where the modal will open",
    /if \(isTourFollowUpRow\(\{ title: c\.title \?\? null \}\)\) focusExistingCrmTab\(\);/.test(confirm))
  ok("…and does that ONLY for a rung, so Contact/post-list are untouched",
    (confirm.match(/focusExistingCrmTab\(\)/g) ?? []).length === 1)

  // 3. Cancel is inert: it closes the sheet and is not wired to the confirm handler,
  //    so it posts no verb — and the CRM, which is the only thing that opens the
  //    modal now, never hears about it.
  const sheetStart = prod.indexOf('aria-label="Confirm follow-up sent"')
  const sheet = prod.slice(sheetStart, sheetStart + 2600)
  ok("the sheet still offers Yes, Sent", /\{isContactFollowUpAction\(followUpConfirm\.title\) \? "Yes, Done" : "Yes, Sent"\}/.test(sheet))
  ok("…and Cancel", /Cancel\s*\n?\s*<\/button>/.test(sheet))
  ok("only the affirmative choice is wired to the confirm handler",
    (sheet.match(/onClick=\{confirmFollowUp\}/g) ?? []).length === 1)
  ok("…and Cancel only closes the sheet", /onClick=\{\(\) => setFollowUpConfirm\(null\)\} style=\{SHEET_CANCEL_BTN\}/.test(sheet))
  ok("…so Cancel reaches no verb, no send and no modal", !/confirmFollowUp[\s\S]{0,200}SHEET_CANCEL_BTN/.test(sheet.slice(sheet.indexOf("SHEET_CANCEL_BTN"))))
  // The prompt names the rung the agent actually clicked.
  ok("the prompt asks about the numbered rung by name",
    /Did you send the \$\{formatWorkflowActionLabel\(followUpConfirm\.title\)\}\?/.test(sheet))
  eq("…which for rung 2 reads as the approved wording", `Did you send the ${formatWorkflowActionLabel("2nd Tour Follow-Up")}?`, "Did you send the 2nd Tour Follow-Up?")
  eq("…and for rung 3", `Did you send the ${formatWorkflowActionLabel("3rd Tour Follow-Up")}?`, "Did you send the 3rd Tour Follow-Up?")
  eq("…and for rung 1", `Did you send the ${formatWorkflowActionLabel("Tour Follow-Up")}?`, "Did you send the Tour Follow-Up?")

  // 4. The CRM opens the modal AFTER recording the send, in the same branch.
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  const branch = dash.slice(dash.indexOf("// ── TOUR LADDER branch (any rung)"), dash.indexOf("// The synthetic client-only completed row"))
  ok("the confirmed-send branch opens the outcome modal", /openTourFollowUpForAction\(lead, payload\.actionId/.test(branch))
  ok("…strictly AFTER the send has been recorded",
    branch.indexOf("type: \"text_sent\"") < branch.indexOf("openTourFollowUpForAction("))
  ok("…and after Last Action, so the Companion reflects the send too",
    branch.indexOf("setLatestOutreach(nextMap)") < branch.indexOf("openTourFollowUpForAction("))
  ok("…and the rung is still NOT completed by the send", !/completed: true/.test(branch))

  // 5. One hand-off, shared — not a second copy beside the verb handler.
  eq("the hand-off is defined exactly once", (dash.match(/function openTourFollowUpForAction\(/g) ?? []).length, 1)
  eq("…and reached from exactly the two entry points",
    (dash.match(/openTourFollowUpForAction\(lead, /g) ?? []).length, 2)
  ok("the open-tour-follow-up verb still works, through that same hand-off",
    /payload\.verb === "open-tour-follow-up"\) \{\s*\n\s*openTourFollowUpForAction\(lead, payload\.actionId\)/.test(dash))
  ok("…and the verb is still allowed through the gate", /payload\.verb !== "open-tour-follow-up"/.test(dash))
  ok("no second modal opener was introduced", (dash.match(/openTourFollowUp\(lead, tour, fav/g) ?? []).length === 1)
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
    /isTourFollowUpRow\(\{ action_key: sentRow\?\.action_key \?\? null, title: completedTitle \?\? null \}\)/.test(h))
  // The id Companion captured is the authority, so attribution survives the agent
  // answering the CRM outcome modal BEFORE tapping "Yes, Sent" (which completes the
  // rung, after which the shared open-rows resolver can no longer find it).
  ok("…resolved from the id Companion captured, not from the title",
    /payload\.actionId != null && String\(a\.id\) === String\(payload\.actionId\)/.test(h))
  ok("…falling back to the shared resolver only if that id finds nothing",
    /\?\?\s*\n?\s*followRow \?\?\s*\n?\s*null/.test(h))

  // What it records — the two existing mechanisms, nothing else.
  ok("it writes a text_sent timeline event", /type: "text_sent"/.test(h))
  ok("…tagged with WHICH attempt was sent", /action_id: payload\.actionId \?\? sentRow\?\.id \?\? null/.test(h) && /action_key: sentRow\?\.action_key/.test(h))
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
  ok("…and the workflow itself never writes one", !/type:\s*["']text_sent["']/.test(wf))
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

// ── 9. WAITING FOR REPLY — a status, never a client decision ────────────────
// It means the numbered attempt was SENT and the client has not answered. That is
// a fact about our outreach. It must never become a tour outcome, never reach
// lead_tours, and never appear in history as though the tour had been reported on.
console.log("\n9. WAITING FOR REPLY:")
{
  // 1. It is NOT a seventh TourOutcome — the six and their order are untouched,
  //    and the DB CHECK that mirrors them needs no migration.
  eq("the six outcomes are unchanged, in order", [...TOUR_OUTCOMES],
    ["ready_to_apply", "still_deciding", "wants_another_tour", "didnt_like", "didnt_tour", "other"])
  ok("waiting_for_reply is NOT a TourOutcome", !(TOUR_OUTCOMES as readonly string[]).includes(WAITING_FOR_REPLY))
  ok("…and isTourOutcome rejects it", !isTourOutcome(WAITING_FOR_REPLY))
  ok("…but it IS a modal status", isAwaitingReply(WAITING_FOR_REPLY))
  ok("…and no real outcome is mistaken for it", TOUR_OUTCOMES.every((o) => !isAwaitingReply(o)))
  ok("every one of the six still has its own plan", TOUR_OUTCOMES.every((o) => planForOutcome(o) != null))

  // 2. Its plan advances the ladder and touches nothing else.
  eq("it keeps Top Pick", AWAITING_REPLY_PLAN.topPick, "keep")
  ok("…does not advance the stage", !AWAITING_REPLY_PLAN.advanceToDoneTouring)
  ok("…creates no Apply action", !AWAITING_REPLY_PLAN.createStartApplication)
  ok("…does not reopen Schedule Tour", !AWAITING_REPLY_PLAN.reopenSetupTour)
  ok("…and schedules the next numbered attempt", AWAITING_REPLY_PLAN.createFollowUpTask)

  // 3. The workflow: no tour write at ANY rung, and NO tour_outcome event.
  const wf = readFileSync("lib/leads/tourFollowUpWorkflow.ts", "utf8")
  ok("the flag is carried as an option, not inferred", /awaitingReply\?: boolean/.test(wf))
  ok("…and the outcome may legitimately be null", /outcome: TourOutcome \| null/.test(wf))
  ok("a null outcome is treated as awaiting too", /const awaiting = awaitingReply === true \|\| outcome == null/.test(wf))
  ok("it uses the shared plan, not a parallel branch", /const plan = awaiting \? AWAITING_REPLY_PLAN : planForOutcome/.test(wf))
  ok("rung 1 loses its permission to write the tour while awaiting",
    /const recordsTourOutcome = rung === "tour_follow_up" && !awaiting/.test(wf))
  ok("…so lead_tours is still written ONLY behind that gate", /if \(!demo && recordsTourOutcome\) \{/.test(wf))
  ok("NO tour_outcome event is appended while awaiting", /if \(!awaiting\) \{\s*\n\s*recordTimelineEvent\(\{\s*\n\s*leadId: lead\.id,\s*\n\s*type: "tour_outcome"/.test(wf))
  eq("…and there is still exactly one tour_outcome write in the file",
    (wf.match(/type: "tour_outcome"/g) ?? []).length, 1)
  ok("the optimistic patch can carry no outcome", /tourOutcome: TourOutcome \| null/.test(wf))

  // 4. The CRM sends no outcome when awaiting, and pre-selects ONLY on a confirmed send.
  const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  ok("the handler takes a status, not an outcome", /handleTourFollowUpOutcome\(status: TourFollowUpStatus/.test(dash))
  ok("…resolves the flag from it", /const awaitingReply = isAwaitingReply\(status\)/.test(dash))
  ok("…and sends NO outcome while awaiting",
    /const outcome: TourOutcome \| null = awaitingReply \? null : \(status as TourOutcome\)/.test(dash))
  ok("the flag reaches the workflow", /\n\s*awaitingReply,\n/.test(dash))
  ok("pre-selection comes from the open's provenance", /defaultWaitingForReply=\{tourFollowUp\?\.fromConfirmedSend === true\}/.test(dash))
  ok("…set true ONLY at the confirmed-send call site",
    /openTourFollowUpForAction\(lead, payload\.actionId \?\? sentRow\?\.id \?\? null, true\)/.test(dash))
  ok("…and the open-tour-follow-up verb does NOT pre-select",
    /openTourFollowUpForAction\(lead, payload\.actionId\)\n/.test(dash))
  eq("exactly one call site pre-selects", (dash.match(/openTourFollowUpForAction\(lead, [^)]*, true\)/g) ?? []).length, 1)

  // 5. The modal: selecting never submits, and the 3rd rung creates nothing.
  const modal = readFileSync("components/crm/TourFollowUpModal.tsx", "utf8")
  ok("pre-selection is a selection, not a submission", /setPending\(defaultWaitingForReply \? WAITING_FOR_REPLY : null\)/.test(modal))
  ok("nothing submits without an explicit Confirm", /onClick=\{confirm\}/.test(modal))
  ok("…and Confirm is disabled until a status is chosen", /const canConfirm = pending != null/.test(modal))
  ok("…and until a date is chosen, when one is asked for", /\(!wantsDate \|\| dueAt != null\)/.test(modal))
  ok("selecting an outcome no longer submits on click", !/onClick=\{\(\) => chooseOutcome/.test(modal))
  ok("Waiting for Reply asks for a date like Still Deciding / Other",
    /NEEDS_FOLLOW_UP: TourFollowUpStatus\[\] = \["still_deciding", "other", WAITING_FOR_REPLY\]/.test(modal))
  ok("on the LAST rung it creates nothing and completes nothing",
    /const ladderEndsWaiting = pending === WAITING_FOR_REPLY && !canScheduleNext/.test(modal) &&
    /if \(ladderEndsWaiting\) \{\s*\n\s*onClose\(\)\s*\n\s*return\s*\n\s*\}/.test(modal))
  ok("…and says so, rather than leaving a dead button", /stays open while you wait/.test(modal))
  ok("no fourth rung and no Pause Search were invented",
    !/tour_follow_up_4|pause_search|pauseSearch/.test(modal) && !/tour_follow_up_4|pause_search/.test(wf))
  // A date discarded when switching to a status that takes none can never be sent.
  ok("a stale date cannot ride along with a dateless status",
    /if \(!NEEDS_FOLLOW_UP\.includes\(status\)\) \{\s*\n\s*setDueAt\(null\)/.test(modal))
  ok("…and the submit sends a date only when one was asked for", /followUpDueAt: wantsDate \? dueAt : null/.test(modal))

  // 6. Layout: two columns in the EXISTING order, Waiting for Reply spanning below.
  ok("the six render from TOUR_OUTCOMES, so their order cannot drift", /TOUR_OUTCOMES\.map\(\(o\) =>/.test(modal))
  ok("…in two columns", /grid grid-cols-2 gap-2/.test(modal))
  ok("Waiting for Reply spans both columns", /col-span-2 \$\{outcomeBtn\(pending === WAITING_FOR_REPLY\)\}/.test(modal))
  ok("…and is not rendered from the outcome list", !/TOUR_OUTCOMES[\s\S]{0,120}WAITING_FOR_REPLY/.test(modal))
  ok("the four scheduling choices sit in ONE row", /flex flex-wrap gap-2 sm:flex-nowrap/.test(modal))

  // 6b. Responsive presentation. Desktop: six labels on one line, four dates on one
  // row. Mobile: the three day shortcuts are hidden and the picker is the only
  // control. Nothing about the statuses, the keys or the workflow is conditional.
  ok("no outcome label is truncated any more", !/truncate">\{labelFor|truncate">Waiting/.test(modal))
  ok("…and above sm each sits on one line", (modal.match(/leading-tight sm:whitespace-nowrap/g) ?? []).length === 2)
  // 540px is the measured fit for the longest real header, not a round number.
  ok("the modal is the measured width", /max-w-\[540px\]/.test(modal))
  ok("…and the heading still truncates rather than wrapping", /truncate text-\[18px\] font-bold/.test(modal))
  // Waiting for Reply now reads FIRST, and must still not come from the six.
  ok("Waiting for Reply is rendered before the outcome list",
    modal.indexOf("pick(WAITING_FOR_REPLY)") < modal.indexOf("TOUR_OUTCOMES.map((o) =>"))
  ok("…and both indexes are real, not -1", modal.indexOf("pick(WAITING_FOR_REPLY)") > 0 && modal.indexOf("TOUR_OUTCOMES.map((o) =>") > 0)
  ok("quick-date labels can never wrap", /flex-1 basis-auto whitespace-nowrap/.test(modal))
  eq("below sm exactly the three day shortcuts are hidden", (modal.match(/hidden sm:block/g) ?? []).length, 3)
  ok("…and Pick a Date… is the one date control that is never hidden",
    /className=\{quickBtn\(dueLabel === "Pick a Date"\)\}/.test(modal))
  ok("…so every hidden shortcut is a quick date, not a status or a Confirm",
    modal.split("\n").filter((l) => l.includes("hidden sm:block")).every((l) => l.includes("autoDueInDays(")))
  // The shorter label is presentation. The key, the plan and every other surface's
  // label have to be byte-identical, or this is a workflow change in disguise.
  ok("Touring Again is a display override local to this modal",
    /MODAL_OUTCOME_LABELS: Partial<Record<TourOutcome, string>> = \{ wants_another_tour: "Touring Again" \}/.test(modal))
  ok("…falling back to the canonical label for the other five",
    /MODAL_OUTCOME_LABELS\[o\] \?\? TOUR_OUTCOME_LABELS\[o\]/.test(modal))
  eq("…and the shared label is untouched", TOUR_OUTCOME_LABELS.wants_another_tour, "Wants Another Tour")
  ok("…and the key never changes", /TOUR_OUTCOMES\.map\(\(o\) =>/.test(modal) && !/"Touring Again"[\s\S]{0,40}pick\(/.test(modal))
  ok("…and no workflow file learned the display label",
    !/Touring Again/.test(wf) && !/Touring Again/.test(readFileSync("lib/leads/tourFollowUp.ts", "utf8")))
  ok("…and the modal is one screen — no step machine", !/step === "outcome"/.test(modal) && !/setStep\(/.test(modal))
  ok("…so Back is gone", !/← Back/.test(modal))
  ok("the note field is still Other-only", /\{pending === "other" && \(/.test(modal))
  ok("the contextual question per rung is preserved", /\{tourFollowUpQuestion\(rung\)\}/.test(modal))
  ok("the body scrolls rather than clipping on short screens", /overflow-y-auto/.test(modal))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
