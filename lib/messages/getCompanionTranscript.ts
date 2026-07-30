import { supabaseAdmin } from "@/lib/supabase/admin"
import type { TranscriptResult } from "@/lib/messages/getTranscript"

// Builds a lead's transcript from companion_messages — the server-side source
// the macOS Companion ingests into. This is the PRODUCTION replacement for
// getTranscript() (which reads the on-device ~/Library/Messages/chat.db and
// only works when the app runs on the user's Mac). Same output shape + labeled
// format so generateAiInsights receives identical input from either source.
export async function getCompanionTranscript(leadId: number): Promise<TranscriptResult> {
  const { data: rows, error } = await supabaseAdmin
    .from("companion_messages")
    .select("body, is_from_me, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true })

  if (error) {
    throw new Error(`Failed to read companion messages: ${error.message}`)
  }

  const messages = (rows || [])
    .map((r) => ({
      body: (r.body || "").trim(),
      fromMe: r.is_from_me === true,
      date: r.sent_at ? new Date(r.sent_at as string) : null,
    }))
    .filter((m) => m.body.length > 0)

  if (messages.length === 0) {
    return { transcript: "", messageCount: 0, lastMessageRowId: null, lastMessageDate: null }
  }

  const lines: string[] = []
  let lastDayLabel = ""
  for (const msg of messages) {
    const d = msg.date
    if (d && !isNaN(d.getTime())) {
      const dayLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      if (dayLabel !== lastDayLabel) {
        lines.push(`\n[${dayLabel}]`)
        lastDayLabel = dayLabel
      }
      const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      lines.push(`${msg.fromMe ? "Me" : "Client"} (${time}): ${msg.body}`)
    } else {
      lines.push(`${msg.fromMe ? "Me" : "Client"}: ${msg.body}`)
    }
  }

  const lastDated = [...messages].reverse().find((m) => m.date && !isNaN(m.date.getTime()))
  return {
    transcript: lines.join("\n").trim(),
    messageCount: messages.length,
    lastMessageRowId: null, // companion source keys on message.guid, not chat.db ROWID
    lastMessageDate: lastDated?.date ? lastDated.date.toISOString() : null,
  }
}
