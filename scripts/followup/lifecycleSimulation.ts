/**
 * FOLLOW-UP AGENT — full-lifecycle DRY-RUN SIMULATION.
 *
 * Drives the PRODUCTION engine (enrollLifecycleRuns / enrollPostTourRuns /
 * enrollResumeSearchRuns / tick / runClaim / runAck) against the in-memory store on a
 * VIRTUAL clock. The store has no network and no transport — it cannot reach Apple
 * Messages, Beast Sync or any endpoint — so nothing here can send a text or touch
 * production. The simulator plays the Mac device by calling runClaim/runAck itself.
 *
 * Run: npx tsx scripts/followup/lifecycleSimulation.ts
 */
import { enrollLifecycleRuns, enrollPostTourRuns, enrollResumeSearchRuns, tick, runClaim, runAck } from "../../lib/followup/engine"
import { InMemoryFollowupStore, type SeedLead } from "../../lib/followup/sim/inMemoryStore"
import { SEQUENCES } from "../../lib/followup/sequences"

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR
const WS = "ws-1", DEV = "mac-sim-1"

// 09:45 America/Chicago — inside the 09:00–21:00 window AND the 09:00–10:30 morning
// band, so a morning-gated step is sendable and `outside_window` never masks a result.
let NOW = new Date("2026-09-23T14:45:00Z")
const clock = () => NOW
const advance = (ms: number) => { NOW = new Date(NOW.getTime() + ms) }
const at = (d: Date) => d.toISOString()
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

let pass = 0, fail = 0
const fails: string[] = []
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`    ✓ ${name}`) }
  else { fail++; fails.push(name); console.log(`    ✗ ${name}${detail ? ` — ${detail}` : ""}`) }
}
const matrix: [string, boolean, string][] = []
const record = (family: string, ok: boolean, note = "") => matrix.push([family, ok, note])

const seed = (over: Partial<SeedLead> = {}): SeedLead => ({
  id: 1, first_name: "Sarah", phone: "(210) 555-1234", beds: "1", property_type: null,
  move_date: "2026-10-01", crm_status: "new", sms_opt_in: true, held_at: null,
  followup_opt_in: true, followup_enrolled_at: ago(DAY), applied_at: null,
  created_at: ago(30 * MIN), owner_user_id: "owner-1", workspace_id: WS,
  agentFirstName: "Jay", timeZone: "America/Chicago", accountAuthorized: true,
  ...(over as object),
} as SeedLead)

const freshStore = (lead: SeedLead = seed()) => {
  const st = new InMemoryFollowupStore(clock)
  st.putLead(lead)
  return st
}

/** Run the producers + tick the way the 1-minute cron does. */
async function cron(st: InMemoryFollowupStore) {
  await enrollLifecycleRuns(st, NOW)
  await enrollPostTourRuns(st, NOW)
  await enrollResumeSearchRuns(st, NOW)
  return tick(st, NOW)
}

/** Play the Mac: claim everything claimable and ack it as sent. Returns bodies sent. */
async function deliver(st: InMemoryFollowupStore): Promise<string[]> {
  const jobs = await runClaim(st, NOW, DEV, WS)
  const sent: string[] = []
  for (const j of jobs) {
    const before = await st.intentById(j.intentId)
    await runAck(st, { intentId: j.intentId, workspaceId: WS, deviceId: DEV, status: "sent", localSentAt: at(NOW) })
    sent.push(before?.rendered_body ?? "(no body)")
  }
  return sent
}

/** Advance in 1-minute cron steps until something sends or the budget runs out. */
async function runUntilSend(st: InMemoryFollowupStore, maxMs: number, stepMs = 5 * MIN): Promise<string[]> {
  let waited = 0
  while (waited <= maxMs) {
    await cron(st)
    const sent = await deliver(st)
    if (sent.length) return sent
    advance(stepMs); waited += stepMs
  }
  return []
}

const show = (label: string, v: unknown) => console.log(`    ${label.padEnd(16)}${v}`)

