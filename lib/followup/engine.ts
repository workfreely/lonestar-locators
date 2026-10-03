// Follow-Up Agent — ENGINE CORE (store-injected orchestration).
//
// This is the SINGLE implementation of enroll / tick / claim / ack / run
// advancement. Production calls it with a Supabase-backed store + real clock; the
// dry-run simulator calls the exact same functions with an in-memory store +
// virtual clock. All decisions come from the real pure logic (evaluateSend,
// applicableSequence, nextStepEligibility, resolveStepBody, pacing) — nothing here
// is a simplified re-implementation. The engine never sends: it only enqueues,
// claims, and advances; the device (real Beast Sync, or the simulator playing its
// role) is what turns a claimed job into a delivered message + an ack.

import { evaluateSend } from "./gate"
import { applicableSequence, resolveStepBody } from "./sequences"
import {
  newLeadText1EligibleAt,
  nextStepEligibility,
  postTourEligibleAt,
  listSentFu1EligibleAt,
  doneSelectingEligibleAt,
  applicationStatusEligibleAt,
  resumeSearchEligibleAt,
} from "./cadence"
import { interClientJitterMs, nextCrossClientSlotMs } from "./pacing"
import { runSnapshotFromRow } from "./snapshot"
import type { SequenceKey } from "./types"
import type { FollowupStore, IntentRow, LeadRow, RunRow } from "./store"

export const NEW_LEAD_ENROLL_WINDOW_MS = 6 * 60 * 60 * 1000
export const TICK_BATCH = 100
export const CLAIM_CAP = 5
export const HOLD_BACKOFF_MS = 15 * 60 * 1000

export type TickSummary = {
  enrolled: number
  evaluated: number
  enqueued: number
  rescheduled: number
  canceled: number
  held: number
}

export type ClaimJob = {
  intentId: string
  idempotencyKey: string
  leadId: number
  toPhone: string
  body: string
  sequenceKey: string
  stepKey: string
}

// ── Enrollment ──────────────────────────────────────────────────────────────
//
// THE MISSING PRODUCERS. The registry defined list_sent, done_selecting and
// application_status, and applicableSequence() returned them — but nothing ever
// CREATED a run for them. So the lifecycle ladder acted purely as a cancellation
// mechanism: sending the list superseded the new_lead run with no list_sent run to
// follow, and automated texting for that lead stopped permanently.
//
// One producer now covers every lifecycle sequence, keyed off the SAME
// applicableSequence() the gate uses, so enrollment and supersession can never
// disagree about which sequence a lead belongs in.

/** First-step seed for a lifecycle sequence, or null when it cannot start yet. */
function lifecycleSeed(
  applicable: SequenceKey,
  row: LeadRow,
  share: Awaited<ReturnType<FollowupStore["share"]>>,
  lead: Awaited<ReturnType<FollowupStore["leadSnapshot"]>>,
  now: Date,
): { sequence_key: string; step_key: string; step_index: number; next_eligible_at: string } | null {
  switch (applicable) {
    case "new_lead": {
      // OUT OF OFFICE — this lead arrived while the locator was away, so the
      // normal two-text opening ("I got your form!" → "a specific address or side
      // of town?") must not fire: it would promise an immediacy nobody is there to
      // deliver. Returning null is the SAME path the staleness guard below already
      // uses, so no run and no intent is ever created — suppression at the source,
      // not a queued message waiting to escape later. No t1 means no t2, since t2
      // is only scheduled by advanceRun once t1 is ACKed.
      //
      // Deliberately keyed on the LEAD's stamp, never the workspace's current
      // state: toggling OOO off must not retroactively change how a lead created
      // weeks ago is handled. The stamp is permanent history and is never cleared;
      // manual resume will use separate state.
      //
      // Scoped to new_lead ONLY. list_sent, done_selecting, application_status,
      // tours and resume-search are untouched, and a lead with ooo_held_at = null
      // takes exactly the path it always did.
      if (row.ooo_held_at) return null
      // The ONLY windowed sequence: Text 1's copy names the form the client just
      // submitted, so a lead created days ago must not be back-filled into it.
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0
      if (!createdAt || now.getTime() - createdAt > NEW_LEAD_ENROLL_WINDOW_MS) return null
      return { sequence_key: "new_lead", step_key: "t1", step_index: 0, next_eligible_at: newLeadText1EligibleAt(row.created_at as string) }
    }
    case "list_sent":
      if (!share.sentAt) return null
      return { sequence_key: "list_sent", step_key: "fu1", step_index: 0, next_eligible_at: listSentFu1EligibleAt(share.sentAt) }
    case "done_selecting":
      if (!share.doneSelectingAt) return null
      return { sequence_key: "done_selecting", step_key: "evaluate", step_index: 0, next_eligible_at: doneSelectingEligibleAt(share.doneSelectingAt) }
    case "application_status":
      if (!lead.appliedAt) return null
      return { sequence_key: "application_status", step_key: "ask", step_index: 0, next_eligible_at: applicationStatusEligibleAt(lead.appliedAt) }
    default:
      // Event-triggered sequences are never lifecycle-derivable; applicableSequence
      // cannot return them, and they have their own producers.
      return null
  }
}

