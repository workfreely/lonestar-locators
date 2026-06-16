import { supabaseAdmin } from "@/lib/supabase/admin"
import { getTranscript, normalizePhone } from "@/lib/messages/getTranscript"
import { generateAiInsights } from "@/lib/ai/generateAiInsights"

export async function syncAiInsights(leadId: string | number): Promise<void> {
  const leadIdNum = Number(leadId)
  if (!Number.isFinite(leadIdNum)) {
    throw new Error(`Invalid leadId: ${leadId}`)
  }

  // 1. Look up lead
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, phone")
    .eq("id", leadIdNum)
    .single()

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadId}`)
  }

  if (!lead.phone) {
    throw new Error(`Lead ${leadId} has no phone number.`)
  }

  const phone = normalizePhone(lead.phone as string)

  // 2. Extract transcript from iMessage
  const { transcript, messageCount, lastMessageRowId, lastMessageDate } =
    await getTranscript(phone)

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
      },
      { onConflict: "lead_id" }
    )

  if (upsertError) {
    throw new Error(`Failed to save AI insights: ${upsertError.message}`)
  }
}