async function main() {
console.log("\n" + "=".repeat(78))
console.log("FOLLOW-UP AGENT — LIFECYCLE DRY RUN (in-memory store, virtual clock, no transport)")
console.log("=".repeat(78))

// ── NEW_LEAD ────────────────────────────────────────────────────────────────────
console.log("\n■ new_lead — t1 → t2 → contact_fu1 → contact_fu2 → contact_fu3")
{
  const st = freshStore()
  show("trigger", "lead created + followup_opt_in + sms_opt_in (enrollLifecycleRuns)")
  show("timing t1", "+5 min after form submission")
  const t1 = await runUntilSend(st, 2 * HOUR)
  check("t1 sent", t1.length === 1)
  show("body t1", JSON.stringify(t1[0]))
  let r = st.runForLead(1)
  show("intent", `1 created, step=${st.intentsForLead(1)[0]?.step_key}`)
  show("next step", r?.step_key ?? "(none)")

  show("timing t2", "30–45 s after t1 CONFIRMED sent (randomized)")
  const t2 = await runUntilSend(st, 2 * HOUR, MIN)
  check("t2 sent", t2.length === 1)
  show("body t2", JSON.stringify(t2[0]))

  // Contact FU chain: +2 days each.
  const bodies: string[] = []
  for (let i = 0; i < 3; i++) {
    advance(2 * DAY)
    const b = await runUntilSend(st, 3 * DAY, 30 * MIN)
    bodies.push(b[0] ?? "(nothing)")
  }
  check("contact_fu1/2/3 all sent", bodies.every((b) => b && b !== "(nothing)"), JSON.stringify(bodies))
  show("timing fu*", "+2 days each, anchored to previous confirmed send")
  bodies.forEach((b, i) => show(`body fu${i + 1}`, JSON.stringify(b)))
  r = st.runForLead(1)
  show("stop", `terminal=contact_fu3 → run status=${r?.status}, reason=${r?.stop_reason ?? "—"}`)
  const total = st.intentsForLead(1).length
  show("intents total", total)
  record("new_lead", t1.length === 1 && t2.length === 1 && bodies.every(Boolean) && total === 5, `${total} intents`)
}

// ── LIST_SENT ───────────────────────────────────────────────────────────────────
console.log("\n■ list_sent — fu1 → fu2 → fu3 → final")
{
  const st = freshStore(seed({ crm_status: "contacted" }))
  st.setShare(1, { sentAt: ago(MIN), favoritedCount: 0 })
  show("trigger", "shares.sent_at set (list delivered)")
  show("timing", "fu1 +1d, fu2 +2d, fu3 +3d, final +7d (flat; NOT move-date-aware)")
  const got: string[] = []
  for (const d of [1, 2, 3, 7]) {
    advance(d * DAY)
    const b = await runUntilSend(st, 3 * DAY, 30 * MIN)
    got.push(b[0] ?? "(nothing)")
  }
  got.forEach((b, i) => show(`body ${["fu1","fu2","fu3","final"][i]}`, JSON.stringify(b)))
  check("all four list_sent steps sent", got.every((b) => b && b !== "(nothing)"))
  check("fu3 used the NO-favorites variant", /calling communities on your list/i.test(got[2] ?? ""))
  const r = st.runForLead(1)
  show("stop", `terminal=final → status=${r?.status}`)
  record("list_sent", got.every((b) => b && b !== "(nothing)"), "4 steps")
}

// ── DONE_SELECTING (3 branches) ─────────────────────────────────────────────────
console.log("\n■ done_selecting — branch A / B / C")
{
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["A availability submitted", { doneSelectingAt: ago(MIN), favoritedCount: 2, availabilitySubmittedAt: ago(MIN) }, /tour confirmations/i],
    ["B needs availability (move ≤90d)", { doneSelectingAt: ago(MIN), favoritedCount: 2 }, /select your availability/i],
    ["C far out (move >90d)", { doneSelectingAt: ago(MIN), favoritedCount: 2 }, /set up a tour now or wait/i],
  ]
  let allOk = true
  for (const [label, share, expect] of cases) {
    const far = label.startsWith("C")
    const st = freshStore(seed({ crm_status: "contacted", move_date: far ? "2027-06-01" : "2026-10-01" }))
    st.setShare(1, share as never)
    advance(15 * MIN)
    const b = await runUntilSend(st, 2 * DAY, 30 * MIN)
    const ok = expect.test(b[0] ?? "")
    allOk &&= ok
    check(label, ok, JSON.stringify(b[0] ?? "(nothing)"))
    if (ok) show("body", JSON.stringify(b[0]))
  }
  show("trigger", "shares.done_selecting_at + 10-min grace; branch chosen at SEND time")
  show("stop", "single terminal step")
  record("done_selecting", allOk, "3 branches")
}

// ── APPLICATION_STATUS ──────────────────────────────────────────────────────────
console.log("\n■ application_status")
{
  const st = freshStore(seed({ crm_status: "applied", applied_at: ago(MIN) }))
  show("trigger", "leads.applied_at set")
  show("timing", "+3 calendar days")
  advance(3 * DAY)
  const b = await runUntilSend(st, 3 * DAY, 30 * MIN)
  check("application_status sent", b.length === 1)
  show("body", JSON.stringify(b[0]))
  show("stop", "single terminal step")
  record("application_status", b.length === 1)
}