/**
 * Enroll / re-home every enrolled lead into the lifecycle sequence its CURRENT
 * state makes applicable.
 *
 * Retires a stale lifecycle run itself rather than waiting for the gate to notice
 * when the run next comes due: the one-active-lifecycle unique index means a stale
 * run BLOCKS its replacement, so leaving it in place would stall the lead for as
 * long as its next_eligible_at is in the future.
 */
export async function enrollLifecycleRuns(store: FollowupStore, now: Date): Promise<number> {
  const rows = await store.enrolledLeads(TICK_BATCH)
  let enrolled = 0
  for (const row of rows) {
    const lead = await store.leadSnapshot(row)
    if (!lead.accountAuthorized || !lead.followupOptIn) continue
    const share = await store.share(row.id)
    const applicable = applicableSequence(lead, share)
    if (!applicable) continue // closed/archived — nothing applies

    const active = await store.activeLifecycleRun(row.id)
    if (active) {
      if (active.sequence_key === applicable) continue // already in the right sequence
      // Same verdict the gate reaches, applied here so the slot frees immediately.
      await store.updateRun(active.id, {
        status: "superseded",
        stop_reason: "sequence_superseded",
        last_evaluated_at: now.toISOString(),
      })
    }

    const seed = lifecycleSeed(applicable, row, share, lead, now)
    if (!seed) continue
    const conv = await store.conversation(row.id)
    const ok = await store.insertRun({
      lead_id: row.id,
      workspace_id: row.workspace_id,
      owner_user_id: row.owner_user_id,
      mode: "auto",
      status: "waiting",
      baseline_inbound_at: conv.lastInboundAt,
      sequence_version: 1,
      ...seed,
    })
    if (ok) enrolled++
  }
  return enrolled
}

/**
 * RESUME SEARCH — event-triggered, enrolled from the durable
 * client_recommendation_shares.resumed_at that lb_client_resume_search flips ONCE,
 * atomically ("only the first request flips resumed_at").
 *
 * Uses session_date, the existing event-session pattern that post_tour already
 * proves: the unique index on (lead_id, sequence_key, session_date) gives
 * enrol-exactly-once per resume AND lets this coexist with the lead's lifecycle
 * run, which is the only coexistence this model explicitly allows.
 */
export async function enrollResumeSearchRuns(store: FollowupStore, now: Date): Promise<number> {
  const rows = await store.enrolledLeads(TICK_BATCH)
  let created = 0
  for (const row of rows) {
    const share = await store.share(row.id)
    if (!share.resumedAt) continue
    const lead = await store.leadSnapshot(row)
    if (!lead.accountAuthorized || !lead.followupOptIn) continue

    // One run per resume event. The date is derived from resumed_at itself, so a
    // second tick cannot create a second run for the same resume.
    const sessionDate = (share.resumedAt as string).slice(0, 10)
    if (await store.sessionRunExists(row.id, "resume_search", sessionDate)) continue

    const conv = await store.conversation(row.id)
    const ok = await store.insertRun({
      lead_id: row.id,
      workspace_id: row.workspace_id,
      owner_user_id: row.owner_user_id,
      mode: "auto",
      sequence_key: "resume_search",
      step_key: "resume",
      step_index: 0,
      status: "waiting",
      next_eligible_at: resumeSearchEligibleAt(share.resumedAt as string),
      baseline_inbound_at: conv.lastInboundAt,
      sequence_version: 1,
      session_date: sessionDate,
    })
    if (ok) created++
  }
  return created
}

