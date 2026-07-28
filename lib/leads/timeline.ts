import { supabase } from "@/lib/supabase/client"

// The CRM's append-only activity history (table: lead_timeline). Today it
// records only communication events; the union widens as the activity feed
// grows (notes, stage changes, tours, …) without a new table.
export type LeadTimelineType = "first_contact" | "follow_up"
export type LeadTimelineMethod = "call" | "text" | "email"

export type TimelineEventInput = {
  leadId: number | string
  type: LeadTimelineType
  method?: LeadTimelineMethod | null
  // 0 = first contact, 1..N = follow-up number; null when not a sequence.
  sequence?: number | null
  metadata?: Record<string, unknown>
  // ISO string; defaults to now. Pass the same timestamp used for the
  // corresponding `leads` write so the history and the cache agree.
  occurredAt?: string
}

// Master switch for background timeline logging. The lead_timeline table +
// migration exist, but the migration isn't applied and the feature is parked,
// so logging is a COMPLETE NO-OP for now: no insert, no "[lead-timeline] insert
// failed" console error, and zero effect on the workflow (Last/Next Action,
// stage movement, workflow generation, card movement, status — all unchanged).
// To bring it back later: apply the migration (`supabase db push`) and flip
// this to true. The call sites and helper stay in place so re-enabling is a
// one-line change.
const LEAD_TIMELINE_ENABLED = false

/**
 * Append one immutable row to the lead timeline. Deliberately
 * fire-and-forget: a history write must NEVER block or fail the workflow
 * action that triggered it — `leads` (follow_up_count, crm_status, …) remains
 * the source of truth for live state; this is history only. `created_by` is
 * filled by the table's `default auth.uid()`. No-op while disabled above.
 */
export function recordTimelineEvent(event: TimelineEventInput): void {
  if (!LEAD_TIMELINE_ENABLED) return

  // Fully isolated best-effort logging: a try/catch guards any synchronous
  // throw, and the second `.then` arg swallows a rejected promise — so a
  // timeline write can NEVER throw into, block, or bubble out of the workflow
  // action that called it (e.g. before the lead_timeline migration is applied,
  // this just logs and moves on).
  try {
    supabase
      .from("lead_timeline")
      .insert({
        lead_id: event.leadId,
        type: event.type,
        method: event.method ?? null,
        sequence: event.sequence ?? null,
        metadata: event.metadata ?? {},
        occurred_at: event.occurredAt ?? new Date().toISOString(),
      })
      .then(
        ({ error }) => {
          if (error) {
            // Surface the real reason (was logging as `{}`) — e.g. a missing
            // table means the migration hasn't been applied.
            console.error("[lead-timeline] insert failed (non-blocking):", error.message || error.code || error)
          }
        },
        (err) => console.error("[lead-timeline] insert rejected (non-blocking):", err),
      )
  } catch (err) {
    console.error("[lead-timeline] insert threw (non-blocking):", err)
  }
}