// ── POST_TOUR ───────────────────────────────────────────────────────────────────
console.log("\n■ post_tour — one per tour DAY")
{
  const st = freshStore(seed({ crm_status: "touring" }))
  const end = new Date(NOW.getTime() + 2 * HOUR)
  st.putTours(1, [{ scheduledAt: at(new Date(NOW.getTime() + HOUR)), endsAt: at(end) }])
  show("trigger", "confirmed tour(s); session = tour DAY")
  show("timing", "+2 h after the LAST tour ends that day")
  advance(4 * HOUR)
  await runUntilSend(st, 2 * DAY, 30 * MIN)
  // Assert on the post_tour INTENT, not "whatever was delivered first". This lead is
  // also a fresh new_lead, so the tick legitimately produces new_lead/t1 as well; an
  // earlier version of this harness compared the t1 body and reported a false failure.
  const pt = st.intentsForLead(1).find((i) => i.sequence_key === "post_tour")
  check("a post_tour intent exists", !!pt, st.intentsForLead(1).map((i) => i.sequence_key).join(","))
  show("body", JSON.stringify(pt?.rendered_body ?? "(none)"))
  check("singular copy for ONE tour", /How did the tour go\?/.test(pt?.rendered_body ?? ""))
  check("post_tour is independent of the concurrent new_lead run", st.intentsForLead(1).some((i) => i.sequence_key === "new_lead"))
  show("stop", "single terminal step, one run per session_date")
  record("post_tour", !!pt && /How did the tour go\?/.test(pt?.rendered_body ?? ""))
}

// ── FUTURE_MOVE ─────────────────────────────────────────────────────────────────
console.log("\n■ future_move — wait_ack (consent_only) → reactivate")
{
  const def = SEQUENCES.future_move
  show("trigger", "client chooses WAIT on a >90-day search (Branch C reply)")
  show("timing", "wait_ack immediate; reactivate at move_date − 90d")
  show("steps", def.steps.map((s) => `${s.key}[${s.gate}]`).join(" → "))
  const { resolveStepBody } = await import("../../lib/followup/sequences")
  const leadSnap = { firstName: "Sarah", agentFirstName: "Jay", moveDate: "2027-06-01" } as never
  const shareSnap = { favoritedCount: 2 } as never
  const ack = resolveStepBody("future_move", "wait_ack", leadSnap, shareSnap)
  const re = resolveStepBody("future_move", "reactivate", leadSnap, shareSnap)
  show("body wait_ack", JSON.stringify(ack))
  show("body reactivate", JSON.stringify(re))
  check("wait_ack is consent_only (a reply must not cancel it)", def.steps[0].gate === "consent_only")
  check("both bodies resolve", !!ack && !!re)
  show("stop", "terminal=reactivate")
  record("future_move", !!ack && !!re, "event-triggered")
}

// ── RESUME_SEARCH ───────────────────────────────────────────────────────────────
console.log("\n■ resume_search — event-triggered")
{
  const st = freshStore(seed({ crm_status: "paused" }))
  st.setShare(1, { resumedAt: ago(MIN) } as never)
  show("trigger", "client taps Resume on a paused /r page (shares.resumed_at)")
  const enrolled = await enrollResumeSearchRuns(st, NOW)
  const b = await runUntilSend(st, 2 * DAY, 30 * MIN)
  show("enrolled runs", enrolled)
  show("body", JSON.stringify(b[0] ?? "(nothing sent)"))
  check("resume_search enrolls", enrolled >= 1 || !!b.length)
  show("stop", "single terminal step")
  record("resume_search", enrolled >= 1 || !!b.length, enrolled >= 1 ? "enrolled" : "see note")
}

// ── TOUR handoff ────────────────────────────────────────────────────────────────
console.log("\n■ tour — Next-Action handoff, NOT a texting sequence")
{
  const def = SEQUENCES.tour
  check("tour has ZERO steps (never texts the client)", def.steps.length === 0)
  const st = freshStore(seed({ crm_status: "touring" }))
  st.setManualTourFollowUp(1, true)
  check("manual tour_follow_up action can be open", st.hasManualTourFollowUp(1))
  const end = new Date(NOW.getTime() + HOUR)
  st.putTours(1, [{ scheduledAt: at(NOW), endsAt: at(end) }])
  advance(4 * HOUR)
  await runUntilSend(st, DAY, 30 * MIN)
  check("automated post_tour SUPPRESSES the manual action", !st.hasManualTourFollowUp(1))
  show("behavior", "handoff only; the automated post_tour run clears the manual task")
  record("tour handoff", def.steps.length === 0)
}

