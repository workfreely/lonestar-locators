// Follow-Up Agent — DISPATCHER (server-side, service role).
//
// Two responsibilities, both deterministic and idempotent:
//   enrollNewLeads() — open a new_lead run for a freshly-created lead that is
//                      account-authorized AND per-lead enrolled. Bounded to a short
//                      post-creation window so an old lead enrolled later is NEVER
//                      back-filled with a stale Text 1. Nothing bulk-enables.
//   tick()          — for each run whose current step is eligible, run the
//                      deterministic gate and, on "send", create ONE pending
//                      outbound intent for Beast Sync to claim. Marks the run "due"
//                      so it is never re-enqueued; advancement happens on ack.
//
// The dispatcher NEVER sends a text and NEVER marks anything sent. It only enqueues
// approved intents. Delivery + run advancement happen in the claim/ack endpoints.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { evaluateSend } from "./gate"
import { applicableSequence } from "./sequences"
import { newLeadText1EligibleAt } from "./cadence"
import {
  LEAD_COLUMNS,
  buildConversationSnapshot,
  buildLeadSnapshot,
  buildShareSnapshot,
  runSnapshotFromRow,
  type LeadRow,
  type RunRow,
} from "./snapshot"

// Only brand-new leads become new_lead runs. Enrollment that happens later than
// this after creation does not resurrect the New-Lead opening — those leads join
// the appropriate live sequence in a later checkpoint, never a stale Text 1.
const NEW_LEAD_ENROLL_WINDOW_MS = 6 * 60 * 60 * 1000
const TICK_BATCH = 100

type TickSummary = {
  enrolled: number
  evaluated: number
  enqueued: number
  rescheduled: number
  canceled: number
  held: number
}

export async function enrollNewLeads(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - NEW_LEAD_ENROLL_WINDOW_MS).toISOString()

  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("followup_opt_in", true)
    .eq("sms_opt_in", true)
    .gte("created_at", since)
    .not("crm_status", "in", "(closed,archived)")
    .limit(TICK_BATCH)

  if (error) {
    console.error("[followup/dispatcher] enroll query failed:", error.message)
    return 0
  }
  if (!leads || leads.length === 0) return 0

  let enrolled = 0
  for (const row of leads as unknown as LeadRow[]) {
    // Skip if an active run already exists (one-active-run invariant).
    const { data: existing } = await supabaseAdmin
      .from("lead_followup_runs")
      .select("id")
      .eq("lead_id", row.id)
      .in("status", ["waiting", "due"])
      .limit(1)
      .maybeSingle()
    if (existing) continue

    const lead = await buildLeadSnapshot(supabaseAdmin, row)
    // HARD dual gate mirror: never open a run for an unauthorized/unenrolled lead.
    if (!lead.accountAuthorized || !lead.followupOptIn) continue

    const share = await buildShareSnapshot(supabaseAdmin, row.id)
    // Only the New-Lead opening is created here; a lead already past new_lead
    // (list sent, applied, …) is handled by later-checkpoint enrollment, not here.
    if (applicableSequence(lead, share) !== "new_lead") continue

    const conv = await buildConversationSnapshot(supabaseAdmin, row.id)
    const eligibleAt = newLeadText1EligibleAt(row.created_at ?? now.toISOString())

    const { error: insErr } = await supabaseAdmin.from("lead_followup_runs").insert({
      lead_id: row.id,
      workspace_id: row.workspace_id,
      owner_user_id: row.owner_user_id,
      mode: "auto",
      sequence_key: "new_lead",
      step_key: "t1",
      step_index: 0,
      status: "waiting",
      next_eligible_at: eligibleAt,
      baseline_inbound_at: conv.lastInboundAt,
      sequence_version: 1,
    })
    // Unique (lead_id) where status in (waiting,due) → a race just no-ops.
    if (insErr) {
      if (!insErr.message.includes("lead_followup_runs_one_active")) {
        console.error("[followup/dispatcher] run insert failed:", insErr.message)
      }
      continue
    }
    enrolled++
  }
  return enrolled
}

