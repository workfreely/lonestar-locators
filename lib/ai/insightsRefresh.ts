import { supabaseAdmin } from "@/lib/supabase/admin"
import { syncAiInsights } from "@/lib/ai/syncAiInsights"

/**
 * AUTOMATIC AI INSIGHT REFRESH — detect changed, settled client conversations and
 * regenerate their brief through the EXISTING path.
 *
 * Beast Sync delivers messages into companion_messages, but nothing re-read them:
 * `syncAiInsights` only ever ran when a human clicked Refresh Insights. So a client
 * could text, the message would land, and the lead's brief would stay stale until
 * someone noticed. This closes that loop.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────
 * This module is READ + ANALYSIS ONLY with respect to client communication. It
 * reads companion_messages, calls the existing generator, and writes exactly ONE
 * table: ai_client_briefs. It must never import lib/followup/*, never create a
 * lead_followup_runs row or a followup_outbound_intents row, never read or write
 * followup_opt_in / sms_opt_in, and never send anything to a client.
 *
 * That boundary is deliberate and structural, not a convention: the Follow-Up Agent
 * lives in the same codebase, and "refresh the brief" must not become a path that
 * can reach outbound messaging. It runs from its own cron route, separate from
 * followup-tick, so the two cannot be entangled by a later edit.
 * scripts/tests/insightsRefresh.test.ts enforces all of the above.
 *
 * ── CHANGE DETECTION ────────────────────────────────────────────────────────────
 * A brief already stores what it was built from, so no new state is needed:
 *
 *     changed = no brief yet
 *             | companion message count != brief.message_count
 *             | newest sent_at          != brief.last_message_date
 *
 * `last_message_rowid` is deliberately NOT used: getCompanionTranscript returns
 * null for it (companion rows key on message.guid, not chat.db ROWID), so it can
 * never match and would make every lead look permanently changed.
 *
 * An unchanged conversation costs one indexed count + one max() and NO model call.
 */

/** A conversation must be quiet this long before it is worth summarising. */
export const SETTLE_WINDOW_MS = 150_000 // ~2.5 min

/** Safety rail: never fan out more than this many model calls in one tick. */
export const MAX_REFRESH_PER_TICK = 10

export type RefreshDecision = {
  leadId: number
  messageCount: number
  lastMessageDate: string
  /** Why this lead was or wasn't refreshed — the log/report vocabulary. */
  status: "changed_settled" | "changed_unsettled" | "unchanged"
  /** ms since the newest message; only meaningful for the two `changed_*` states. */
  quietForMs: number
}

export type RefreshSummary = {
  candidates: number
  refreshed: number
  unsettled: number
  failed: number
  leadIds: number[]
}

type BriefRow = { lead_id: number; message_count: number | null; last_message_date: string | null }

/**
 * Classify every lead that has attributed companion messages.
 *
 * Pure decision-making: reads only, calls nothing, writes nothing. Exported so the
 * regression suite can assert the settle/changed logic without a database.
 */
export function decideRefresh(
  now: Date,
  current: { leadId: number; messageCount: number; lastMessageDate: string },
  brief: { messageCount: number | null; lastMessageDate: string | null } | null,
): RefreshDecision {
  const quietForMs = now.getTime() - new Date(current.lastMessageDate).getTime()
  const base = {
    leadId: current.leadId,
    messageCount: current.messageCount,
    lastMessageDate: current.lastMessageDate,
    quietForMs,
  }

  // A brief built from the same count AND the same newest message is current.
  // Timestamps are compared as instants, not strings: Postgres and the generator
  // can format the same moment differently (offset vs Z, trailing zeros).
  const sameCount = brief != null && brief.messageCount === current.messageCount
  const sameNewest =
    brief?.lastMessageDate != null &&
    new Date(brief.lastMessageDate).getTime() === new Date(current.lastMessageDate).getTime()
  if (sameCount && sameNewest) return { ...base, status: "unchanged" }

  // Changed, but the client may still be mid-thought. Regenerating now would burn a
  // model call on a half-finished exchange and be immediately stale. Wait for quiet.
  if (quietForMs < SETTLE_WINDOW_MS) return { ...base, status: "changed_unsettled" }

  return { ...base, status: "changed_settled" }
}

