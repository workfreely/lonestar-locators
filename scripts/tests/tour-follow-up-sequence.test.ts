/**
 * Per-property Tour Follow-Up ladder (Tour Follow-Up → 2nd → 3rd) — pure proofs.
 * No DB, no network, no side effects.
 *
 *   npx tsx scripts/tests/tour-follow-up-sequence.test.ts
 *
 * The regression this exists for: a COMPLETED follow-up used to block its property
 * permanently, because createTourFollowUpForProperty's dedup matched any row for
 * (lead, property, 'tour_follow_up') regardless of status — stricter than the
 * partial unique index it stood in for. Ka'Leah Davis (lead 84) toured Altitude at
 * Brooks, the follow-up was completed, she returned for another unit, and no second
 * follow-up could ever be created. §"Ka'Leah Davis" below is that exact shape.
 */
import {
  TOUR_FOLLOW_UP_LADDER,
  nextTourFollowUpKey,
  isTourFollowUpRow,
  tourFollowUpKeyOf,
  tourFollowUpTitle,
  isTourFollowUpSendAction,
  buildTourFollowUpSmsBody,
  TOUR_FOLLOW_UP_SMS,
} from "../../packages/companion-shared/src/index"
import { planForOutcome } from "../../lib/leads/tourFollowUp"
import { formatWorkflowActionLabel, isFollowUpAction, isContactFollowUpAction } from "../../lib/leads/workflowActionLabels"
import { actionRelevanceRank, RELEVANCE_FOREGROUND, RELEVANCE_BACKGROUND } from "../../lib/leads/actionRelevance"
import { readFileSync } from "node:fs"

let failures = 0
function ok(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error("✗", msg) } else { console.log("✓", msg) }
}
function eq(a: unknown, b: unknown, msg: string) { ok(a === b, `${msg}  (got ${JSON.stringify(a)})`) }

const open_ = (k: string) => ({ action_key: k, status: "open", completed: false })
const done = (k: string) => ({ action_key: k, status: "completed", completed: true })
const canceled = (k: string) => ({ action_key: k, status: "canceled", completed: false })

// ── 1. The three approved templates, verbatim, no emojis ──────────────────────
eq(TOUR_FOLLOW_UP_SMS.tour_follow_up("Ka'Leah"),
  "Hey Ka'Leah! How did the tours go? Hopefully everything went well!",
  "rung 1 renders the exact approved template with the first name")
eq(TOUR_FOLLOW_UP_SMS.tour_follow_up_2("Ka'Leah"),
  "Hey Ka'Leah! How did the other tours go? Did any stand out?",
  "rung 2 renders the exact approved template")
eq(TOUR_FOLLOW_UP_SMS.tour_follow_up_3("Ka'Leah"),
  "Hey Ka'Leah! Do you think any of them might be the one?",
  "rung 3 renders the exact approved template")
for (const k of TOUR_FOLLOW_UP_LADDER) {
  const body = TOUR_FOLLOW_UP_SMS[k]("Jordan")
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body), `${k} contains no emoji`)
  ok(body.includes("Jordan"), `${k} personalizes the first name`)
}
eq(TOUR_FOLLOW_UP_SMS.tour_follow_up("Ka'Leah").includes("Ka'Leah"), true,
  "an apostrophe in the name survives into the body unescaped")

// ── 2. Labels, everywhere the CRM shows them ──────────────────────────────────
eq(formatWorkflowActionLabel("tour_follow_up"), "Tour Follow-Up", "label rung 1")
eq(formatWorkflowActionLabel("tour_follow_up_2"), "2nd Tour Follow-Up", "label rung 2")
eq(formatWorkflowActionLabel("tour_follow_up_3"), "3rd Tour Follow-Up", "label rung 3")
// The Agenda renders the stored TITLE through the same formatter, so round-tripping
// title → key → label is what keeps the button and the agenda item identical.
for (const k of TOUR_FOLLOW_UP_LADDER) {
  eq(formatWorkflowActionLabel(tourFollowUpTitle(k)), formatWorkflowActionLabel(k),
    `${k}: stored title and key format to the same label (agenda == action button)`)
}
// The tour ladder must never be mistaken for the List-Sent or contact ladders.
for (const k of TOUR_FOLLOW_UP_LADDER) {
  ok(!isFollowUpAction(k), `${k} is NOT a List-Sent follow-up`)
  ok(!isContactFollowUpAction(k), `${k} is NOT a contact-chase follow-up`)
}

