export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { nextStepEligibility } from "@/lib/followup/cadence"
import { resolveStepBody } from "@/lib/followup/sequences"
import {
  LEAD_COLUMNS,
  buildConversationSnapshot,
  buildLeadSnapshot,
  buildShareSnapshot,
  type LeadRow,
} from "@/lib/followup/snapshot"
import type { SequenceKey } from "@/lib/followup/types"

// Beast Sync ACK for an outbound job it claimed. "sent" means Beast Sync confirmed
// the message was SUBMITTED through Apple Messages on this device — that is the
// strongest local evidence macOS gives; it is NOT proof of carrier delivery, so we
// record it as `sent`, never `delivered`. Only a confirmed "sent" advances the run.
// Idempotent: a duplicate ack (retry after a network timeout) is a no-op.
export async function POST(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response
  const { workspaceId, deviceId } = auth

  let body: { intentId?: unknown; idempotencyKey?: unknown; status?: unknown; localSentAt?: unknown; error?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const intentId = typeof body.intentId === "string" ? body.intentId : ""
  const status = body.status === "sent" || body.status === "failed" ? body.status : null
  if (!intentId || !status) {
    return NextResponse.json({ error: "intentId and status ('sent'|'failed') required" }, { status: 400 })
  }
  const localSentAt =
    typeof body.localSentAt === "string" && !isNaN(new Date(body.localSentAt).getTime())
      ? new Date(body.localSentAt).toISOString()
      : new Date().toISOString()
  const errText = typeof body.error === "string" ? body.error.slice(0, 500) : null

  // The intent must belong to this workspace AND have been claimed by THIS device.
  const { data: intent } = await supabaseAdmin
    .from("followup_outbound_intents")
    .select("id, run_id, dispatch_status, gateway_device_id, idempotency_key")
    .eq("id", intentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (!intent) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (intent.gateway_device_id && intent.gateway_device_id !== deviceId) {
    return NextResponse.json({ error: "wrong_device" }, { status: 409 })
  }

  // Idempotency — a job already marked sent never re-advances the run.
  if (intent.dispatch_status === "sent") {
    return NextResponse.json({ ok: true, already: true })
  }

  if (status === "failed") {
    // Retire the idempotency_key (unique) so the dispatcher can re-enqueue the SAME
    // step as a fresh intent. 'failed' is outside the active-step index, so this
    // frees both uniqueness guards without ever allowing a duplicate live send.
    await supabaseAdmin
      .from("followup_outbound_intents")
      .update({ dispatch_status: "failed", error: errText, local_sent_at: localSentAt, idempotency_key: null })
      .eq("id", intentId)
    // Reset the run so a later tick re-evaluates and can re-enqueue this step.
    if (intent.run_id) {
      await supabaseAdmin
        .from("lead_followup_runs")
        .update({ status: "waiting", last_evaluated_at: new Date().toISOString() })
        .eq("id", intent.run_id as string)
    }
    return NextResponse.json({ ok: true, status: "failed" })
  }

  // status === "sent": record submission, then advance the run.
  await supabaseAdmin
    .from("followup_outbound_intents")
    .update({ dispatch_status: "sent", sent_at: new Date().toISOString(), local_sent_at: localSentAt })
    .eq("id", intentId)

  if (intent.run_id) await advanceRun(intent.run_id as string, localSentAt)

  return NextResponse.json({ ok: true, status: "sent" })
}

// Advance the run to its next step (eligibility anchored to this confirmed send),
// or complete it when the sequence is terminal. Re-baselines the inbound watermark
// so a reply AFTER this send correctly overrides the next full-gated step.
//
// Special-case the New-Lead Text 1 → Text 2 pair: Text 2 is pre-enqueued as a
// PENDING intent right here (eligibility = confirmed send + 30s, already on the
// run), so Beast Sync can claim it exactly when due WITHOUT waiting for the next
// 1-minute dispatcher tick. Claim-time revalidation still runs before it is sent.
async function advanceRun(runId: string, sentAtIso: string): Promise<void> {
  const { data: run } = await supabaseAdmin
    .from("lead_followup_runs")
    .select("id, lead_id, workspace_id, owner_user_id, sequence_key, step_key, step_index")
    .eq("id", runId)
    .maybeSingle()
  if (!run) return

  const seq = run.sequence_key as SequenceKey
  const justSent = run.step_key as string
  const next = nextStepEligibility(seq, justSent, sentAtIso)
  if (!next) {
    await supabaseAdmin
      .from("lead_followup_runs")
      .update({ status: "completed", last_evaluated_at: new Date().toISOString() })
      .eq("id", runId)
    return
  }

  const conv = await buildConversationSnapshot(supabaseAdmin, run.lead_id as number)

  // Pre-enqueue Text 2 for the opening pair (do NOT depend on the cron for the 30s).
  let preEnqueued = false
  if (seq === "new_lead" && justSent === "t1") {
    const { data: leadRow } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("id", run.lead_id as number)
      .maybeSingle()
    if (leadRow) {
      const lead = await buildLeadSnapshot(supabaseAdmin, leadRow as unknown as LeadRow)
      const share = await buildShareSnapshot(supabaseAdmin, run.lead_id as number)
      const body = resolveStepBody(seq, next.nextStepKey, lead, share)
      if (body) {
        const { error: insErr } = await supabaseAdmin.from("followup_outbound_intents").insert({
          run_id: run.id,
          lead_id: run.lead_id,
          workspace_id: run.workspace_id,
          owner_user_id: run.owner_user_id,
          sequence_key: seq,
          step_key: next.nextStepKey,
          template_key: next.nextStepKey, // t2 → new_lead_text2 (audit only)
          rendered_body: body,
          decision: "send",
          decision_reason: "scheduled_pair",
          evaluated_state: { pairAnchor: sentAtIso, at: new Date().toISOString() },
          dispatch_status: "pending",
          idempotency_key: `${run.id}:${next.nextStepKey}`,
        })
        const dup = !!insErr && (insErr.message.includes("idempotency_key") || insErr.message.includes("active_step"))
        if (insErr && !dup) console.error("[outbound/ack] Text 2 pre-enqueue failed:", insErr.message)
        preEnqueued = !insErr || dup
      }
    }
  }

  await supabaseAdmin
    .from("lead_followup_runs")
    .update({
      step_key: next.nextStepKey,
      step_index: (run.step_index as number) + 1,
      // "due" = an intent is already in flight for the next step (no cron re-enqueue);
      // "waiting" = the cron enqueues it when eligible (day-scale steps).
      status: preEnqueued ? "due" : "waiting",
      next_eligible_at: next.nextEligibleAt,
      baseline_inbound_at: conv.lastInboundAt,
      last_evaluated_at: new Date().toISOString(),
    })
    .eq("id", runId)
}