// ── Post Tour enrollment (event-triggered, one run per tour session) ──────────
// For each enrolled+authorized lead with confirmed tours, ensure EXACTLY ONE
// post_tour run anchored to MAX(ends_at) + 2h — the whole day's tours are one
// session, never one message per property. Reschedules repoint the same run; a
// canceled/sent session is not recreated (dedup by anchor). Creating the run also
// stands down the manual tour_follow_up (enrollment-gated handoff). Quiet hours +
// conversation-cancel are enforced later by the gate, unchanged.
export async function enrollPostTourRuns(store: FollowupStore, now: Date): Promise<number> {
  const leads = await store.enrolledLeadsWithActiveTours(TICK_BATCH)
  let created = 0
  for (const row of leads) {
    const lead = await store.leadSnapshot(row)
    if (!lead.accountAuthorized || !lead.followupOptIn) continue
    const tours = await store.activeToursForLead(row.id)
    if (tours.length === 0) continue

    // Group confirmed tours by the CLIENT-LOCAL calendar date. Each distinct tour
    // day is its own independent Post Tour session — a later day never changes or
    // suppresses an earlier day's run. Timezone falls back to America/Chicago when
    // the lead has none (empty/unset), so Intl never throws on an invalid zone.
    const tz = lead.timeZone || "America/Chicago"
    const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    const byDate = new Map<string, { scheduledAt: string; endsAt: string }[]>()
    for (const t of tours) {
      const day = dayFmt.format(new Date(t.scheduledAt)) // YYYY-MM-DD in the client's zone
      const arr = byDate.get(day) ?? []
      arr.push(t)
      byDate.set(day, arr)
    }

    for (const [sessionDate, group] of byDate) {
      const lastEndMs = Math.max(...group.map((t) => new Date(t.endsAt).getTime()))
      const anchor = postTourEligibleAt(new Date(lastEndMs).toISOString())
      const count = group.length

      const active = await store.activePostTourRunForDate(row.id, sessionDate)
      if (active) {
        // Reschedule within THIS date → repoint only this date's run.
        if (active.next_eligible_at !== anchor || active.session_tour_count !== count) {
          await store.updateRun(active.id, { next_eligible_at: anchor, session_tour_count: count, last_evaluated_at: now.toISOString() })
        }
        continue
      }
      if (await store.postTourRunExistsForDate(row.id, sessionDate)) continue // this day already sent/canceled

      const conv = await store.conversation(row.id)
      const ok = await store.insertRun({
        lead_id: row.id,
        workspace_id: row.workspace_id,
        owner_user_id: row.owner_user_id,
        mode: "auto",
        sequence_key: "post_tour",
        step_key: "ask",
        step_index: 0,
        status: "waiting",
        next_eligible_at: anchor,
        baseline_inbound_at: conv.lastInboundAt,
        sequence_version: 1,
        session_date: sessionDate,
        session_tour_count: count,
      })
      if (ok) {
        created++
        await store.suppressManualTourFollowUp(row.id) // automation owns the handoff
      }
    }
  }
  return created
}

// ── Dispatcher tick ───────────────────────────────────────────────────────────
export async function tick(store: FollowupStore, now: Date): Promise<TickSummary> {
  const summary: TickSummary = {
    enrolled:
      (await enrollLifecycleRuns(store, now)) +
      (await enrollPostTourRuns(store, now)) +
      (await enrollResumeSearchRuns(store, now)),
    evaluated: 0,
    enqueued: 0,
    rescheduled: 0,
    canceled: 0,
    held: 0,
  }

  const runs = await store.dueWaitingRuns(now.toISOString(), TICK_BATCH)
  for (const run of runs) {
    summary.evaluated++
    const leadRow = await store.leadRow(run.lead_id)
    if (!leadRow) {
      await standDown(store, run.id, "stale")
      summary.canceled++
      continue
    }
    const lead = await store.leadSnapshot(leadRow)
    const conv = await store.conversation(run.lead_id)
    const share = await store.share(run.lead_id)
    const decision = evaluateSend(now, lead, conv, share, runSnapshotFromRow(run))

    if (decision.action === "send") {
      const enq = await enqueueIntent(store, now, run, lead, decision.templateKey, decision.body)
      if (enq) summary.enqueued++
    } else if (decision.action === "reschedule") {
      await store.updateRun(run.id, { next_eligible_at: decision.nextEligibleAt, last_evaluated_at: now.toISOString() })
      summary.rescheduled++
    } else if (decision.action === "cancel") {
      await standDown(store, run.id, decision.reason)
      summary.canceled++
    } else {
      await store.updateRun(run.id, { last_evaluated_at: now.toISOString() })
      summary.held++
    }
  }
  return summary
}