// ── INVARIANTS ──────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(78))
console.log("INVARIANTS")
console.log("=".repeat(78))

console.log("\n□ a client reply stops future sends")
{
  const st = freshStore()
  await runUntilSend(st, HOUR, MIN)          // t1
  await runUntilSend(st, HOUR, MIN)          // t2 (consent_only pair)
  advance(2 * DAY)
  st.setConversation(1, { lastInboundAt: at(NOW) })   // client replies
  advance(MIN)
  const after = await runUntilSend(st, 3 * DAY, 30 * MIN)
  const r = st.runForLead(1)
  check("no further send after the reply", after.length === 0, JSON.stringify(after))
  check("run is stopped//paused with a reason", r?.status !== "waiting" || !!r?.stop_reason, `status=${r?.status} reason=${r?.stop_reason}`)
  show("stop reason", r?.stop_reason ?? r?.status ?? "—")
  record("reply stops sends", after.length === 0)
}

console.log("\n□ duplicate ticks do not duplicate intents")
{
  const st = freshStore()
  advance(10 * MIN)
  await cron(st); await cron(st); await cron(st); await cron(st)   // 4 ticks, no delivery
  const n = st.intentsForLead(1).length
  check("4 consecutive ticks produced exactly 1 intent", n === 1, `got ${n}`)
  // and a double claim cannot double-send
  const j1 = await runClaim(st, NOW, DEV, WS)
  const j2 = await runClaim(st, NOW, DEV, WS)
  check("a claimed intent cannot be claimed twice", j1.length === 1 && j2.length === 0, `${j1.length}/${j2.length}`)
  if (j1[0]) {
    await runAck(st, { intentId: j1[0].intentId, workspaceId: WS, deviceId: DEV, status: "sent", localSentAt: at(NOW) })
    const again = await runAck(st, { intentId: j1[0].intentId, workspaceId: WS, deviceId: DEV, status: "sent", localSentAt: at(NOW) })
    check("re-acking the same intent is idempotent", again.ok === true && again.already === true)
  }
  // After the ack, t2 is legitimately enqueued (the pair is one thought split in two),
  // so the post-ack count is 2 by design. The claim here is "no DUPLICATES", which is
  // one intent per STEP — not one intent overall.
  const perStep = new Map<string, number>()
  for (const i of st.intentsForLead(1)) perStep.set(i.step_key, (perStep.get(i.step_key) ?? 0) + 1)
  const noDupes = [...perStep.values()].every((n) => n === 1)
  check("one intent per step, no step duplicated", noDupes, [...perStep].map(([k, n]) => `${k}:${n}`).join(" "))
  show("per-step", [...perStep].map(([k, n]) => `${k}:${n}`).join(" "))
  record("no duplicate intents", noDupes)
}

console.log("\n□ quiet hours defer correctly")
{
  const saved = NOW
  NOW = new Date("2026-09-24T04:30:00Z")   // 23:30 CDT — outside 09:00–21:00
  const st = freshStore(seed({ created_at: ago(30 * MIN) }))
  advance(10 * MIN)
  const summary = await cron(st)
  const sentNow = await deliver(st)
  check("nothing sends during quiet hours", sentNow.length === 0)
  // The engine defers at the RUN level: it reschedules next_eligible_at and creates
  // NO intent, rather than parking a pending intent overnight. An earlier version of
  // this harness asserted the intent mechanism and reported a false failure.
  check("the tick RESCHEDULED rather than enqueued", summary.rescheduled === 1 && summary.enqueued === 0, JSON.stringify(summary))
  check("no intent is parked overnight", st.intentsForLead(1).length === 0)
  const r = st.runForLead(1)
  const next = r?.next_eligible_at ? new Date(r.next_eligible_at) : null
  check("the run is deferred to a later time", !!next && next.getTime() > NOW.getTime())
  let okWindow = false
  if (next) {
    const hourCT = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(next))
    okWindow = hourCT >= 9 && hourCT < 21
    check("deferred into the next allowed window (09:00–21:00 CT)", okWindow, `deferred to ${hourCT}:00 CT`)
    show("next_eligible_at", `${r!.next_eligible_at} (${hourCT}:00 CT)`)
  }
  record("quiet hours defer", sentNow.length === 0 && summary.rescheduled === 1 && okWindow)
  NOW = saved
}