// ── 3. Row identification ─────────────────────────────────────────────────────
ok(isTourFollowUpRow({ action_key: "tour_follow_up_2" }), "identifies rung 2 by key")
ok(isTourFollowUpRow({ action_key: null, title: "3rd Tour Follow-Up" }), "identifies a legacy row by title")
ok(!isTourFollowUpRow({ action_key: "email_guest_card" }), "does not claim a guest card")
ok(!isTourFollowUpRow({ action_key: null, title: "Follow Up" }), "does not claim the generic manual Follow Up")
ok(!isTourFollowUpRow({ action_key: "follow_up_2" }), "does not claim List-Sent FU2")
eq(tourFollowUpKeyOf({ action_key: null, title: "2nd Tour Follow-Up" }), "tour_follow_up_2", "keyOf resolves a legacy title")
eq(tourFollowUpKeyOf({ action_key: "setup_tour" }), null, "keyOf refuses a non-rung")

// ── 4. Progression — counted from completed rows, never a counter ─────────────
eq(nextTourFollowUpKey([]), "tour_follow_up", "no history → rung 1")
eq(nextTourFollowUpKey([done("tour_follow_up")]), "tour_follow_up_2",
  "THE REGRESSION: a completed rung 1 no longer blocks — it yields rung 2")
eq(nextTourFollowUpKey([done("tour_follow_up"), done("tour_follow_up_2")]), "tour_follow_up_3",
  "two completed → rung 3")
eq(nextTourFollowUpKey([done("tour_follow_up"), done("tour_follow_up_2"), done("tour_follow_up_3")]), null,
  "the ladder STOPS after the third")
eq(nextTourFollowUpKey([open_("tour_follow_up")]), null,
  "an open rung blocks a duplicate open reminder")
eq(nextTourFollowUpKey([done("tour_follow_up"), open_("tour_follow_up_2")]), null,
  "an open later rung blocks too")
eq(nextTourFollowUpKey([canceled("tour_follow_up")]), "tour_follow_up",
  "a canceled rung neither blocks nor advances the ladder")
eq(nextTourFollowUpKey([done("email_guest_card"), done("follow_up_1"), done("setup_tour")]), "tour_follow_up",
  "unrelated completed actions do not advance the ladder")
// Order independence: the rows arrive in whatever order PostgREST returns them.
eq(nextTourFollowUpKey([done("tour_follow_up_2"), done("tour_follow_up")]), "tour_follow_up_3",
  "progression does not depend on row order")

// ── 5. Property scoping / repeat tours at one property ────────────────────────
// The resolver is handed ONE property's rows, which is what makes two properties
// independent. Altitude is on its second rung while Los Cielos has not started.
const altitude = [done("tour_follow_up")]
const losCielos: ReturnType<typeof done>[] = []
eq(nextTourFollowUpKey(altitude), "tour_follow_up_2", "Altitude advances to rung 2")
eq(nextTourFollowUpKey(losCielos), "tour_follow_up", "Los Cielos is unaffected and starts at rung 1")
// A different UNIT at the same property is the same property — it advances the
// same ladder rather than starting a new one.
eq(nextTourFollowUpKey([done("tour_follow_up")]), "tour_follow_up_2",
  "a repeat tour at the same property (another unit) advances the ladder")

// ── 6. Stage relevance — Applied/Closed demote without deleting ───────────────
const atStage = (crm_status: string, action_key: string) =>
  actionRelevanceRank({ crm_status } as never, { action_key } as never)
for (const k of TOUR_FOLLOW_UP_LADDER) {
  eq(atStage("ready_to_tour", k), RELEVANCE_FOREGROUND, `${k} is foreground in Ready to Tour`)
  eq(atStage("done_touring", k), RELEVANCE_FOREGROUND, `${k} is foreground in Done Touring`)
  eq(atStage("applied", k), RELEVANCE_BACKGROUND, `${k} is demoted in Applied`)
  eq(atStage("closed", k), RELEVANCE_BACKGROUND, `${k} is demoted in Closed`)
}
eq(atStage("applied", "check_application"), RELEVANCE_FOREGROUND,
  "the application action outranks any open tour reminder in Applied")
// Demotion is not deletion: a denied application regresses the objective to touring
// and the open rung becomes foreground again on its own.
eq(actionRelevanceRank({ crm_status: "applied", application_status: "denied" } as never,
  { action_key: "tour_follow_up_2" } as never), RELEVANCE_FOREGROUND,
  "a denied application re-promotes the open rung (nothing was destroyed)")

