/**
 * Follow-Up Agent — Phase 1 engine proofs (pure logic, no DB / no side effects).
 * Covers copy, pacing, sequence selection, the deterministic send gate, and the
 * reconciler — including the double-text exception and conversation-overrides.
 *
 *   npx tsx scripts/tests/followup-engine.test.ts
 */
import {
  renderNewLeadText1,
  NEW_LEAD_TEXT2,
  listFu3,
  LIST_FU3_WITH_FAVORITES,
  LIST_FU3_NO_FAVORITES,
  FINAL_PAUSE,
  DONE_SELECTING_A_AVAILABILITY_SUBMITTED,
  DONE_SELECTING_B_NEEDS_AVAILABILITY,
  DONE_SELECTING_C_FAR_OUT,
  POST_TOUR,
  APPLICATION_STATUS,
} from "../../lib/followup/copy"
import {
  withinMorningWindow,
  addBusinessDays,
  doubleTextSpacingMs,
  nextMorningEligible,
  withinAllowedHours,
  nextAllowedTime,
} from "../../lib/followup/pacing"
import { applicableSequence, resolveDoneSelectingBody, daysUntilMove, resolveStepBody, futureMoveReactivationDate } from "../../lib/followup/sequences"
import { FUTURE_MOVE_WAIT_CONFIRM, FUTURE_MOVE_REACTIVATE } from "../../lib/followup/copy"
import { evaluateSend } from "../../lib/followup/gate"
import { inboundStopsRun, supersedeTo } from "../../lib/followup/reconcile"
import type { LeadSnapshot, ConversationSnapshot, ShareSnapshot, RunSnapshot } from "../../lib/followup/types"

let failures = 0
function ok(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.error("  ✗ " + msg)
  } else {
    console.log("  ✓ " + msg)
  }
}

const TZ = "America/Chicago"

function lead(over: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return {
    id: 1,
    firstName: "Sarah",
    agentFirstName: "Jay",
    beds: "1",
    propertyType: null,
    moveDate: null,
    moveMonthLabel: "October",
    crmStatus: "New",
    smsOptIn: true,
    accountAuthorized: true, // tests exercise an AUTHORIZED account unless overridden
    followupOptIn: true, // tests exercise an ENROLLED lead unless overridden
    appliedAt: null,
    timeZone: TZ,
    ...over,
  }
}
function conv(over: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return { lastInboundAt: null, lastManualOutboundAt: null, ...over }
}
function share(over: Partial<ShareSnapshot> = {}): ShareSnapshot {
  return { sentAt: null, doneSelectingAt: null, favoritedCount: 0, availabilitySubmittedAt: null, ...over }
}
function run(over: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    sequenceKey: "new_lead",
    stepKey: "t1",
    stepIndex: 0,
    status: "waiting",
    mode: "auto",
    baselineInboundAt: null,
    nextEligibleAt: null,
    ...over,
  }
}

// A Chicago-morning instant (09:30 CT) and an afternoon instant (14:00 CT).
const MORNING = new Date("2026-09-23T14:30:00Z") // 09:30 CDT
const AFTERNOON = new Date("2026-09-23T19:00:00Z") // 14:00 CDT

