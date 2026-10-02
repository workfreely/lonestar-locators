import { supabaseAdmin } from "@/lib/supabase/admin"
import { getTranscript, normalizePhone } from "@/lib/messages/getTranscript"
import { getCompanionTranscript } from "@/lib/messages/getCompanionTranscript"
import { generateAiInsights } from "@/lib/ai/generateAiInsights"

export async function syncAiInsights(leadId: string | number): Promise<void> {
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

  if (messageCount === 0) {
    throw new Error(
      `No messages found for lead ${leadId} yet. Connect the Mac Companion or wait for it to sync.`
    )
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
        last_synced_at: new Date().toISOString(),
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
        workspace_id: (lead as { workspace_id?: string | null }).workspace_id ?? null,
        owner_user_id: (lead as { owner_user_id?: string | null }).owner_user_id ?? null,
      },
      { onConflict: "lead_id" }
    )

  if (upsertError) {
    throw new Error(`Failed to save AI insights: ${upsertError.message}`)
  }
}