// ── 7. Creation is never triggered by completion ──────────────────────────────
// planForOutcome is the only thing that decides another follow-up is warranted, and
// it produces the dated manual task — NOT a ladder rung. Completing a rung calls
// none of this.
for (const o of ["ready_to_apply", "wants_another_tour", "didnt_like", "didnt_tour"] as const) {
  eq(planForOutcome(o).createFollowUpTask, false, `${o} creates no follow-up task`)
}
for (const o of ["still_deciding", "other"] as const) {
  eq(planForOutcome(o).createFollowUpTask, true, `${o} warrants a dated follow-up task`)
}

// ── 8. Ka'Leah Davis (lead 84) — the real regression shape ────────────────────
// action 137: tour_follow_up for Altitude (property 62), completed 2026-10-24.
// action 144: the generic manual "Follow Up" planForOutcome('other') created —
//             NOT a rung, and must not be mistaken for one.
const kaleahAltitude = [
  { action_key: "tour_follow_up", status: "completed", completed: true },
  { action_key: null, title: "Follow Up", status: "open", completed: false },
]
ok(!isTourFollowUpRow(kaleahAltitude[1]), "her open generic Follow Up is not a ladder rung")
eq(nextTourFollowUpKey(kaleahAltitude), "tour_follow_up_2",
  "her second visit to Altitude can now create a 2nd Tour Follow-Up")
eq(nextTourFollowUpKey([...kaleahAltitude, open_("tour_follow_up_2")]), null,
  "...and once created, it cannot be created twice")

// ── 9. ONE send/confirm path, and it is the existing Companion one ───────────
// Rungs 2 and 3 are "send a text, confirm it went" steps — the same shape as the
// post-list and contact ladders — so they travel the Companion path those already
// use. Rung 1 is excluded on purpose: its prompt is the CRM outcome modal, which
// records the outcome, Top Pick and stage advance a bare "yes, sent" would skip.
ok(!isTourFollowUpSendAction("tour_follow_up"), "rung 1 does NOT take the send/confirm path")
ok(isTourFollowUpSendAction("tour_follow_up_2"), "rung 2 takes the send/confirm path")
ok(isTourFollowUpSendAction("tour_follow_up_3"), "rung 3 takes the send/confirm path")
ok(isTourFollowUpSendAction("2nd Tour Follow-Up"), "…resolved from the stored title too")
ok(!isTourFollowUpSendAction("Tour Follow-Up"), "…and rung 1's title is still excluded")
ok(!isTourFollowUpSendAction("FU2"), "a post-list follow-up is not a tour rung")
ok(!isTourFollowUpSendAction("Contact FU2"), "a contact attempt is not a tour rung")
eq(buildTourFollowUpSmsBody("2nd Tour Follow-Up", "Ka'Leah"),
  "Hey Ka'Leah! How did the other tours go? Did any stand out?",
  "the builder renders rung 2 from its title")
eq(buildTourFollowUpSmsBody("Setup Tour", "Ka'Leah"), "",
  "the builder returns empty for a non-rung, like the contact builder")

// The prompt-ownership registry is the thing that decided rung 1 belongs to the CRM.
const owner = readFileSync("packages/companion-shared/src/workflow/promptOwnership.ts", "utf8")
ok(/tour_follow_up: "crm"/.test(owner), "tour_follow_up is still a CRM-owned prompt")
ok(/post_list_follow_up: "companion"/.test(owner), "post-list follow-up is still Companion-owned")

// ── 10. NO duplicate control was added ───────────────────────────────────────
const panel = readFileSync("components/crm/LeadPanel.tsx", "utf8")
ok(!/tourFuConfirm|handleTourFollowUpSent|TOUR_FOLLOW_UP_SMS/.test(panel),
  "LeadPanel has NO tour-follow-up SMS or confirmation of its own")
ok(!/Did you follow up on the tour\?/.test(panel),
  "…and no second confirmation popup")
const lpv = readFileSync("apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx", "utf8")
ok(/isTourFollowUpSendAction\(openAction\?\.title\)/.test(lpv),
  "rungs 2/3 reuse the EXISTING Send Follow-Up button")
ok((lpv.match(/onSendFollowUp\(\)/g) ?? []).length === 1,
  "…and there is still exactly one of it")
ok(/isTourFollowUp && onTourFollowUp/.test(lpv),
  "rung 1 still opens the canonical CRM outcome modal")
const prod = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
ok(/buildTourFollowUpSmsBody\(open\.title, name\)/.test(prod),
  "the existing onSendFollowUp builds the tour body")
