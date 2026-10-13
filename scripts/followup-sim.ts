/**
 * Follow-Up Agent — DRY-RUN SIMULATOR (test-only).
 *
 * Exercises the SAME production orchestration core (lib/followup/engine.ts:
 * tick / runClaim / runAck) and the SAME pure logic (gate, sequences, cadence,
 * pacing, reconcile), backed by an in-memory store + a virtual clock. The only
 * fake is the device boundary: the simulator plays Beast Sync by calling
 * runClaim/runAck itself. It has NO transport, NO network, and CANNOT send an
 * Apple Message or touch production data.
 *
 *   npx tsx scripts/followup-sim.ts
 */
import { tick, runClaim, runAck, type ClaimJob } from "@/lib/followup/engine"
import { postTourEligibleAt } from "@/lib/followup/cadence"
import { evaluateSend } from "@/lib/followup/gate"
import { runSnapshotFromRow } from "@/lib/followup/snapshot"
import { InMemoryFollowupStore, type SeedLead } from "@/lib/followup/sim/inMemoryStore"

// DETERMINISTIC OPENING-PAIR SPACING.
//
// Production randomizes the New-Lead t1→t2 gap to 30–45s. cadence.ts has always accepted an
// injectable `spacingMs` for exactly this reason, but nothing threaded it as far as runAck — so
// this simulator got the real random value and its exact-timing assertions could not hold. Every
// scenario that had to reach Text 2 then derailed, and the run reported eight failures that were
// the harness's, not the product's.
//
// Pinning it to the low end of the production range makes the timeline reproducible. It changes
// nothing in production: `advanceRun` passes undefined there and cadence falls back to the real
// generator. The range itself is covered by the follow-up suites, not here.
const SIM_SPACING_MS = () => 30_000

const WS = "ws1"
const OWNER = "owner1"
const DEV = "dev1"

// ── Virtual clock ─────────────────────────────────────────────────────────────
class Clock {
  t: number
  readonly t0: number
  constructor(iso: string) { this.t = new Date(iso).getTime(); this.t0 = this.t }
  now() { return new Date(this.t) }
  iso() { return this.now().toISOString() }
  advMs(ms: number) { this.t += ms }
  advSec(s: number) { this.advMs(s * 1000) }
  advMin(m: number) { this.advMs(m * 60_000) }
  advHr(h: number) { this.advMs(h * 3_600_000) }
  advDay(d: number) { this.advMs(d * 86_400_000) }
  set(iso: string) { this.t = new Date(iso).getTime() }
}

type World = { clock: Clock; store: InMemoryFollowupStore; rows: Row[] }
type Row = { time: string; event: string; gate: string; step: string; run: string }

function fmtDelta(fromMs: number, toMs: number): string {
  const d = Math.round((toMs - fromMs) / 1000)
  if (d === 0) return "t0"
  const sign = d < 0 ? "-" : "+"
  let s = Math.abs(d)
  const days = Math.floor(s / 86400); s -= days * 86400
  const hrs = Math.floor(s / 3600); s -= hrs * 3600
  const mins = Math.floor(s / 60); s -= mins * 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hrs) parts.push(`${hrs}h`)
  if (mins) parts.push(`${mins}m`)
  if (s) parts.push(`${s}s`)
  return sign + (parts.join("") || "0s")
}

function world(startIso: string): World {
  const clock = new Clock(startIso)
  return { clock, store: new InMemoryFollowupStore(() => clock.now()), rows: [] }
}

let leadCounter = 100
function seed(w: World, o: Partial<SeedLead> = {}): SeedLead {
  const id = o.id ?? ++leadCounter
  const lead: SeedLead = {
    id,
    first_name: "Sarah",
    phone: "+15551230000",
    beds: "1",
    // On Hold — the client paused their search. Null unless a scenario sets it.
    held_at: null,
    property_type: null,
    move_date: "2026-10-01",
    crm_status: "new",
    sms_opt_in: true,
    followup_opt_in: false,
    followup_enrolled_at: null,
    applied_at: null,
    created_at: w.clock.iso(),
    owner_user_id: OWNER,
    workspace_id: WS,
    agentFirstName: "Jay",
    timeZone: "America/Chicago",
    accountAuthorized: true,
    ...o,
  }
  w.store.putLead(lead)
  return lead
}

function runStr(w: World, leadId: number): string {
  const r = w.store.runForLead(leadId)
  if (!r) return "—"
  const elig = r.next_eligible_at ? " @" + fmtDelta(w.clock.t0, new Date(r.next_eligible_at).getTime()) : ""
  return `${r.status}/${r.step_key}${elig}`
}

async function gateStr(w: World, leadId: number): Promise<string> {
  const r = w.store.activeRunForLead(leadId) ?? w.store.runForLead(leadId)
  if (!r) return "—"
  const leadRow = await w.store.leadRow(leadId)
  if (!leadRow) return "—"
  const d = evaluateSend(w.clock.now(), await w.store.leadSnapshot(leadRow), await w.store.conversation(leadId), await w.store.share(leadId), runSnapshotFromRow(r))
  return d.action === "send" ? "send" : `${d.action}:${(d as { reason?: string }).reason ?? ""}`
}

function log(w: World, event: string, leadId: number, gate = "", step = "") {
  w.rows.push({ time: fmtDelta(w.clock.t0, w.clock.t), event, gate, step, run: leadId ? runStr(w, leadId) : "" })
}