console.log("COPY")
ok(renderNewLeadText1(lead()) === "Hey Sarah it's Jay! I got your form for a 1 bedroom move in October.", "Text1 full context")
ok(renderNewLeadText1(lead({ beds: null, propertyType: null, moveMonthLabel: null })) === "Hey Sarah it's Jay! I got your form!", "Text1 graceful when beds/move unknown (no double space)")
ok(renderNewLeadText1(lead({ propertyType: "High-Rise", beds: null })) === "Hey Sarah it's Jay! I got your form for a high-rise move in October.", "Text1 high-rise")
ok(renderNewLeadText1(lead({ firstName: null, agentFirstName: null })) === "Hey! I got your form for a 1 bedroom move in October.", "Text1 no names")
ok(NEW_LEAD_TEXT2 === "Are you trying to stay near a specific address or side of town?", "Text2 locked")
ok(listFu3(2) === LIST_FU3_WITH_FAVORITES && listFu3(0) === LIST_FU3_NO_FAVORITES, "FU3 conditional LOCKED variants")
ok(FINAL_PAUSE.startsWith("I haven't heard back") && !/Sarah|\{/.test(FINAL_PAUSE), "Final pause LOCKED, no name/token")
// The trailing "!" is the shipped copy and matches its multi-tour sibling
// ("How did the tours go? Hopefully everything went well!"); this LOCKED
// assertion had simply not been updated when the punctuation was added.
ok(POST_TOUR === "How did the tour go? Hopefully everything went well!", "Post-tour locked")
ok(APPLICATION_STATUS === "Have you heard anything back on your application yet?", "Application status approved")

console.log("PACING")
ok(withinMorningWindow(MORNING, TZ) === true, "09:30 CT is inside morning window")
ok(withinMorningWindow(AFTERNOON, TZ) === false, "14:00 CT is outside morning window")
// Fri 2026-09-25 + 3 business days = Wed 2026-09-30 (skips Sat/Sun).
const appliedFri = "2026-09-25T15:00:00Z"
const due = addBusinessDays(appliedFri, 3, TZ)
ok(due.toISOString().startsWith("2026-09-30"), "3 business days after Friday lands on Wednesday (weekend skipped)")
const sp = doubleTextSpacingMs()
ok(sp >= 30000 && sp <= 45000, "double-text spacing in 30–45s")
ok(nextMorningEligible(AFTERNOON, TZ).endsWith("Z"), "nextMorningEligible returns an ISO instant")

console.log("SEQUENCE SELECTION")
ok(applicableSequence(lead(), share()) === "new_lead", "no share → new_lead")
ok(applicableSequence(lead(), share({ sentAt: "2026-09-23T00:00:00Z" })) === "list_sent", "sent_at → list_sent")
ok(applicableSequence(lead(), share({ sentAt: "x", doneSelectingAt: "2026-09-23T00:00:00Z" })) === "done_selecting", "done_selecting_at → done_selecting")
ok(applicableSequence(lead({ appliedAt: "2026-09-23T00:00:00Z" }), share({ sentAt: "x" })) === "application_status", "applied_at → application_status")
ok(applicableSequence(lead({ crmStatus: "Closed" }), share({ sentAt: "x" })) === null, "closed → no sequence")

console.log("DONE-SELECTING BRANCHES (final state check)")
ok(resolveDoneSelectingBody(lead(), share({ favoritedCount: 2, availabilitySubmittedAt: "2026-09-23T00:00:00Z" })) === DONE_SELECTING_A_AVAILABILITY_SUBMITTED, "A: favorites + availability → confirmation ack")
ok(resolveDoneSelectingBody(lead({ moveDate: iso(30) }), share({ favoritedCount: 2 })) === DONE_SELECTING_B_NEEDS_AVAILABILITY, "B: favorites, no availability, move ≤90 → ask availability")
ok(resolveDoneSelectingBody(lead({ moveDate: iso(120) }), share({ favoritedCount: 2 })) === DONE_SELECTING_C_FAR_OUT, "C: favorites, no availability, move >90 → tour-now-or-wait")
ok(resolveDoneSelectingBody(lead(), share({ favoritedCount: 0 })) === null, "no favorites → no message")

console.log("FUTURE MOVE — acknowledgment vs reactivation")
ok(resolveStepBody("future_move", "wait_ack", lead(), share()) === FUTURE_MOVE_WAIT_CONFIRM, "wait_ack sends the LOCKED acknowledgment")
ok(FUTURE_MOVE_WAIT_CONFIRM === "Perfect! Let's keep in touch. I'll reach back out about 90 days before your move date so we can get everything set up.", "acknowledgment verbatim (90 days)")
ok(FUTURE_MOVE_REACTIVATE === "Hey {first_name}! Hope you're doing well. We're getting closer to your move date. When would you like me to get the tours set up for your favorites?", "reactivation copy LOCKED verbatim")
ok(resolveStepBody("future_move", "reactivate", lead(), share()) === "Hey Sarah! Hope you're doing well. We're getting closer to your move date. When would you like me to get the tours set up for your favorites?", "reactivate renders with first_name")
ok(futureMoveReactivationDate("2026-12-01") === "2026-09-02", "reactivation date = move − 90 days (default)")
ok(futureMoveReactivationDate("2026-12-01", 60) === "2026-10-02", "explicit client instruction overrides default (e.g. 60 days)")
ok(futureMoveReactivationDate(null) === null, "no move date → no reactivation date")

console.log("GATE — per-lead enrollment (hard, default OFF)")
ok(evaluateSend(MORNING, lead({ followupOptIn: false }), conv(), share({ sentAt: "x" }), run({ sequenceKey: "list_sent", stepKey: "fu1" })).reason === "not_enrolled", "non-enrolled lead → hold(not_enrolled), never sends")
ok(evaluateSend(MORNING, lead({ followupOptIn: false }), conv(), share(), run()).action === "hold", "non-enrolled lead is held, not canceled")

// DUAL GATE — a send requires BOTH account authorization AND per-lead enrollment.
ok(evaluateSend(MORNING, lead({ accountAuthorized: false }), conv(), share(), run()).reason === "not_authorized", "unauthorized account → hold(not_authorized)")
ok(evaluateSend(MORNING, lead({ accountAuthorized: false }), conv(), share(), run()).action === "hold", "unauthorized account is held, not canceled")
// The critical revocation invariant: an enrolled lead (opt_in=true) whose account
// authorization was revoked is INELIGIBLE — no per-lead rewrite needed.
ok(evaluateSend(MORNING, lead({ accountAuthorized: false, followupOptIn: true }), conv(), share({ sentAt: "x" }), run({ sequenceKey: "list_sent", stepKey: "fu1" })).reason === "not_authorized", "revoked account → enrolled lead (opt_in=true) is STILL ineligible")
// Account authorization is checked BEFORE enrollment (order of the dual gate).
ok(evaluateSend(MORNING, lead({ accountAuthorized: false, followupOptIn: false }), conv(), share(), run()).reason === "not_authorized", "both missing → not_authorized wins (checked first)")

console.log("GATE — global mode + consent")
ok(evaluateSend(MORNING, lead(), conv(), share(), run({ mode: "paused" })).action === "hold", "paused → hold")
ok(evaluateSend(MORNING, lead(), conv(), share(), run({ mode: "stopped" })).reason === "stopped", "stopped → cancel(stopped)")
ok(evaluateSend(MORNING, lead({ smsOptIn: false }), conv(), share(), run()).reason === "opt_out", "opt-out → cancel(opt_out)")

console.log("GATE — double-text exception vs conversation override")
// t2 is consent_only: an ordinary reply between t1 and t2 does NOT cancel it.
const t2 = run({ stepKey: "t2", stepIndex: 1, baselineInboundAt: null })
const replyBetween = conv({ lastInboundAt: "2026-09-23T14:25:00Z" })
ok(evaluateSend(MORNING, lead(), replyBetween, share(), t2).action === "send", "consent_only Text2 still SENDS despite an ordinary reply")
// A full-gated contact FU cancels on any inbound since baseline.
const cfu1 = run({ stepKey: "contact_fu1", stepIndex: 2, baselineInboundAt: "2026-09-23T00:00:00Z" })
ok(evaluateSend(MORNING, lead(), replyBetween, share(), cfu1).reason === "client_replied", "full step cancels on client reply")

console.log("GATE — supersede / objective / window / manual")
// list_sent run but the client already did Done Selecting → supersede.
const listRun = run({ sequenceKey: "list_sent", stepKey: "fu1", baselineInboundAt: "2026-09-23T00:00:00Z" })
ok(evaluateSend(MORNING, lead(), conv(), share({ sentAt: "x", doneSelectingAt: "y" }), listRun).reason === "sequence_superseded", "list_sent superseded by done_selecting")
// list_sent with favorites but not done → objective satisfied (engaged).
ok(evaluateSend(MORNING, lead(), conv(), share({ sentAt: "x", favoritedCount: 1 }), listRun).reason === "objective_completed", "list ladder stops when client engaged (favorited)")
// list_sent FU1, no engagement, but it's afternoon → reschedule to morning.
ok(evaluateSend(AFTERNOON, lead(), conv(), share({ sentAt: "x" }), listRun).reason === "outside_window", "routine step outside window → reschedule")
// list_sent FU1, morning, no engagement → SEND.
const sendDec = evaluateSend(MORNING, lead(), conv(), share({ sentAt: "x" }), listRun)
ok(sendDec.action === "send" && sendDec.action === "send" && sendDec.body.length > 0, "list FU1 sends in morning with a body")
// manual locator text after baseline → reschedule.
const manual = conv({ lastManualOutboundAt: "2026-09-23T13:00:00Z" })
ok(evaluateSend(MORNING, lead(), manual, share({ sentAt: "x" }), run({ sequenceKey: "list_sent", stepKey: "fu1", baselineInboundAt: "2026-09-23T00:00:00Z" })).reason === "manual_conversation", "manual outbound forces reschedule")

console.log("QUIET HOURS — boundaries (client America/Chicago), DST + cross-TZ")
const at = (iso: string) => new Date(iso)
const localHour = (iso: string, tz: string) =>
  parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit" }).format(new Date(iso)).replace("24", "0"), 10)
// CDT (UTC-5) boundaries on 2026-09-23.
ok(withinAllowedHours(at("2026-09-23T13:59:00Z"), TZ) === false, "8:59 AM CDT → quiet")
ok(withinAllowedHours(at("2026-09-23T14:00:00Z"), TZ) === true, "9:00 AM CDT → allowed")
ok(withinAllowedHours(at("2026-09-24T01:59:00Z"), TZ) === true, "8:59 PM CDT → allowed")
ok(withinAllowedHours(at("2026-09-24T02:00:00Z"), TZ) === false, "9:00 PM CDT → quiet")
ok(withinAllowedHours(at("2026-09-23T05:00:00Z"), TZ) === false, "midnight CDT → quiet")
// DST correctness: winter CST is UTC-6, so 9:00 AM CST = 15:00 UTC (not 14:00).
ok(withinAllowedHours(at("2026-01-15T14:59:00Z"), TZ) === false, "8:59 AM CST (winter/DST) → quiet")
ok(withinAllowedHours(at("2026-01-15T15:00:00Z"), TZ) === true, "9:00 AM CST (winter/DST) → allowed")
// Client in a DIFFERENT zone than the locator: same instant is 9:30 PM ET (quiet)
// but 8:30 PM CT (allowed) → proves evaluation uses the CLIENT zone.
const cross = at("2026-09-24T01:30:00Z")
ok(withinAllowedHours(cross, "America/New_York") === false, "9:30 PM ET → quiet in client's zone")
ok(withinAllowedHours(cross, "America/Chicago") === true, "same instant 8:30 PM CT → allowed (client-TZ, not locator-TZ)")
// Deferral targets.
ok(localHour(nextAllowedTime(at("2026-09-23T13:59:00Z"), TZ), TZ) === 9, "before 9AM → defers to today 09:00")
ok(nextAllowedTime(at("2026-09-23T15:00:00Z"), TZ) === "2026-09-23T15:00:00.000Z", "inside allowed → unchanged")
{
  const deferred = nextAllowedTime(at("2026-09-24T03:00:00Z"), TZ) // 10 PM CDT
  ok(withinAllowedHours(new Date(deferred), TZ) && localHour(deferred, TZ) === 9, "at/after 9PM → defers to next 09:00")
}

console.log("QUIET HOURS — gate integration (ALL families incl. event-driven)")
const nlT1 = run({ sequenceKey: "new_lead", stepKey: "t1" })
ok(evaluateSend(at("2026-09-24T02:00:00Z"), lead(), conv(), share(), nlT1).reason === "quiet_hours", "New-Lead Text 1 at 9PM defers (quiet_hours, incl. event-driven opening)")
ok(evaluateSend(at("2026-09-23T15:00:00Z"), lead(), conv(), share(), nlT1).action === "send", "New-Lead Text 1 at 10AM sends")
const lFu1 = run({ sequenceKey: "list_sent", stepKey: "fu1", baselineInboundAt: "2026-09-23T00:00:00Z" })
ok(evaluateSend(at("2026-09-23T13:00:00Z"), lead(), conv(), share({ sentAt: "x" }), lFu1).reason === "quiet_hours", "routine step at 8AM → quiet_hours (before allowed hours)")

console.log("RECONCILE")
ok(inboundStopsRun(run({ stepKey: "t2" })).stop === false, "inbound does NOT stop consent_only Text2")
ok(inboundStopsRun(run({ sequenceKey: "list_sent", stepKey: "fu1" })).stop === true, "inbound stops a full-gated run")
ok(supersedeTo(run({ sequenceKey: "new_lead" }), lead(), share({ sentAt: "x" })).to === "list_sent", "supersede new_lead → list_sent when list is sent")

function iso(daysFromNow: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