console.log("\n□ an opted-out lead does not enroll")
{
  const st = freshStore(seed({ followup_opt_in: false }))
  advance(10 * MIN)
  await cron(st)
  const runs = st.runForLead(1)
  const n = st.intentsForLead(1).length
  check("no run created", runs === null)
  check("no intent created", n === 0)
  // and sms_opt_in false is independently disqualifying
  const st2 = freshStore(seed({ sms_opt_in: false }))
  await cron(st2)
  check("sms_opt_in=false also blocks enrollment", st2.runForLead(1) === null)
  record("opt-out blocks enrollment", runs === null && n === 0)
}

console.log("\n□ an OOO-held lead suppresses the normal opener")
{
  const st = freshStore(seed({ held_at: ago(HOUR) }))
  advance(10 * MIN)
  const summary = await cron(st)
  const sent = await deliver(st)
  check("nothing sent while held", sent.length === 0)
  show("tick held count", summary.held)
  record("OOO suppresses opener", sent.length === 0)
}

console.log("\n□ manual Start Follow-Up releases the held lead with the OOO opener")
{
  const st = freshStore(seed({ held_at: ago(2 * DAY), ooo_held_at: ago(2 * DAY) } as never))
  advance(10 * MIN)

  // 1. BEFORE release — the hold must suppress the opener entirely.
  for (let i = 0; i < 3; i++) { await cron(st); await deliver(st); advance(30 * MIN) }
  const heldIntents = st.intentsForLead(1).filter((i) => i.dispatch_status === "sent")
  check("held: nothing sent before release", heldIntents.length === 0, `${heldIntents.length} sent`)

  // 2. RELEASE — the locator taps Start Follow-Up.
  //
  // enrollLifecycleRuns can NEVER produce this run: lifecycleSeed returns null for any
  // lead with ooo_held_at (engine.ts), and that column is never cleared. The run is
  // created by app/api/admin/leads/start-ooo-followup/route.ts, which inserts straight
  // through supabaseAdmin and does not go through FollowupStore — so the simulator
  // cannot invoke it. What follows REPLICATES that route's insert verbatim, then lets
  // the real engine take over from the run onward. The copy selection, pacing, gating
  // and idempotency below are therefore genuinely exercised; the route's own auth,
  // idempotency and stamp-ordering are NOT covered here.
  st.patchLead(1, { held_at: null, ooo_released_at: at(NOW) } as never)
  await st.insertRun({
    lead_id: 1, workspace_id: WS, owner_user_id: "owner-1", mode: "auto", status: "waiting",
    sequence_key: "new_lead", step_key: "t1", step_index: 0, sequence_version: 1,
    session_date: null, next_eligible_at: at(NOW),
  } as never)
  const released = await runUntilSend(st, 2 * DAY, 10 * MIN)
  check("a send happens after release", released.length === 1, JSON.stringify(released))
  const isOoo = /back in the office/i.test(released[0] ?? "")
  check("it uses the OOO RESTART opener", isOoo, JSON.stringify(released[0]))
  check("…and NOT the ordinary 'I got your form' opener", !/I got your form/i.test(released[0] ?? ""))
  show("body t1", JSON.stringify(released[0] ?? "(nothing)"))

  // 3. t2 must proceed normally afterwards — the restart changes the opener only.
  const t2 = await runUntilSend(st, 2 * HOUR, MIN)
  const t2Ok = /specific address or side of town/i.test(t2[0] ?? "")
  check("t2 proceeds normally after the restart", t2Ok, JSON.stringify(t2[0] ?? "(nothing)"))
  show("body t2", JSON.stringify(t2[0] ?? "(nothing)"))

  // 4. no duplicate intent from the release itself.
  const all = st.intentsForLead(1)
  const t1s = all.filter((i) => i.step_key === "t1")
  check("exactly ONE t1 intent exists (release did not duplicate it)", t1s.length === 1, `${t1s.length}`)
  const dupTicks = (await cron(st), await cron(st), st.intentsForLead(1).length)
  check("extra ticks after release create no further intents", dupTicks === all.length, `${all.length} → ${dupTicks}`)
  show("intents", all.map((i) => i.step_key).join(" → "))
  record("manual release → OOO opener", released.length === 1 && isOoo && t2Ok && t1s.length === 1)
}

// ── MATRIX ──────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(78))
console.log("PASS / FAIL MATRIX")
console.log("=".repeat(78))
for (const [k, ok, note] of matrix) console.log(`  ${ok ? "PASS" : "FAIL"}  ${k.padEnd(28)} ${note}`)
console.log(`\n${pass} checks passed, ${fail} failed`)
if (fail) { console.log("\nFAILED:"); fails.forEach((f) => console.log(`  • ${f}`)); process.exit(1) }
}

main().catch((e) => { console.error("SIM ERROR:", e); process.exit(1) })