async function doTick(w: World) { return tick(w.store, w.clock.now()) }
async function claim(w: World): Promise<ClaimJob[]> { return runClaim(w.store, w.clock.now(), DEV, WS) }
async function ack(w: World, jobs: ClaimJob[], status: "sent" | "failed" = "sent") {
  const out = []
  for (const j of jobs) out.push(await runAck(w.store, { intentId: j.intentId, workspaceId: WS, deviceId: DEV, status, localSentAt: w.clock.iso(), spacingMs: SIM_SPACING_MS }))
  return out
}
function body(jobs: ClaimJob[], step: string): string {
  const j = jobs.find((x) => x.stepKey === step) ?? jobs[0]
  return j ? `${j.stepKey}: "${j.body.slice(0, 46)}${j.body.length > 46 ? "…" : ""}" → ${j.toPhone}` : "—"
}

// ── Scenario runner / reporting ────────────────────────────────────────────────
type Result = { n: number; name: string; pass: boolean; verdict: string; notes: string[]; rows: Row[] }
const results: Result[] = []

async function scenario(n: number, name: string, fn: (w: World, ck: (cond: boolean, msg: string) => void, note: (m: string) => void) => Promise<void>, startIso = "2026-09-28T14:20:00Z") {
  const w = world(startIso)
  const notes: string[] = []
  let pass = true
  const ck = (cond: boolean, msg: string) => { if (!cond) { pass = false; notes.push("✗ " + msg) } else { notes.push("✓ " + msg) } }
  const note = (m: string) => notes.push("• " + m)
  try {
    await fn(w, ck, note)
  } catch (e) {
    pass = false
    notes.push("✗ threw: " + (e instanceof Error ? e.message : String(e)))
  }
  const verdict = pass ? "PASS" : "FLAG"
  results.push({ n, name, pass, verdict, notes, rows: w.rows })
}