async function standDown(store: FollowupStore, runId: string, reason: string): Promise<void> {
  const status = reason === "sequence_superseded" ? "superseded" : "canceled"
  await store.updateRun(runId, { status, stop_reason: reason, last_evaluated_at: new Date().toISOString() })
}

async function enqueueIntent(
  store: FollowupStore,
  now: Date,
  run: RunRow,
  lead: Awaited<ReturnType<FollowupStore["leadSnapshot"]>>,
  templateKey: string,
  body: string,
): Promise<boolean> {
  // Cross-client stagger: place this send a 3–7 min gap after the workspace's
  // latest already-scheduled send, so several clients never become claimable at
  // the same instant. First send in a quiet workspace goes immediately.
  const latest = await store.latestPendingSendAt(run.workspace_id)
  const sendNotBefore = new Date(
    nextCrossClientSlotMs(latest ? new Date(latest).getTime() : 0, now.getTime()),
  ).toISOString()

  const idempotencyKey = `${run.id}:${run.step_key}`
  const res = await store.insertIntent({
    run_id: run.id,
    lead_id: run.lead_id,
    workspace_id: run.workspace_id,
    owner_user_id: run.owner_user_id,
    sequence_key: run.sequence_key,
    step_key: run.step_key,
    template_key: templateKey,
    rendered_body: body,
    decision: "send",
    decision_reason: "send",
    evaluated_state: {
      crmStatus: lead.crmStatus,
      smsOptIn: lead.smsOptIn,
      accountAuthorized: lead.accountAuthorized,
      followupOptIn: lead.followupOptIn,
      at: now.toISOString(),
    },
    dispatch_status: "pending",
    idempotency_key: idempotencyKey,
    send_not_before: sendNotBefore,
  })

  // `status: "due"` means "an intent for this step is live". It must therefore be
  // written ONLY when one actually is, because `due` leaves dueWaitingRuns and
  // nothing re-evaluates it afterwards — a run marked due with no live intent is
  // stalled permanently, and it keeps holding the one-active-lifecycle slot.
  //
  // insertIntent cannot tell the two failure modes apart on its own: it returns
  // "duplicate" both when a genuinely active intent already exists (a duplicate
  // cron tick — `due` is the truth) and when the insert really failed (where
  // `due` is the stall). The Supabase adapter deliberately collapses any insert
  // error into "duplicate" so it can never double-send, which makes that
  // ambiguity structural. So ask the store which case this is.
  if (res !== "ok") {
    const active = await store.activeIntentFor(run.id, run.step_key)
    if (active) {
      await store.updateRun(run.id, { status: "due", last_evaluated_at: now.toISOString() })
    } else {
      // Nothing is live and nothing was enqueued. Stay WAITING so a later tick
      // re-evaluates, backed off by the same interval a hold uses so a persistent
      // failure does not re-attempt every minute.
      await store.updateRun(run.id, {
        status: "waiting",
        next_eligible_at: new Date(now.getTime() + HOLD_BACKOFF_MS).toISOString(),
        last_evaluated_at: now.toISOString(),
      })
    }
    return false
  }

  await store.updateRun(run.id, { status: "due", last_evaluated_at: new Date().toISOString() })
  return true
}

