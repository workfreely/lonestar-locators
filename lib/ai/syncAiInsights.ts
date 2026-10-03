import { supabaseAdmin } from "@/lib/supabase/admin"
import { getTranscript, normalizePhone } from "@/lib/messages/getTranscript"
import { getCompanionTranscript } from "@/lib/messages/getCompanionTranscript"
import { generateAiInsights } from "@/lib/ai/generateAiInsights"

/**
 * Outcome of a SUCCESSFUL check. A zero-message result is a success, not a
 * failure — the lead was checked and nothing was there. Only genuine errors
 * (bad lead, no phone, generation failure, write failure) still throw.
 */
export type SyncAiInsightsResult =
  | { status: "insights"; messageCount: number; lastSyncedAt: string }
  | {
      status: "no_messages"
      messageCount: 0
      lastSyncedAt: string
      /** True when an existing non-empty brief was left intact (see below). */
      preservedExistingBrief: boolean
    }

export async function syncAiInsights(leadId: string | number): Promise<SyncAiInsightsResult> {
  const leadIdNum = Number(leadId)
  if (!Number.isFinite(leadIdNum)) {
    throw new Error(`Invalid leadId: ${leadId}`)
  }

  // 1. Look up lead
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, phone, workspace_id, owner_user_id")
    .eq("id", leadIdNum)
    .single()

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadId}`)
  }

  if (!lead.phone) {
    throw new Error(`Lead ${leadId} has no phone number.`)
  }

  const phone = normalizePhone(lead.phone as string)

  // 2. Build the transcript. Production source is companion_messages (ingested
  // by the macOS Companion). If none exist yet, fall back to the LEGACY on-device
  // chat.db reader — only usable when running locally with Full Disk Access, and
  // non-fatal in production (no chat.db → caught → treated as "no messages yet").
  let { transcript, messageCount, lastMessageRowId, lastMessageDate } =
    await getCompanionTranscript(leadIdNum)

  if (messageCount === 0) {
    try {
      ;({ transcript, messageCount, lastMessageRowId, lastMessageDate } =
        await getTranscript(phone))
    } catch {
      // No companion messages and no local chat.db — leave the empty result.
    }
  }

  // TENANCY — carried from the lead on BOTH write paths below. See the upsert at
  // the end of this function for why ai_client_briefs rows are invisible without it.
  const tenancy = {
    workspace_id: (lead as { workspace_id?: string | null }).workspace_id ?? null,
    owner_user_id: (lead as { owner_user_id?: string | null }).owner_user_id ?? null,
  }
  const lastSyncedAt = new Date().toISOString()

  // A SUCCESSFUL CHECK THAT FOUND NOTHING is persisted, not thrown.
  //
  // This used to throw before the upsert below, so a lead that had been checked and
  // genuinely had no messages left NO trace — indistinguishable from a lead that had
  // never been checked at all. Across 50-60 leads that makes "did I already sync this
  // person?" unanswerable.
  //
  // The row IS the record of the check: message_count 0 with a real last_synced_at.
  // That matters for safety as much as for UX — "No messages found" is then a
  // POSITIVE assertion from a row that exists, never an inference from absence. If a
  // brief is ever hidden again (the RLS regression this pipeline already suffered),
  // the card falls back to "Click Sync to check for messages", which is the honest
  // default; it can never silently claim a successful empty check.
  if (messageCount === 0) {
    // NON-DESTRUCTIVE GUARD. Zero CURRENT messages does not prove the historical
    // conversation vanished — companion_messages only ever accumulates, so a lead
    // that already has a message-backed brief reading zero now is anomalous, not
    // evidence of an empty conversation. Overwriting with insights: [] would
    // destroy real client intelligence on the strength of a suspicious read.
    //
    // So: stamp the successful check and leave the brief alone. An UPDATE of
    // last_synced_at only — never an upsert — so insights, last_conversation and
    // every message-derived field survive untouched.
    const { data: existing } = await supabaseAdmin
      .from("ai_client_briefs")
      .select("message_count, last_synced_at")
      .eq("lead_id", leadIdNum)
      .maybeSingle()
    const existingRow = existing as { message_count?: number | null; last_synced_at?: string | null } | null
    const existingCount = existingRow?.message_count ?? 0
    if (existingRow && existingCount > 0) {
      // A TRUE NO-OP — not even last_synced_at moves.
      //
      // "Last Beast Sync" is read as the last successful check BACKING the insights
      // on screen. An anomalous zero-message read validates nothing, so stamping it
      // would make stale intelligence look freshly confirmed — the one thing that
      // timestamp must never do. The brief is returned exactly as it stands, and the
      // reported timestamp is the EXISTING one, not now.
      return {
        status: "no_messages",
        messageCount: 0,
        lastSyncedAt: existingRow.last_synced_at ?? lastSyncedAt,
        preservedExistingBrief: true,
      }
    }

    const { error: emptyErr } = await supabaseAdmin.from("ai_client_briefs").upsert(
      {
        lead_id: leadIdNum,
        insights: [],
        last_conversation: null,
        message_count: 0,
        last_message_rowid: null,
        last_message_date: null,
        last_synced_at: lastSyncedAt,
        ...tenancy,
      },
      { onConflict: "lead_id" },
    )
    // A failed WRITE is a real failure — it must not report a successful check.
    if (emptyErr) throw new Error(`Failed to record the check: ${emptyErr.message}`)
    return { status: "no_messages", messageCount: 0, lastSyncedAt, preservedExistingBrief: false }
  }

  // 3. Generate AI insights
  const { insights, last_conversation } = await generateAiInsights(transcript)

  // 4. Upsert into ai_client_briefs
  const { error: upsertError } = await supabaseAdmin
    .from("ai_client_briefs")
    .upsert(
      {
        lead_id: leadIdNum,
        insights,
        last_conversation,
        message_count: messageCount,
        last_message_rowid: lastMessageRowId,
        last_message_date: lastMessageDate,
        last_synced_at: lastSyncedAt,
        // TENANCY — carried from the lead, not inferred.
        //
        // ai_client_briefs has RLS: "workspace members access" USING
        // is_active_workspace_member(workspace_id). A brief written without a
        // workspace is invisible to EVERY browser session, so the AI Client
        // Insights card renders its empty state ("Last Beast Sync: Never") while
        // the row sits there, current and complete, readable only by the service
        // role. That is exactly what happened to lead 84.
        //
        // The canonical trg_ownership trigger does cover this table, but it cannot
        // help here on two counts: it derives ownership from auth.uid(), which is
        // NULL for a service-role write, and it is BEFORE INSERT only — this is an
        // upsert on lead_id, so regenerating a brief takes the UPDATE path and the
        // trigger never fires. Passing the values explicitly is what the trigger
        // itself expects: it coalesces to a supplied owner_user_id first.
        ...tenancy,
      },
      { onConflict: "lead_id" }
    )

  if (upsertError) {
    throw new Error(`Failed to save AI insights: ${upsertError.message}`)
  }

  return { status: "insights", messageCount, lastSyncedAt }
}
