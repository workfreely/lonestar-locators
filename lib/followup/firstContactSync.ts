import { supabaseAdmin } from "@/lib/supabase/admin"
import { getStageWorkflowAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { completedPatch, resolveOpenActionId } from "@/lib/leads/actionCompletion"
import { resolveUserTimeZone } from "@/lib/timezone/server"
import { resolveWorkHoursFromProfile } from "@/lib/workflow/autoDueDate"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import {
  decideFirstContactSync,
  AUTOMATED_CONTACT_VIA,
  type SkipReason,
} from "./firstContactRules"

// AUTOMATED FIRST CONTACT — the server-side half of the canonical cascade.
//
// Called from the Companion ACK route the moment Text 1 is acknowledged as sent. The decision
// lives next door in firstContactRules (pure, tested without a database); this file performs
// exactly the same writes the browser cascade performs, through the same helpers:
//
//   recordFirstContact (browser)            this (server)
//   ─────────────────────────────           ─────────────────────────────
//   POST /api/admin/leads/update-stage  →   the same leads update + the same
//                                           getStageWorkflowAction/createWorkflowActionIfNeeded
//   leads.first_text_sent_at            →   the same column, same meaning
//   lead_timeline first_contact         →   the same row, method "text"
//
// NEVER THROWS. An acknowledgment is the Companion telling us a message left the device; that
// fact must be recorded whatever the CRM does afterwards, and a failure here must not make the
// Mac retry a send.

export type FirstContactSyncResult =
  | { synced: true; stage: "contacted"; completedActionId: number | string | null; successorCreated: boolean }
  | { synced: false; reason: SkipReason | "error" }

/**
 * Advance the CRM after a genuine Text 1 acknowledgment.
 *
 * Idempotent by construction, in two layers: the decision refuses when first_text_sent_at is
 * already set, and the stage write itself is guarded `.eq("crm_status", "new")` so two
 * acknowledgments racing each other cannot both win. Everything after that write is reached
 * only by the winner, so no action and no timeline row can be created twice.
 */
export async function syncFirstContactFromAck(opts: {
  intentId: string
  workspaceId: string
  /** The device's local send time, used so the CRM and the message agree on when. */
  sentAt: string
}): Promise<FirstContactSyncResult> {
  try {
    const { data: intent } = await supabaseAdmin
      .from("followup_outbound_intents")
      .select("id, lead_id, workspace_id, owner_user_id, sequence_key, step_key, dispatch_status")
      .eq("id", opts.intentId)
      .maybeSingle()
    if (!intent || intent.workspace_id !== opts.workspaceId) return { synced: false, reason: "error" }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, crm_status, first_text_sent_at, follow_up_count, next_action_date, owner_user_id, workspace_id")
      .eq("id", intent.lead_id)
      .maybeSingle()

    const decision = decideFirstContactSync(intent, lead)
    if (!decision.act) return { synced: false, reason: decision.reason }

    // THE RACE GUARD. Also the idempotency guard that survives two simultaneous callers:
    // whichever update matches `crm_status = 'new'` first flips it, and the other matches no
    // row and returns empty. Only the winner proceeds.
    const { data: advanced } = await supabaseAdmin
      .from("leads")
      .update({ crm_status: "contacted", first_text_sent_at: opts.sentAt })
      .eq("id", lead!.id)
      .eq("crm_status", "new")
      .select("id, crm_status, follow_up_count, move_date, desired_rent, first_name, last_name")
    if (!advanced || advanced.length === 0) return { synced: false, reason: "already_contacted" }
    const fresh = advanced[0]

    // THE OPEN CONTACT LEAD ACTION. Completed through the canonical patch (completed +
    // completed_at + status), so the Agenda's overdue query stops matching it — writing only
    // `completed` is the bug actionCompletion exists to prevent. completed_via records WHO
    // finished it, which is what lets both Last Action surfaces say "Auto Text Sent" instead of
    // crediting the agent. It is written from here, the one place that knows.
    let completedActionId: number | string | null = null
    const openId = await resolveOpenActionId(supabaseAdmin, lead!.id, "contact_lead")
    if (openId != null) {
      const { error: completeErr } = await supabaseAdmin
        .from("lead_next_actions")
        .update(completedPatch(opts.sentAt, AUTOMATED_CONTACT_VIA))
        .eq("id", openId)
      if (!completeErr) completedActionId = openId
      else console.error("[first-contact/auto] complete contact_lead failed:", completeErr.message)
    }

    // THE SUCCESSOR, from the SAME engine the manual path uses — Contacted's canonical next
    // step is Build List, deduped on its action key so a repeat can never double it. The
    // locator's own timezone and working hours decide its deadline, exactly as in the route.
    let successorCreated = false
    try {
      const ownerId = intent.owner_user_id ?? lead!.owner_user_id ?? null
      const timeZone = ownerId
        ? await resolveUserTimeZone(supabaseAdmin, ownerId, opts.workspaceId)
        : DEFAULT_TIMEZONE
      const { data: whProfile } = ownerId
        ? await supabaseAdmin.from("profiles").select("work_hours_start, work_hours_end").eq("id", ownerId).maybeSingle()
        : { data: null }
      const spec = getStageWorkflowAction("contacted", fresh, timeZone, resolveWorkHoursFromProfile(whProfile))
      if (spec) successorCreated = !!(await createWorkflowActionIfNeeded(supabaseAdmin, lead!.id, spec))
    } catch (e) {
      // A missing successor is a workflow gap the agent can see and fix; a thrown one would
      // leave the lead advanced with the acknowledgment unrecorded.
      console.error("[first-contact/auto] successor action failed:", (e as Error).message)
    }

    // HISTORY, LAST AND BEST-EFFORT — the same ordering the browser cascade uses, for the same
    // reason: a timeline failure must never affect the workflow writes above. method "text"
    // because that is what was sent; the metadata says who sent it. Nothing here records an
    // inbound, so the lead is never shown as having replied.
    const { error: tlErr } = await supabaseAdmin.from("lead_timeline").insert({
      lead_id: lead!.id,
      type: "first_contact",
      method: "text",
      sequence: 0,
      metadata: { source: "followup_agent", intent_id: intent.id, step_key: intent.step_key },
      occurred_at: opts.sentAt,
    })
    if (tlErr) console.error("[first-contact/auto] timeline insert failed (non-blocking):", tlErr.message)

    return { synced: true, stage: "contacted", completedActionId, successorCreated }
  } catch (e) {
    console.error("[first-contact/auto] failed:", (e as Error).message)
    return { synced: false, reason: "error" }
  }
}