// ── Claim (device pulls approved jobs; re-validated here) ──────────────────────
export async function runClaim(
  store: FollowupStore,
  now: Date,
  deviceId: string,
  workspaceId: string,
): Promise<ClaimJob[]> {
  const intents = await store.pendingIntents(workspaceId, CLAIM_CAP * 8)
  const jobs: ClaimJob[] = []

  // Anti-burst: hand out at most ONE routine (cross-client) send per claim. Any
  // further routine job that is also due right now (e.g. a reconnect backlog whose
  // staggered slots all elapsed while offline) is RE-SPACED into a fresh 3–7 min
  // catch-up schedule and left pending — it becomes claimable only when its new
  // slot arrives. The same-client Text 2 pair is time-critical and exempt.
  let routineReleased = false
  let respaceCursorMs = now.getTime()

  for (const intent of intents) {
    if (jobs.length >= CLAIM_CAP) break
    if (!intent.run_id) {
      await supersedeIntent(store, intent.id, "stale")
      continue
    }
    const run = await store.runById(intent.run_id)
    const leadRow = await store.leadRow(intent.lead_id)
    if (!run || !leadRow) {
      await supersedeIntent(store, intent.id, "stale")
      continue
    }
    const lead = await store.leadSnapshot(leadRow)
    const conv = await store.conversation(run.lead_id)
    const share = await store.share(run.lead_id)
    const decision = evaluateSend(now, lead, conv, share, runSnapshotFromRow(run))

    if (decision.action === "send") {
      const toPhone = (leadRow.phone ?? "").trim()
      if (!toPhone) {
        await supersedeIntent(store, intent.id, "stale")
        continue
      }
      // Dispatch pacing: only genuinely-due work is exposed.
      const notBeforeMs = intent.send_not_before ? new Date(intent.send_not_before).getTime() : new Date(intent.created_at).getTime()
      if (notBeforeMs > now.getTime()) continue // not due at the pacing layer — leave pending

      const isPair = intent.step_key === "t2" // same-client Text 2 — exempt from throttle
      if (!isPair && routineReleased) {
        // Overdue extra routine send → re-space instead of bursting.
        respaceCursorMs += interClientJitterMs()
        await store.updateIntent(intent.id, { send_not_before: new Date(respaceCursorMs).toISOString() })
        continue
      }

      // ATOMIC CLAIM. Only the device that actually flipped the row from pending
      // gets the job; a simultaneous poll from a second paired Mac changes nothing
      // and is handed nothing, so one intent can never produce two texts.
      const won = await store.claimIntent(intent.id, {
        dispatch_status: "claimed",
        gateway_device_id: deviceId,
        claimed_at: now.toISOString(),
        rendered_body: decision.body,
      })
      if (!won) continue // another device won it — do not release this job
      jobs.push({
        intentId: intent.id,
        idempotencyKey: intent.idempotency_key ?? "",
        leadId: run.lead_id,
        toPhone,
        body: decision.body,
        sequenceKey: run.sequence_key,
        stepKey: run.step_key,
      })
      if (!isPair) routineReleased = true
    } else if (decision.action === "cancel") {
      await supersedeIntent(store, intent.id, decision.reason)
      const status = decision.reason === "sequence_superseded" ? "superseded" : "canceled"
      await store.updateRun(run.id, { status, stop_reason: decision.reason, last_evaluated_at: now.toISOString() })
    } else if (decision.action === "reschedule") {
      await supersedeIntent(store, intent.id, decision.reason)
      await store.updateRun(run.id, { status: "waiting", next_eligible_at: decision.nextEligibleAt, last_evaluated_at: now.toISOString() })
    } else if (decision.reason === "not_eligible_yet") {
      continue // leave pending — claimed when actually due (e.g. the +30s Text 2)
    } else {
      await supersedeIntent(store, intent.id, decision.reason)
      await store.updateRun(run.id, {
        status: "waiting",
        next_eligible_at: new Date(now.getTime() + HOLD_BACKOFF_MS).toISOString(),
        last_evaluated_at: now.toISOString(),
      })
    }
  }
  return jobs
}

/**
 * Withdraw a queued intent, releasing its idempotency key.
 *
 * `followup_outbound_intents.idempotency_key` is declared `text unique` —
 * UNCONDITIONALLY unique across the table, not partial. Leaving the key on a
 * superseded row meant the SAME step could never be enqueued again: the
 * replacement insert collided with a terminal row, and the run was then marked
 * `due` with nothing live and stalled forever. Turning Automated Texts off and
 * back on was a one-way door for whichever step happened to be queued.
 *
 * Nulling the key is safe and is the contract the rest of the engine already
 * assumes:
 *   • The row itself is PRESERVED — status, reason, rendered body, sequence/step
 *     and timestamps all stay, so what was almost sent remains auditable. Only
 *     the dedup token is released, and a token is not evidence.
 *   • Double-send protection for LIVE intents is unaffected. That comes from the
 *     partial index followup_intents_active_step_uidx (run_id, step_key) WHERE
 *     dispatch_status IN ('pending','claimed','sent') — which already excludes
 *     'superseded', i.e. it was written expecting exactly this re-enqueue — plus
 *     the atomic claim, which only ever flips a row that is still 'pending'. A
 *     superseded row can never be claimed again regardless of its key.
 *   • runAck's failure path has always done this (`idempotency_key: null`) so a
 *     failed send can be retried. Supersession simply now matches it.
 */