ok((prod.match(/setFollowUpConfirm\(\{/g) ?? []).length === 1,
  "one confirmation sheet, reused — no new sheet was added")

// ── 10b. Rung 1: the text IS connected, and it added nothing else ────────────
// The locator was retyping the approved first template by hand (Ka'Leah, Oct 24
// 16:19) because the button only ever opened the outcome form. It now launches the
// same template the 2nd/3rd rungs use, through the SAME builder, from the SAME
// button — and the CRM outcome modal remains the only thing that completes the row.
eq(buildTourFollowUpSmsBody("tour_follow_up", "Ka'Leah"),
  "Hey Ka'Leah! How did the tours go? Hopefully everything went well!",
  "rung 1 builds the approved first template")
eq(buildTourFollowUpSmsBody("Tour Follow-Up", "Ka'Leah"),
  buildTourFollowUpSmsBody("tour_follow_up", "Ka'Leah"),
  "…from its stored title too")
const tfHandler = prod.slice(prod.indexOf("const onTourFollowUp = () =>"), prod.indexOf("const onStartApplication"))
ok(/buildTourFollowUpSmsBody\("tour_follow_up", name\)/.test(tfHandler),
  "the existing Tour Follow-Up button launches the first template")
ok(/launchCommunication\("text", lead\.phone,/.test(tfHandler),
  "…through the same launcher every other outreach uses")
ok(/verb: "open-tour-follow-up"/.test(tfHandler),
  "…and still hands off to the canonical CRM outcome modal")
ok(tfHandler.indexOf('verb: "open-tour-follow-up"') < tfHandler.indexOf("launchCommunication("),
  "the modal is opened BEFORE the composer, so focus is not pulled off a half-typed text")
ok(!/setFollowUpConfirm|setPendingContact/.test(tfHandler),
  "rung 1 opens NO Companion confirmation sheet — the modal is its prompt")
ok(!/completeAction|complete-follow-up/.test(tfHandler),
  "…and completes nothing itself")
// The outcome modal must stay a pure decision form — no second texting path in it.
const modal = readFileSync("components/crm/TourFollowUpModal.tsx", "utf8")
ok(!/sms:|tel:|launchCommunication|openSMS/.test(modal),
  "the outcome modal still has no messaging of its own")
// Exactly one Tour Follow-Up button in the Companion, still routed to the modal.
ok((lpv.match(/onTourFollowUp\(\)/g) ?? []).length === 1,
  "there is still exactly one Tour Follow-Up button")

// ── 11. Completion does the right thing, and only that ───────────────────────
const dash = readFileSync("components/crm/DashboardClient.tsx", "utf8")
const tourBranch = dash.slice(dash.indexOf("// ── TOUR LADDER branch"), dash.indexOf("// The synthetic client-only completed row"))
ok(/completeAction\(supabase, followRow\.id, now\)/.test(tourBranch),
  "it completes the exact captured rung by id")
ok(/type: "text_sent"/.test(tourBranch), "it records the text")
ok(tourBranch.indexOf("completeAction(") < tourBranch.indexOf('type: "text_sent"'),
  "…only after the completion lands")
// Comment lines stripped first: the branch's own prose NAMES the things it must not
// do, and matching that prose would pass or fail for the wrong reason.
const tourCode = tourBranch.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
ok(!/getNextFollowUpAction|follow_up_count|completeFollowUp\(|archive/.test(tourCode),
  "it creates NO successor and never touches the post-list ladder's count or archive")
ok(/postCompanionActiveClient\(lead, marked\)/.test(tourBranch),
  "it updates the shared agenda on both surfaces")

// ── 12. The other sequences are untouched ────────────────────────────────────
ok(/isContactFollowUpAction\(contactKey\)/.test(dash), "the contact-FU branch is unchanged")
ok(/completeFollowUp\(\{/.test(dash), "the post-list completion is unchanged")
const mig = readFileSync("supabase/migrations/20261111000000_tour_follow_up_sequence.sql", "utf8")
for (const k of ["tour_follow_up_2", "tour_follow_up_3"]) {
  ok(mig.includes(`'${k}'`), `migration adds ${k} to the key vocabulary`)
}
ok(/not in \('email_guest_card', 'tour_follow_up', 'tour_follow_up_2', 'tour_follow_up_3'\)/.test(mig),
  "the new rungs are excluded from the one-open-per-lead index (multi-property safe)")
const wf = readFileSync("lib/leads/tourFollowUpWorkflow.ts", "utf8")
ok(!/\.eq\("action_key",\s*"tour_follow_up"\)/.test(wf), "the single-key dedup query is gone")
ok(/nextTourFollowUpKey\(/.test(wf), "creation routes through the ladder resolver")

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
