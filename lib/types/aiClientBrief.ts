// Types for the ai_client_briefs table.
//
// insights: max 4 short strings extracted by AI from the iMessage conversation.
//   Each bullet surfaces context NOT already visible in the CRM
//   (personality, objections, relationship history, situation changes, etc.)
//
// last_conversation: one sentence describing where the conversation ended.

export type AiClientBrief = {
  id: string
  lead_id: number

  insights:          string[]   // max 4 bullets
  last_conversation: string | null

  // Sync tracking — used by Phase 4 incremental updates
  message_count:      number
  last_message_rowid: number | null
  last_message_date:  string | null  // ISO timestamp
  last_synced_at:     string | null  // ISO timestamp

  created_at: string
  updated_at: string
}

// Subset used when upserting from the sync pipeline (Phase 2+)
export type AiClientBriefUpsert = Omit<AiClientBrief, "id" | "created_at" | "updated_at">