async function supersedeIntent(store: FollowupStore, intentId: string, reason: string): Promise<void> {
  await store.updateIntent(intentId, { dispatch_status: "superseded", error: reason, idempotency_key: null })
}

// ── Ack (device confirms a send; run advances only on confirm) ─────────────────
export type AckInput = {
  intentId: string
  workspaceId: string
  deviceId: string
  status: "sent" | "failed"
  localSentAt: string
  error?: string | null
  /**
   * chat.db guid of the message this send produced, when the Mac captured it.
   * Optional — provenance falls back to exact-body correlation without it.
   */
  messageGuid?: string | null
}
export type AckResult = { ok: boolean; status?: string; already?: boolean; error?: string; code?: number }

export async function runAck(store: FollowupStore, input: AckInput): Promise<AckResult> {
  const intent = await store.intentById(input.intentId)
  if (!intent || intent.workspace_id !== input.workspaceId) return { ok: false, error: "not_found", code: 404 }
  if (intent.gateway_device_id && intent.gateway_device_id !== input.deviceId) return { ok: false, error: "wrong_device", code: 409 }
  if (intent.dispatch_status === "sent") return { ok: true, already: true }

  if (input.status === "failed") {
    await store.updateIntent(input.intentId, {
      dispatch_status: "failed",
      error: input.error ?? null,
      local_sent_at: input.localSentAt,
      idempotency_key: null,
    })
    if (intent.run_id) await store.updateRun(intent.run_id, { status: "waiting", last_evaluated_at: new Date().toISOString() })
    return { ok: true, status: "failed" }
  }

  await store.updateIntent(input.intentId, {
    dispatch_status: "sent",
    sent_at: new Date().toISOString(),
    local_sent_at: input.localSentAt,
    // The authoritative provenance link, when the device could report it. Only
    // written when present so an older build never blanks a guid.
    ...(input.messageGuid ? { message_guid: input.messageGuid } : {}),
  })
  if (intent.run_id) await advanceRun(store, intent.run_id, input.localSentAt)
  return { ok: true, status: "sent" }
}

async function advanceRun(store: FollowupStore, runId: string, sentAtIso: string): Promise<void> {
  const run = await store.runById(runId)
  if (!run) return
  const seq = run.sequence_key as SequenceKey
  const justSent = run.step_key
  const next = nextStepEligibility(seq, justSent, sentAtIso)
  if (!next) {
    await store.updateRun(runId, { status: "completed", last_evaluated_at: new Date().toISOString() })
    return
  }

  const conv = await store.conversation(run.lead_id)

  // Pre-enqueue Text 2 for the New-Lead opening pair so the exact +30s does not
  // depend on the next dispatcher tick; claim-time revalidation still applies.
  let preEnqueued = false
  if (seq === "new_lead" && justSent === "t1") {
    const leadRow = await store.leadRow(run.lead_id)
    if (leadRow) {
      const lead = await store.leadSnapshot(leadRow)
      const share = await store.share(run.lead_id)
      const body = resolveStepBody(seq, next.nextStepKey, lead, share)
      if (body) {
        const res = await store.insertIntent({
          run_id: run.id,
          lead_id: run.lead_id,
          workspace_id: run.workspace_id,
          owner_user_id: run.owner_user_id,
          sequence_key: seq,
          step_key: next.nextStepKey,
          template_key: next.nextStepKey,
          rendered_body: body,
          decision: "send",
          decision_reason: "scheduled_pair",
          evaluated_state: { pairAnchor: sentAtIso, at: new Date().toISOString() },
          dispatch_status: "pending",
          idempotency_key: `${run.id}:${next.nextStepKey}`,
          // Same-client pair: exact +30s, NOT the cross-client 3–7 min stagger.
          send_not_before: next.nextEligibleAt,
        })
        preEnqueued = res === "ok" || res === "duplicate"
      }
    }
  }

  await store.updateRun(runId, {
    step_key: next.nextStepKey,
    step_index: run.step_index + 1,
    status: preEnqueued ? "due" : "waiting",
    next_eligible_at: next.nextEligibleAt,
    baseline_inbound_at: conv.lastInboundAt,
    last_evaluated_at: new Date().toISOString(),
  })
}
