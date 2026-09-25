export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireDeviceToken } from "@/lib/companion/auth"
import { getFeatureEntitlement, isCompanionMaintenance, isVersionSupported } from "@/lib/companion/entitlement"
import { rateLimit } from "@/lib/rateLimit"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { evaluateSend } from "@/lib/followup/gate"
import {
  LEAD_COLUMNS,
  buildConversationSnapshot,
  buildLeadSnapshot,
  buildShareSnapshot,
  runSnapshotFromRow,
  type LeadRow,
  type RunRow,
} from "@/lib/followup/snapshot"

// How many jobs one claim hands out. Bounds a reconnect "catch-up" so a device that
// was offline never receives a flood — the remainder stays pending for the next
// claim, each re-validated then. Beast Sync sends serially.
const CLAIM_CAP = 5
// Backoff applied when a pending intent is held (paused/manual) at claim time.
const HOLD_BACKOFF_MS = 15 * 60 * 1000

type ClaimJob = {
  intentId: string
  idempotencyKey: string
  leadId: number
  toPhone: string
  body: string
  sequenceKey: string
  stepKey: string
}

// Beast Sync outbound CLAIM. Returns approved, re-validated jobs for THIS device to
// send through Apple Messages. Every pending intent is re-checked against CURRENT
// live state here (conversation-overrides-automation, stage, sequence, consent,
// quiet hours) — a stale/superseded message is canceled instead of handed over.
// Nothing is marked sent here; the device must ack after a confirmed local send.
export async function GET(req: Request) {
  const auth = await requireDeviceToken(req)
  if (!auth.ok) return auth.response
  const { userId, workspaceId, deviceId, syncPaused, appVersion } = auth

  if (isCompanionMaintenance()) {
    return NextResponse.json({ jobs: [], syncEnabled: false, maintenance: true }, { status: 503 })
  }
  if (!isVersionSupported(appVersion)) {
    return NextResponse.json({ jobs: [], syncEnabled: false, updateRequired: true }, { status: 426 })
  }
  if (syncPaused) {
    return NextResponse.json({ jobs: [], syncEnabled: false, syncPaused: true }, { status: 403 })
  }

  const limit = rateLimit(`companion-outbound:${deviceId}`, 120, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    })
  }

  const entitlement = await getFeatureEntitlement(userId, workspaceId, "messages_sync")
  if (!entitlement.entitled) {
    return NextResponse.json({ jobs: [], entitled: false, reason: entitlement.reason }, { status: 403 })
  }

  // Oldest pending intents for this workspace. Over-fetch so that after canceling
  // stale ones we can still fill CLAIM_CAP with genuinely-sendable jobs.
  const { data: intents, error } = await supabaseAdmin
    .from("followup_outbound_intents")
    .select("id, run_id, lead_id, idempotency_key, sequence_key, step_key")
    .eq("workspace_id", workspaceId)
    .eq("dispatch_status", "pending")
    .order("created_at", { ascending: true })
    .limit(CLAIM_CAP * 4)

  if (error) {
    console.error("[companion/outbound] pending query failed:", error.message)
    return NextResponse.json({ error: "query_failed" }, { status: 500 })
  }

  const now = new Date()
  const jobs: ClaimJob[] = []

  for (const intent of intents ?? []) {
    if (jobs.length >= CLAIM_CAP) break
    if (!intent.run_id) {
      await supersedeIntent(intent.id as string, "stale")
      continue
    }

    const { data: runRow } = await supabaseAdmin
      .from("lead_followup_runs")
      .select(
        "id, lead_id, workspace_id, owner_user_id, mode, sequence_key, step_key, step_index, status, next_eligible_at, baseline_inbound_at, sequence_version",
      )
      .eq("id", intent.run_id as string)
      .maybeSingle()
    const { data: leadRow } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("id", intent.lead_id as number)
      .maybeSingle()

    if (!runRow || !leadRow) {
      await supersedeIntent(intent.id as string, "stale")
      continue
    }
    const run = runRow as unknown as RunRow

    const lead = await buildLeadSnapshot(supabaseAdmin, leadRow as unknown as LeadRow)
    const conv = await buildConversationSnapshot(supabaseAdmin, run.lead_id)
    const share = await buildShareSnapshot(supabaseAdmin, run.lead_id)

    // Revalidate the intent against its OWN step (the intent captured a specific
    // step_key). Use the run snapshot as-is (its step_key still matches the intent
    // while it is in flight).
    const decision = evaluateSend(now, lead, conv, share, runSnapshotFromRow(run))

    if (decision.action === "send") {
      const toPhone = (leadRow as unknown as LeadRow).phone?.trim() || ""
      if (!toPhone) {
        await supersedeIntent(intent.id as string, "stale") // no recipient — cannot send
        continue
      }
      // Claim it for this device; freshen the body from current state.
      const { error: claimErr } = await supabaseAdmin
        .from("followup_outbound_intents")
        .update({
          dispatch_status: "claimed",
          gateway_device_id: deviceId,
          claimed_at: now.toISOString(),
          rendered_body: decision.body,
        })
        .eq("id", intent.id as string)
        .eq("dispatch_status", "pending") // guard against a concurrent claim
      if (claimErr) continue
      jobs.push({
        intentId: intent.id as string,
        idempotencyKey: intent.idempotency_key as string,
        leadId: run.lead_id,
        toPhone,
        body: decision.body,
        sequenceKey: run.sequence_key,
        stepKey: run.step_key,
      })
    } else if (decision.action === "cancel") {
      await supersedeIntent(intent.id as string, decision.reason)
      const status = decision.reason === "sequence_superseded" ? "superseded" : "canceled"
      await supabaseAdmin
        .from("lead_followup_runs")
        .update({ status, stop_reason: decision.reason, last_evaluated_at: now.toISOString() })
        .eq("id", run.id)
    } else if (decision.action === "reschedule") {
      // Not sendable now (e.g. quiet hours / manual text). Drop this intent and
      // reset the run so the dispatcher re-enqueues at the new eligible time.
      await supersedeIntent(intent.id as string, decision.reason)
      await supabaseAdmin
        .from("lead_followup_runs")
        .update({ status: "waiting", next_eligible_at: decision.nextEligibleAt, last_evaluated_at: now.toISOString() })
        .eq("id", run.id)
    } else if (decision.reason === "not_eligible_yet") {
      // Simply not due yet (e.g. the pre-enqueued Text 2 within its 30s window).
      // Leave the intent PENDING and untouched — a later poll claims it when due.
      continue
    } else {
      // hold (paused / manual conversation / not authorized / not enrolled) — drop
      // this intent and let the run retry after a short backoff.
      await supersedeIntent(intent.id as string, decision.reason)
      await supabaseAdmin
        .from("lead_followup_runs")
        .update({
          status: "waiting",
          next_eligible_at: new Date(now.getTime() + HOLD_BACKOFF_MS).toISOString(),
          last_evaluated_at: now.toISOString(),
        })
        .eq("id", run.id)
    }
  }

  await supabaseAdmin.from("device_tokens").update({ last_used_at: now.toISOString() }).eq("id", deviceId)
  return NextResponse.json({ jobs, syncEnabled: true, serverTime: now.toISOString() })
}

async function supersedeIntent(intentId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from("followup_outbound_intents")
    .update({ dispatch_status: "superseded", error: reason })
    .eq("id", intentId)
    .eq("dispatch_status", "pending")
}