// Helper: directly install a run at a given step/eligibility (for sequences whose
// enrollment lives in a later checkpoint — the engine still drives them).
async function installRun(w: World, leadId: number, sequence_key: string, step_key: string, eligibleIso: string, opts: { sessionDate?: string; sessionTourCount?: number } = {}) {
  await w.store.insertRun({
    lead_id: leadId, workspace_id: WS, owner_user_id: OWNER, mode: "auto",
    sequence_key, step_key, step_index: 0, status: "waiting",
    next_eligible_at: eligibleIso, baseline_inbound_at: null, sequence_version: 1,
    session_date: opts.sessionDate ?? null, session_tour_count: opts.sessionTourCount ?? null,
  })
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  // 1) New lead → Text1 +5m → Text2 exactly +30s after confirmed Text1
  await scenario(1, "New lead → Text 1 (+5m) → Text 2 (+30s after confirmed Text 1)", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); log(w, "tick@t0 (enroll)", l.id)
    ck(runStr(w, l.id) === "waiting/t1 @+5m", "run scheduled t1 @ +5m")
    w.clock.advMin(5)
    log(w, "tick@+5m", l.id, await gateStr(w, l.id))
    await doTick(w)
    let jobs = await claim(w)
    ck(jobs.length === 1 && jobs[0].stepKey === "t1", "Text 1 claimable at +5m")
    ck(/I got your form/.test(jobs[0]?.body ?? ""), "Text 1 body is new_lead_text1")
    log(w, "claim t1", l.id, "send", body(jobs, "t1"))
    await ack(w, jobs, "sent")
    const t1SentMs = w.clock.t
    log(w, "ack t1 sent", l.id, "", "→ advance")
    const r2 = w.store.runForLead(l.id)!
    ck(r2.step_key === "t2" && new Date(r2.next_eligible_at!).getTime() === t1SentMs + 30_000,
      "Text 2 scheduled exactly +30s after Text 1's confirmed send")
    // not claimable before +30s
    w.clock.advSec(15)
    ck((await claim(w)).length === 0, "Text 2 NOT claimable at +15s (not due)")
    log(w, "claim@+15s", l.id, await gateStr(w, l.id), "no job")
    w.clock.set(new Date(t1SentMs + 30_000).toISOString())
    jobs = await claim(w)
    ck(jobs.length === 1 && jobs[0].stepKey === "t2", "Text 2 claimable at exactly +30s")
    ck(/stay near a specific address/.test(jobs[0]?.body ?? ""), "Text 2 body is new_lead_text2")
    log(w, "claim t2 (+30s)", l.id, "send", body(jobs, "t2"))
    await ack(w, jobs, "sent")
    log(w, "ack t2 sent", l.id, "", "→ advance")
    ck(runStr(w, l.id).startsWith("waiting/contact_fu1"), "run advances to contact_fu1 after Text 2")
  })

  // 2) Client replies to Text 1 → Text 2 still sends
  await scenario(2, "Reply to Text 1 → Text 2 still sends (consent_only)", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    let jobs = await claim(w); await ack(w, jobs, "sent"); const t1 = w.clock.t
    log(w, "Text 1 sent", l.id, "send", body(jobs, "t1"))
    w.store.setConversation(l.id, { lastInboundAt: new Date(w.clock.t + 5_000).toISOString() })
    log(w, "client replies to Text 1", l.id, "", "inbound recorded")
    w.clock.set(new Date(t1 + 30_000).toISOString())
    log(w, "claim@+30s", l.id, await gateStr(w, l.id))
    jobs = await claim(w)
    ck(jobs.length === 1 && jobs[0].stepKey === "t2", "Text 2 still sends despite reply to Text 1")
    await ack(w, jobs, "sent")
    log(w, "Text 2 sent", l.id, "send", body(jobs, "t2"))
  })

  // 3) Reply AFTER Text 2 → next full-gated follow-up cancels
  await scenario(3, "Reply after Text 2 → contact_fu1 cancels (conversation overrides)", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    let jobs = await claim(w); await ack(w, jobs, "sent"); const t1 = w.clock.t // Text 1
    w.clock.set(new Date(t1 + 30_000).toISOString())
    jobs = await claim(w); await ack(w, jobs, "sent") // Text 2 → advances to contact_fu1 (+2d)
    log(w, "Text 2 sent → contact_fu1", l.id, "", runStr(w, l.id))
    // client replies AFTER Text 2 (newer than the re-baselined watermark)
    w.clock.advDay(2)
    w.store.setConversation(l.id, { lastInboundAt: w.clock.iso() })
    log(w, "client replies (after Text 2)", l.id, "", "inbound recorded")
    w.clock.advMin(1)
    log(w, "tick @ contact_fu1 due", l.id, await gateStr(w, l.id))
    await doTick(w)
    ck(runStr(w, l.id).startsWith("canceled/") , "contact_fu1 canceled (client_replied)")
    ck(w.store.intentsForLead(l.id).every((i) => i.step_key !== "contact_fu1"), "no contact_fu1 message enqueued")
  })

  // 4) Explicit STOP / opt-out before Text 2 → Text 2 blocked
  await scenario(4, "Opt-out before Text 2 → Text 2 blocked (cancel: opt_out)", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    let jobs = await claim(w); await ack(w, jobs, "sent"); const t1 = w.clock.t // Text 1, Text 2 pre-enqueued
    log(w, "Text 1 sent; Text 2 pending", l.id, "", runStr(w, l.id))
    w.store.patchLead(l.id, { sms_opt_in: false })
    log(w, "client texts STOP (opt-out)", l.id, "", "sms_opt_in=false")
    w.clock.set(new Date(t1 + 30_000).toISOString())
    log(w, "claim@+30s", l.id, await gateStr(w, l.id))
    jobs = await claim(w)
    ck(jobs.length === 0, "Text 2 NOT handed to device")
    const t2 = w.store.intentsForLead(l.id).find((i) => i.step_key === "t2")
    ck(t2?.dispatch_status === "superseded" && t2?.error === "opt_out", "Text 2 intent superseded (opt_out)")
    ck(runStr(w, l.id).startsWith("canceled/"), "run canceled (opt_out)")
  })

  // 5) Automation turned OFF before a due message
  await scenario(5, "Enrollment OFF before due → held (not_enrolled), nothing sent", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); log(w, "enrolled t1 @+5m", l.id)
    w.store.patchLead(l.id, { followup_opt_in: false })
    log(w, "automation turned OFF", l.id, "", "followup_opt_in=false")
    w.clock.advMin(5)
    log(w, "tick@+5m", l.id, await gateStr(w, l.id))
    await doTick(w)
    ck((await claim(w)).length === 0, "no message claimable")
    ck(runStr(w, l.id).startsWith("waiting/t1"), "run held (waiting), not canceled")
  })

  // 6) Paused / stopped
  await scenario(6, "Paused → hold; Stopped → cancel", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); w.clock.advMin(5)
    const r = w.store.runForLead(l.id)!
    await w.store.updateRun(r.id, { mode: "paused" })
    log(w, "mode=paused; tick", l.id, await gateStr(w, l.id))
    await doTick(w)
    ck((await claim(w)).length === 0 && runStr(w, l.id).startsWith("waiting/"), "paused → held, nothing sent")
    await w.store.updateRun(r.id, { mode: "stopped" })
    log(w, "mode=stopped; tick", l.id, await gateStr(w, l.id))
    await doTick(w)
    ck(runStr(w, l.id).startsWith("canceled/"), "stopped → run canceled")
  })

  // 7) CRM stage change → sequence superseded
  await scenario(7, "List sent before new_lead follow-up → superseded", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    let jobs = await claim(w); await ack(w, jobs, "sent"); const t1 = w.clock.t
    w.clock.set(new Date(t1 + 30_000).toISOString())
    jobs = await claim(w); await ack(w, jobs, "sent") // → contact_fu1
    log(w, "run at contact_fu1", l.id, "", runStr(w, l.id))
    w.store.setShare(l.id, { sentAt: w.clock.iso() }) // agent sent a list → lifecycle moved
    w.clock.advDay(2); w.clock.advMin(1)
    log(w, "tick (list now sent)", l.id, await gateStr(w, l.id))
    await doTick(w)
    // Supersession REPLACES: the new_lead run is stood down AND a list_sent run takes over, so
    // runStr (the latest run) is now the replacement, not the superseded one. Assert both halves of
    // the contract explicitly — stricter than the old single check, which only held while the
    // enroller superseded without enrolling anything in its place.
    const runs7 = w.store.runsForLead(l.id)
    const old7 = runs7.find((r) => r.sequence_key === "new_lead")
    const new7 = runs7.find((r) => r.sequence_key === "list_sent")
    ck(old7?.status === "superseded" && old7?.stop_reason === "sequence_superseded",
      "new_lead run superseded when list_sent becomes applicable")
    // waiting OR due: the replacement is created waiting and the same tick evaluates it to due
    // because the list was sent two days ago. Both are active states; "due" is simply further along.
    ck(!!new7 && ["waiting", "due"].includes(String(new7.status)), "…and the list_sent run takes over")
    ck(runs7.filter((r) => ["waiting", "due"].includes(String(r.status))).length === 1,
      "…leaving exactly one active run (no duplicate or conflicting sequence)")
  })

  // 8) Contact FU1/FU2/FU3 cadence (+2d each), morning-gated
  await scenario(8, "Contact FU1→FU2→FU3 cadence = +2d each (morning-gated)", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    await installRun(w, l.id, "new_lead", "contact_fu1", w.clock.iso()) // due now, 09:20 CT
    const gaps: string[] = []
    for (const step of ["contact_fu1", "contact_fu2", "contact_fu3"]) {
      log(w, `tick @ ${step} due`, l.id, await gateStr(w, l.id))
      await doTick(w)
      const jobs = await claim(w)
      ck(jobs.length === 1 && jobs[0].stepKey === step, `${step} sent in morning window`)
      log(w, `claim ${step}`, l.id, "send", body(jobs, step))
      const before = w.clock.t
      await ack(w, jobs, "sent")
      const r = w.store.runForLead(l.id)!
      if (r.next_eligible_at) gaps.push(fmtDelta(before, new Date(r.next_eligible_at).getTime()))
      if (r.status === "waiting" && r.next_eligible_at) w.clock.set(r.next_eligible_at)
    }
    ck(gaps[0] === "+2d" && gaps[1] === "+2d", `FU2,FU3 each +2d (got ${gaps.join(",")})`)
    ck(runStr(w, l.id).startsWith("completed/"), "contact_fu3 terminal → run completed")
  })

  // 9) List Sent FU1(+1d)/FU2(+2d)/FU3(+3d)/Final(+7d)
  await scenario(9, "List Sent FU1(+1d)/FU2(+2d)/FU3(+3d)/Final(+7d)", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true, crm_status: "list_sent" })
    w.store.setShare(l.id, { sentAt: w.clock.iso(), favoritedCount: 0 })
    await installRun(w, l.id, "list_sent", "fu1", w.clock.iso())
    const gaps: string[] = []
    for (const step of ["fu1", "fu2", "fu3", "final"]) {
      log(w, `tick @ ${step} due`, l.id, await gateStr(w, l.id))
      await doTick(w)
      const jobs = await claim(w)
      ck(jobs.length === 1 && jobs[0].stepKey === step, `${step} sent`)
      const before = w.clock.t
      await ack(w, jobs, "sent")
      const r = w.store.runForLead(l.id)!
      if (r.next_eligible_at && r.status === "waiting") { gaps.push(fmtDelta(before, new Date(r.next_eligible_at).getTime())); w.clock.set(r.next_eligible_at) }
    }
    ck(gaps.join(",") === "+2d,+3d,+7d", `FU2/FU3/Final gaps +2d,+3d,+7d (got ${gaps.join(",")})`)
    ck(runStr(w, l.id).startsWith("completed/"), "final terminal → run completed")
  })

  // 10) Done Selecting 10-minute grace
  await scenario(10, "Done Selecting → send after 10-minute grace", async (w, ck) => {
    const l = seed(w, { followup_opt_in: true })
    const doneAt = w.clock.iso()
    w.store.setShare(l.id, { doneSelectingAt: doneAt, favoritedCount: 2 })
    await installRun(w, l.id, "done_selecting", "evaluate", new Date(w.clock.t + 10 * 60_000).toISOString())
    w.clock.advMin(5)
    log(w, "claim @ +5m (within grace)", l.id, await gateStr(w, l.id))
    ck((await claim(w)).length === 0, "not sendable during the 10-min grace")
    w.clock.advMin(5) // now +10m
    log(w, "tick @ +10m", l.id, await gateStr(w, l.id))
    await doTick(w)
    const jobs = await claim(w)
    ck(jobs.length === 1 && jobs[0].stepKey === "evaluate", "sent right at the 10-min grace")
    log(w, "claim evaluate", l.id, "send", body(jobs, "evaluate"))
  })

  // 11) Application Status +3 calendar days
  await scenario(11, "Application Status → +3 calendar days", async (w, ck) => {
    const applied = w.clock.iso()
    const l = seed(w, { followup_opt_in: true, crm_status: "applied", applied_at: applied })
    const due = new Date(w.clock.t + 3 * 86_400_000).toISOString()
    await installRun(w, l.id, "application_status", "ask", due)
    ck(fmtDelta(w.clock.t, new Date(due).getTime()) === "+3d", "eligibility is applied_at + 3 calendar days")
    w.clock.set(due)
    log(w, "tick @ +3d", l.id, await gateStr(w, l.id))
    await doTick(w)
    const jobs = await claim(w)
    ck(jobs.length === 1 && jobs[0].stepKey === "ask", "application-status message sent at +3d")
    log(w, "claim ask", l.id, "send", body(jobs, "ask"))
  })

  // 12) Future Move −90 days  (EXPOSES A BUG)
  await scenario(12, "Future Move −90 days (event-triggered)", async (w, ck, note) => {
    const l = seed(w, { followup_opt_in: true, move_date: "2026-12-30" })
    await installRun(w, l.id, "future_move", "reactivate", w.clock.iso())
    log(w, "tick @ reactivation due", l.id, await gateStr(w, l.id))
    await doTick(w)
    const jobs = await claim(w)
    const canceled = runStr(w, l.id).startsWith("superseded/") || runStr(w, l.id).startsWith("canceled/")
    ck(!canceled && jobs.length === 1, "future_move reactivation should send")
    if (canceled) note("BUG: gate cancels future_move because applicableSequence() never returns 'future_move' → step-3 supersede fires")
  })

  // 13) Resume Search event  (EXPOSES A BUG)
  await scenario(13, "Resume Search event-triggered send", async (w, ck, note) => {
    const l = seed(w, { followup_opt_in: true, crm_status: "new" })
    await installRun(w, l.id, "resume_search", "resume", w.clock.iso())
    log(w, "tick @ resume due", l.id, await gateStr(w, l.id))
    await doTick(w)
    const jobs = await claim(w)
    const canceled = runStr(w, l.id).startsWith("superseded/") || runStr(w, l.id).startsWith("canceled/")
    ck(!canceled && jobs.length === 1, "resume_search should send its one message")
    if (canceled) note("BUG: gate cancels resume_search (applicableSequence() returns new_lead) → step-3 supersede fires")
  })

  // 14) Offline several hours → reconnect → revalidate → re-space (no bulk flush)
  await scenario(14, "Offline → reconnect: one send released, stale canceled, backlog re-spaced", async (w, ck) => {
    const leads = Array.from({ length: 7 }, (_, i) => seed(w, { id: 200 + i, followup_opt_in: true, phone: `+1555000${i}` }))
    await doTick(w); w.clock.advMin(5); await doTick(w) // 7 Text-1 intents pending, staggered
    let pending = [...w.store.intents.values()].filter((i) => i.dispatch_status === "pending")
    ck(pending.length === 7, `7 Text-1 intents pending (got ${pending.length})`)
    const snb0 = pending.map((i) => new Date(i.send_not_before!).getTime()).sort((a, b) => a - b)
    const g0 = snb0.slice(1).map((t, i) => Math.round((t - snb0[i]) / 60000))
    ck(g0.every((g) => g >= 3 && g <= 7), `enqueue stagger gaps 3–7 min (got ${g0.join(",")})`)
    log(w, "device OFFLINE 3h", 0, "", `${pending.length} pending, staggered`)
    w.clock.advHr(3)
    w.store.patchLead(leads[0].id, { sms_opt_in: false }) // one became stale while offline
    log(w, "reconnect → claim", 0, "", "revalidate + re-space")
    const jobs = await claim(w)
    ck(jobs.length === 1, `reconnect claim releases exactly ONE (got ${jobs.length}) — no burst`)
    ck(w.store.intentsForLead(leads[0].id)[0].dispatch_status === "superseded", "stale (opt-out) intent canceled at revalidation, not sent")
    pending = [...w.store.intents.values()].filter((i) => i.dispatch_status === "pending")
    const dueNow = pending.filter((i) => new Date(i.send_not_before!).getTime() <= w.clock.t)
    ck(pending.length === 5 && dueNow.length === 0, `5 survivors re-spaced to future — none claimable now (pending=${pending.length}, dueNow=${dueNow.length})`)
  })

  // 15) Many overdue → stale canceled at tick; note: no server-side re-spacing
  await scenario(15, "Backlog of overdue runs → stale canceled; valid enqueued", async (w, ck, note) => {
    const good = seed(w, { id: 300, followup_opt_in: true })
    const stale = seed(w, { id: 301, followup_opt_in: true })
    await doTick(w) // both enrolled t1 @+5m
    w.store.patchLead(stale.id, { followup_opt_in: false }) // becomes ineligible
    w.clock.advHr(4) // long overdue
    log(w, "tick after 4h backlog", 0, "", "")
    await doTick(w)
    const goodPending = w.store.intentsForLead(good.id).some((i) => i.dispatch_status === "pending")
    const stalePending = w.store.intentsForLead(stale.id).some((i) => i.dispatch_status === "pending")
    ck(goodPending, "valid overdue lead → intent enqueued")
    ck(!stalePending, "ineligible overdue lead → no intent (held, not sent)")
    note("Valid sends now carry a staggered send_not_before (cross-client 3–7 min); see scenarios 14 & 20 for the re-spacing on a backlog.")
  })

  // 16) Duplicate dispatcher tick → single intent
  await scenario(16, "Duplicate tick → exactly one intent", async (w, ck) => {
    const l = seed(w, { id: 400, followup_opt_in: true })
    await doTick(w); w.clock.advMin(5)
    await doTick(w); await doTick(w) // duplicate tick same instant
    const pending = w.store.intentsForLead(l.id).filter((i) => i.dispatch_status === "pending").length
    log(w, "two ticks @+5m", l.id, "", `${pending} intent(s)`)
    ck(pending === 1, `exactly one pending intent after duplicate tick (got ${pending})`)
  })

  // 17) Duplicate claim → no double hand-off
  await scenario(17, "Duplicate claim → second returns nothing", async (w, ck) => {
    const l = seed(w, { id: 410, followup_opt_in: true })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    const first = await claim(w)
    const second = await claim(w)
    log(w, "claim x2", l.id, "", `first=${first.length} second=${second.length}`)
    ck(first.length === 1 && second.length === 0, "job claimed once; second claim empty (no double-send)")
  })

  // 18) Duplicate ack → run advances once
  await scenario(18, "Duplicate ack → idempotent (run advances once)", async (w, ck) => {
    const l = seed(w, { id: 420, followup_opt_in: true })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    const jobs = await claim(w)
    const r1 = await runAck(w.store, { intentId: jobs[0].intentId, workspaceId: WS, deviceId: DEV, status: "sent", localSentAt: w.clock.iso(), spacingMs: SIM_SPACING_MS })
    const r2 = await runAck(w.store, { intentId: jobs[0].intentId, workspaceId: WS, deviceId: DEV, status: "sent", localSentAt: w.clock.iso(), spacingMs: SIM_SPACING_MS })
    log(w, "ack x2", l.id, "", `r1=${r1.status} r2=${r2.already ? "already" : r2.status}`)
    ck(r2.already === true, "second ack is a no-op (already sent)")
    ck(runStr(w, l.id).startsWith("waiting/t2") || runStr(w, l.id).startsWith("due/t2"), "run advanced to t2 exactly once")
  })

  // 19) Quiet hours → reschedule, then send in-window
  await scenario(19, "Quiet hours → reschedule to 09:00, then send", async (w, ck) => {
    // 02:00 America/Chicago = 07:00Z (CDT). Lead created 01:55 CT → Text 1 due 02:00 CT.
    const l = seed(w, { id: 430, followup_opt_in: true, created_at: "2026-09-28T06:55:00Z" })
    w.clock.set("2026-09-28T07:00:00Z")
    await doTick(w) // enroll (created within window) + evaluate
    log(w, "tick @ 02:00 CT", l.id, await gateStr(w, l.id))
    await doTick(w)
    ck((await claim(w)).length === 0, "nothing sent during quiet hours")
    const r = w.store.runForLead(l.id)!
    const hourCT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: false }).format(new Date(r.next_eligible_at!))
    ck(hourCT === "09", `rescheduled to 09:00 client-local (got ${hourCT}:00)`)
    log(w, "rescheduled", l.id, "reschedule:quiet_hours")
    w.clock.set(r.next_eligible_at!)
    await doTick(w)
    ck((await claim(w)).length === 1, "sends once inside allowed hours")
    log(w, "tick @ 09:00 CT", l.id, "send")
  })

  // 20) Multiple leads eligible together → cross-client staggering
  await scenario(20, "Simultaneous eligibility → cross-client staggering (3–7 min)", async (w, ck) => {
    for (let i = 0; i < 3; i++) seed(w, { id: 500 + i, followup_opt_in: true, phone: `+1555999${i}` })
    await doTick(w); w.clock.advMin(5); await doTick(w)
    const jobs = await claim(w)
    ck(jobs.length === 1, `only ONE client released at this instant (got ${jobs.length}) — no same-timestamp blast`)
    const pending = [...w.store.intents.values()].filter((i) => i.dispatch_status === "pending")
    ck(pending.length === 2, `other 2 clients remain pending on future send slots (got ${pending.length})`)
    const snbs = pending.map((i) => new Date(i.send_not_before!).getTime()).sort((a, b) => a - b)
    ck(snbs.every((t) => t > w.clock.t), "remaining sends scheduled in the future, not claimable now")
    const all = [w.clock.t, ...snbs]
    const gaps = all.slice(1).map((t, i) => Math.round((t - all[i]) / 60000))
    ck(gaps.every((g) => g >= 3 && g <= 7), `cross-client gaps 3–7 min (got ${gaps.join(",")} min)`)
    log(w, "claim (3 leads same +5m)", 0, "", `1 released; next slots @ +${gaps.join("m, +")}m`)
  })

  // 21) Post Tour — multiple same-day tours = ONE session, anchored to last tour end +2h
  await scenario(21, "Post Tour: 3 tours same day → one message at last-end +2h (plural copy)", async (w, ck) => {
    // Tours end 2:00 / 3:30 / 5:00 PM CT; anchor = last end (5:00 PM CT = 22:00Z).
    const lastEnd = "2026-09-28T22:00:00Z"
    const eligible = postTourEligibleAt(lastEnd)
    const l = seed(w, { id: 600, followup_opt_in: true })
    await installRun(w, l.id, "post_tour", "ask", eligible, { sessionDate: "2026-09-28", sessionTourCount: 3 })
    const hourCT = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: true }).format(new Date(iso))
    ck(new Date(eligible).getTime() === new Date(lastEnd).getTime() + 2 * 3600_000, `eligible = last tour end + 2h (${hourCT(eligible)} CT)`)
    w.clock.set(eligible)
    log(w, "tick @ last-end +2h (7PM CT)", l.id, await gateStr(w, l.id))
    await doTick(w)
    // This lead is opted in, so the same tick ALSO enrols the ordinary new_lead sequence — a
    // post_tour run carries a session_date, so it is not an "active lifecycle run" and the two
    // legitimately coexist. The scenario is about the POST-TOUR message, so it asserts on that
    // step rather than on whatever the claim happens to return first.
    // The new_lead intent enqueued by this same tick takes the first dispatch slot, so the
    // post-tour send is placed behind it by the cross-client stagger (3–7 min, pacing.ts). It is
    // scheduled, not lost — advance past the widest gap and it is claimable, exactly as production
    // would deliver it. Still 7PM CT, so no quiet-hours interaction.
    w.clock.advMin(8)
    const jobs = await claim(w)
    const tourJobs = jobs.filter((j) => j.stepKey === "ask")
    ck(tourJobs.length === 1, "exactly ONE post-tour message (not one per property)")
    ck(/tours go/.test(tourJobs[0]?.body ?? ""), "uses the multiple-tour (plural) copy")
    log(w, "claim post_tour", l.id, "send", body(tourJobs, "ask"))
    await ack(w, tourJobs, "sent")
    const tourIntents = w.store.intentsForLead(l.id).filter((i) => i.step_key === "ask")
    ck(tourIntents.length === 1, "single tour session → single intent for the day")
  }, "2026-09-28T22:00:00Z")

  // 22) Post Tour +2h falls in quiet hours → wait for next permitted window
  await scenario(22, "Post Tour: last-end +2h after 21:00 → reschedule to 09:00, then send", async (w, ck) => {
    const lastEnd = "2026-09-29T01:00:00Z" // 8:00 PM CT
    const eligible = postTourEligibleAt(lastEnd) // 10:00 PM CT → quiet hours
    const l = seed(w, { id: 610, followup_opt_in: true })
    await installRun(w, l.id, "post_tour", "ask", eligible, { sessionDate: "2026-09-28", sessionTourCount: 1 })
    w.clock.set(eligible)
    log(w, "tick @ 10PM CT", l.id, await gateStr(w, l.id))
    await doTick(w)
    ck((await claim(w)).length === 0, "not sent late at night (quiet hours)")
    const r = w.store.runForLead(l.id)!
    const hourCT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: false }).format(new Date(r.next_eligible_at!))
    ck(hourCT === "09", `rescheduled to next 09:00 client-local (got ${hourCT}:00)`)
    log(w, "rescheduled", l.id, "reschedule:quiet_hours")
    w.clock.set(r.next_eligible_at!)
    await doTick(w)
    const jobs = await claim(w)
    ck(jobs.length === 1 && /tour go/.test(jobs[0]?.body ?? ""), "sends next morning; single-tour copy")
    log(w, "tick @ 09:00 CT", l.id, "send", body(jobs, "ask"))
  }, "2026-09-29T01:00:00Z")

  // 23) Meaningful feedback before the Post Tour time → cancel the generic message
  await scenario(23, "Post Tour: client gives feedback first → generic message canceled", async (w, ck) => {
    const lastEnd = "2026-09-28T22:00:00Z"
    const eligible = postTourEligibleAt(lastEnd)
    const l = seed(w, { id: 620, followup_opt_in: true })
    await installRun(w, l.id, "post_tour", "ask", eligible, { sessionDate: "2026-09-28", sessionTourCount: 3 })
    w.clock.set("2026-09-28T23:00:00Z") // 6PM CT, before the 7PM eligibility
    w.store.setConversation(l.id, { lastInboundAt: w.clock.iso() })
    log(w, "client texts feedback (6PM)", l.id, "", "inbound recorded")
    w.clock.set(eligible)
    log(w, "tick @ 7PM CT", l.id, await gateStr(w, l.id))
    await doTick(w)
    // Same coexistence as scenario 21: assert on the POST-TOUR run and the post-tour step, not on
    // the latest run (which is the separately-enrolled new_lead sequence) or on every claimed job.
    const tourRun = w.store.runsForLead(l.id).find((r) => r.sequence_key === "post_tour")
    ck(tourRun?.status === "canceled" && tourRun?.stop_reason === "client_replied",
      "post_tour canceled (client_replied)")
    ck((await claim(w)).filter((j) => j.stepKey === "ask").length === 0,
      "no generic post-tour message sent")
  }, "2026-09-28T22:00:00Z")

  // 24) Post Tour PRODUCTION HOOK: tours in lead_tours → one run at MAX(ends_at)+2h
  await scenario(24, "Post Tour hook: 3 tours → one run at last-end +2h, plural copy, manual suppressed", async (w, ck) => {
    // created_at day-before so enrollNewLeads (6h window) doesn't take the slot.
    const l = seed(w, { id: 700, followup_opt_in: true, crm_status: "ready_to_tour", created_at: "2026-09-27T14:00:00Z" })
    // Tours 1:00–2:00, 2:30–3:30, 4:00–5:00 PM CT (last end 5PM CT = 22:00Z).
    w.store.putTours(l.id, [
      { scheduledAt: "2026-09-28T18:00:00Z", endsAt: "2026-09-28T19:00:00Z" },
      { scheduledAt: "2026-09-28T19:30:00Z", endsAt: "2026-09-28T20:30:00Z" },
      { scheduledAt: "2026-09-28T21:00:00Z", endsAt: "2026-09-28T22:00:00Z" },
    ])
    w.store.setManualTourFollowUp(l.id, true) // the manual one-tap action exists
    const anchor = postTourEligibleAt("2026-09-28T22:00:00Z") // 7PM CT
    log(w, "tick (enroll post_tour)", l.id, "", "")
    await doTick(w)
    const r = w.store.runForLead(l.id)!
    ck(r.sequence_key === "post_tour" && r.next_eligible_at === anchor, "one post_tour run anchored at last-end +2h (7PM CT)")
    ck([...w.store.runs.values()].filter((x) => x.lead_id === l.id && x.sequence_key === "post_tour").length === 1, "exactly ONE post_tour run (not one per property)")
    ck(!w.store.hasManualTourFollowUp(l.id), "manual tour_follow_up suppressed (automation owns handoff)")
    log(w, "post_tour scheduled", l.id, "", runStr(w, l.id))
    w.clock.set(anchor)
    log(w, "tick @ 7PM CT", l.id, await gateStr(w, l.id))
    await doTick(w)
    const jobs = await claim(w)
    ck(jobs.length === 1 && /tours go/.test(jobs[0]?.body ?? ""), "one message, plural copy (3 tours)")
    log(w, "claim post_tour", l.id, "send", body(jobs, "ask"))
  }, "2026-09-28T14:00:00Z")

  // 25) Tour rescheduled later → SAME run repointed, no duplicate
  await scenario(25, "Post Tour hook: reschedule repoints the same run (no duplicate)", async (w, ck) => {
    const l = seed(w, { id: 710, followup_opt_in: true, crm_status: "ready_to_tour", created_at: "2026-09-27T14:00:00Z" })
    w.store.putTours(l.id, [{ scheduledAt: "2026-09-28T21:00:00Z", endsAt: "2026-09-28T22:00:00Z" }]) // ends 5PM CT
    await doTick(w)
    const first = w.store.runForLead(l.id)!
    const anchor1 = postTourEligibleAt("2026-09-28T22:00:00Z")
    ck(first.next_eligible_at === anchor1, "initial anchor = 7PM CT")
    // Reschedule the tour later: now ends 6PM CT (23:00Z).
    w.store.putTours(l.id, [{ scheduledAt: "2026-09-28T22:00:00Z", endsAt: "2026-09-28T23:00:00Z" }])
    log(w, "tour rescheduled +1h", l.id, "", "")
    await doTick(w)
    const runs = [...w.store.runs.values()].filter((x) => x.lead_id === l.id && x.sequence_key === "post_tour")
    const anchor2 = postTourEligibleAt("2026-09-28T23:00:00Z")
    ck(runs.length === 1, `still exactly one post_tour run (got ${runs.length})`)
    ck(runs[0].id === first.id && runs[0].next_eligible_at === anchor2, "same run repointed to new anchor (8PM CT)")
    log(w, "tick (repoint)", l.id, "", runStr(w, l.id))
  }, "2026-09-28T14:00:00Z")

  // 26) Two DIFFERENT tour dates on one lead → two independent Post Tour sessions
  await scenario(26, "Post Tour hook: two tour dates → two independent runs (per-date copy)", async (w, ck) => {
    const l = seed(w, { id: 720, followup_opt_in: true, crm_status: "ready_to_tour", created_at: "2026-09-20T14:00:00Z" })
    // Sept 25 CT: two tours (last end 3:00 PM CT = 20:00Z). Sept 27 CT: one tour (end 2:00 PM CT = 19:00Z).
    w.store.putTours(l.id, [
      { scheduledAt: "2026-09-25T18:00:00Z", endsAt: "2026-09-25T19:00:00Z" }, // 1–2 PM CT Sep25
      { scheduledAt: "2026-09-25T19:00:00Z", endsAt: "2026-09-25T20:00:00Z" }, // 2–3 PM CT Sep25
      { scheduledAt: "2026-09-27T18:00:00Z", endsAt: "2026-09-27T19:00:00Z" }, // 1–2 PM CT Sep27
    ])
    log(w, "tick (enroll post_tour ×2 dates)", l.id, "", "")
    await doTick(w)
    const runs = [...w.store.runs.values()].filter((x) => x.lead_id === l.id && x.sequence_key === "post_tour")
    ck(runs.length === 2, `two independent post_tour runs, one per date (got ${runs.length})`)
    const byDate = Object.fromEntries(runs.map((r) => [r.session_date, r]))
    const a25 = postTourEligibleAt("2026-09-25T20:00:00Z") // 5 PM CT Sep25
    const a27 = postTourEligibleAt("2026-09-27T19:00:00Z") // 4 PM CT Sep27
    ck(byDate["2026-09-25"]?.next_eligible_at === a25 && byDate["2026-09-25"]?.session_tour_count === 2, "Sept 25 run: last-end +2h, count 2 (plural)")
    ck(byDate["2026-09-27"]?.next_eligible_at === a27 && byDate["2026-09-27"]?.session_tour_count === 1, "Sept 27 run: last-end +2h, count 1 (singular)")

    // Reschedule a Sept 25 tour later; must NOT touch the Sept 27 run.
    const before27 = byDate["2026-09-27"]!.next_eligible_at
    w.store.putTours(l.id, [
      { scheduledAt: "2026-09-25T18:00:00Z", endsAt: "2026-09-25T19:00:00Z" },
      { scheduledAt: "2026-09-25T20:00:00Z", endsAt: "2026-09-25T21:00:00Z" }, // moved to 3–4 PM CT → last end 4 PM CT
      { scheduledAt: "2026-09-27T18:00:00Z", endsAt: "2026-09-27T19:00:00Z" },
    ])
    log(w, "reschedule a Sept 25 tour", l.id, "", "")
    await doTick(w)
    const runs2 = [...w.store.runs.values()].filter((x) => x.lead_id === l.id && x.sequence_key === "post_tour")
    const byDate2 = Object.fromEntries(runs2.map((r) => [r.session_date, r]))
    ck(runs2.length === 2, "still exactly two runs after reschedule")
    ck(byDate2["2026-09-25"]?.next_eligible_at === postTourEligibleAt("2026-09-25T21:00:00Z"), "Sept 25 run repointed to new last-end +2h")
    ck(byDate2["2026-09-27"]?.next_eligible_at === before27, "Sept 27 run UNCHANGED by the Sept 25 reschedule")
    // Send each and confirm per-date copy.
    w.clock.set(byDate2["2026-09-25"]!.next_eligible_at!)
    await doTick(w)
    const j25 = await claim(w)
    ck(j25.some((j) => /tours go/.test(j.body)), "Sept 25 delivers PLURAL copy (2 tours)")
    log(w, "claim Sept 25", l.id, "send", body(j25, "ask"))
  }, "2026-09-24T14:00:00Z")

  // ── Report ────────────────────────────────────────────────────────────────
  const line = "─".repeat(96)
  for (const r of results) {
    console.log("\n" + line)
    console.log(`Scenario ${r.n}: ${r.name}   [${r.verdict}]`)
    console.log(line)
    console.log("time".padEnd(9) + "| " + "event".padEnd(28) + "| " + "gate decision".padEnd(26) + "| step / message · run state")
    for (const row of r.rows) {
      const detail = [row.step, row.run].filter(Boolean).join("  ·  ")
      console.log(row.time.padEnd(9) + "| " + row.event.slice(0, 27).padEnd(28) + "| " + row.gate.slice(0, 25).padEnd(26) + "| " + detail)
    }
    for (const nns of r.notes) console.log("   " + nns)
  }

  console.log("\n" + "═".repeat(96))
  const passed = results.filter((r) => r.pass).length
  console.log(`SUMMARY: ${passed}/${results.length} scenarios passed as asserted`)
  const flagged = results.filter((r) => !r.pass)
  if (flagged.length) console.log("FLAGGED: " + flagged.map((r) => "#" + r.n).join(", "))
  console.log("═".repeat(96))
  process.exit(0)
}

main()