export async function tick(now: Date = new Date()): Promise<TickSummary> {
  const summary: TickSummary = {
    enrolled: await enrollNewLeads(now),
    evaluated: 0,
    enqueued: 0,
    rescheduled: 0,
    canceled: 0,
    held: 0,
  }

  const { data: runs, error } = await supabaseAdmin
    .from("lead_followup_runs")
    .select(
      "id, lead_id, workspace_id, owner_user_id, mode, sequence_key, step_key, step_index, status, next_eligible_at, baseline_inbound_at, sequence_version",
    )
    .eq("status", "waiting")
    .lte("next_eligible_at", now.toISOString())
    .order("next_eligible_at", { ascending: true })
    .limit(TICK_BATCH)

  if (error) {
    console.error("[followup/dispatcher] tick query failed:", error.message)
    return summary
  }
  if (!runs || runs.length === 0) return summary

  for (const run of runs as unknown as RunRow[]) {
    summary.evaluated++

    const { data: leadRow } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("id", run.lead_id)
      .maybeSingle()
    if (!leadRow) {
      await standDown(run.id, "stale")
      summary.canceled++
      continue
    }

    const lead = await buildLeadSnapshot(supabaseAdmin, leadRow as unknown as LeadRow)
    const conv = await buildConversationSnapshot(supabaseAdmin, run.lead_id)
    const share = await buildShareSnapshot(supabaseAdmin, run.lead_id)
    const decision = evaluateSend(now, lead, conv, share, runSnapshotFromRow(run))

    if (decision.action === "send") {
      const enq = await enqueueIntent(run, lead, decision.templateKey, decision.body)
      if (enq) summary.enqueued++
    } else if (decision.action === "reschedule") {
      await supabaseAdmin
        .from("lead_followup_runs")
        .update({ next_eligible_at: decision.nextEligibleAt, last_evaluated_at: now.toISOString() })
        .eq("id", run.id)
      summary.rescheduled++
    } else if (decision.action === "cancel") {
      await standDown(run.id, decision.reason)
      summary.canceled++
    } else {
      // hold — leave the run waiting; a later tick re-evaluates.
      await supabaseAdmin
        .from("lead_followup_runs")
        .update({ last_evaluated_at: now.toISOString() })
        .eq("id", run.id)
      summary.held++
    }
  }
  return summary
}

async function standDown(runId: string, reason: string): Promise<void> {
  const status = reason === "sequence_superseded" ? "superseded" : "canceled"
  await supabaseAdmin
    .from("lead_followup_runs")
    .update({ status, stop_reason: reason, last_evaluated_at: new Date().toISOString() })
    .eq("id", runId)
}

// Create ONE pending intent for the run's current step. The (run_id, step_key)
// active-uniqueness index and the intent idempotency_key both prevent a double
// enqueue across retries/duplicate ticks. Marks the run "due" (intent in flight)
// so it is not re-enqueued; the ack endpoint advances it after a confirmed send.
async function enqueueIntent(
  run: RunRow,
  lead: Awaited<ReturnType<typeof buildLeadSnapshot>>,
  templateKey: string,
  body: string,
): Promise<boolean> {
  const idempotencyKey = `${run.id}:${run.step_key}`
  const { error } = await supabaseAdmin.from("followup_outbound_intents").insert({
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
      at: new Date().toISOString(),
    },
    dispatch_status: "pending",
    idempotency_key: idempotencyKey,
  })

  // Duplicate (already enqueued) → still ensure the run is marked in-flight.
  const duplicate = !!error && (error.message.includes("idempotency_key") || error.message.includes("active_step"))
  if (error && !duplicate) {
    console.error("[followup/dispatcher] intent insert failed:", error.message)
    return false
  }

  await supabaseAdmin
    .from("lead_followup_runs")
    .update({ status: "due", last_evaluated_at: new Date().toISOString() })
    .eq("id", run.id)
  return !duplicate
}