/**
 * One sweep: find changed+settled conversations and regenerate their briefs.
 *
 * Idempotent by construction — syncAiInsights writes message_count and
 * last_message_date into the brief, so the very next sweep classifies the same lead
 * `unchanged` and makes no model call. Nothing records "in progress"; no lock, no
 * extra state. A duplicate from two overlapping ticks would cost one redundant call
 * and produce an identical upsert (ai_client_briefs is unique on lead_id); we are
 * measuring whether that ever actually happens before adding machinery for it.
 *
 * Failure is isolated per lead: one bad lead never aborts the sweep, and because a
 * failed refresh leaves the brief untouched, the lead stays `changed` and is simply
 * retried next tick. No retry bookkeeping.
 */
export async function refreshSettledInsights(now: Date = new Date()): Promise<RefreshSummary> {
  const summary: RefreshSummary = { candidates: 0, refreshed: 0, unsettled: 0, failed: 0, leadIds: [] }

  // Attributed messages only. An unattributed row belongs to no lead and has no
  // brief to refresh. Body text is never selected — only lead_id and sent_at.
  const { data: rows, error } = await supabaseAdmin
    .from("companion_messages")
    .select("lead_id, sent_at")
    .not("lead_id", "is", null)
  if (error) {
    console.error("[insights-refresh] could not read companion messages:", error.message)
    return summary
  }

  // Fold to per-lead count + newest timestamp.
  const byLead = new Map<number, { messageCount: number; lastMessageDate: string }>()
  for (const r of (rows ?? []) as Array<{ lead_id: number; sent_at: string | null }>) {
    if (!r.sent_at) continue
    const cur = byLead.get(r.lead_id)
    if (!cur) byLead.set(r.lead_id, { messageCount: 1, lastMessageDate: r.sent_at })
    else {
      cur.messageCount++
      if (new Date(r.sent_at).getTime() > new Date(cur.lastMessageDate).getTime()) cur.lastMessageDate = r.sent_at
    }
  }
  if (byLead.size === 0) {
    console.log("[insights-refresh] no attributed conversations yet — nothing to check")
    return summary
  }

  const leadIds = [...byLead.keys()]
  const { data: briefs } = await supabaseAdmin
    .from("ai_client_briefs")
    .select("lead_id, message_count, last_message_date")
    .in("lead_id", leadIds)
  const briefByLead = new Map<number, BriefRow>()
  for (const b of (briefs ?? []) as BriefRow[]) briefByLead.set(b.lead_id, b)

  const decisions: RefreshDecision[] = []
  for (const [leadId, cur] of byLead) {
    const b = briefByLead.get(leadId)
    decisions.push(
      decideRefresh(now, { leadId, ...cur }, b ? { messageCount: b.message_count, lastMessageDate: b.last_message_date } : null),
    )
  }

  const settled = decisions.filter((d) => d.status === "changed_settled")
  summary.unsettled = decisions.filter((d) => d.status === "changed_unsettled").length
  summary.candidates = settled.length

  // Lead ids and counts only — never message content.
  for (const d of decisions.filter((x) => x.status === "changed_unsettled")) {
    console.log(`[insights-refresh] lead ${d.leadId} changed but still active (quiet ${Math.round(d.quietForMs / 1000)}s) — waiting`)
  }
  if (settled.length === 0) {
    console.log(`[insights-refresh] checked ${decisions.length} conversation(s); none need refresh (${summary.unsettled} still settling)`)
    return summary
  }

  for (const d of settled.slice(0, MAX_REFRESH_PER_TICK)) {
    console.log(`[insights-refresh] lead ${d.leadId} changed and settled (${d.messageCount} messages) — refreshing`)
    try {
      await syncAiInsights(d.leadId)
      summary.refreshed++
      summary.leadIds.push(d.leadId)
      console.log(`[insights-refresh] lead ${d.leadId} refreshed`)
    } catch (e) {
      // Never fatal: the brief is left untouched, so this lead stays `changed` and
      // is retried on the next sweep.
      summary.failed++
      console.error(`[insights-refresh] lead ${d.leadId} refresh FAILED:`, e instanceof Error ? e.message : "unknown")
    }
  }
  return summary
}
