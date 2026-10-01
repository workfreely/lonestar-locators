/**
 * COMPLETING A NEXT ACTION — one patch shape, one resolver.
 *
 * `lead_next_actions` carries TWO completion signals, `completed boolean` and
 * `status text`, and the ~15 ad-hoc update sites disagreed about which to write.
 * Measured in production: of 48 rows, only 3 had `status = 'completed'`, and all
 * three came from the handful of writers that set both. Every path that set only
 * `completed`/`completed_at` left `status = 'open'`.
 *
 * Display survived that, because readers test
 * `a.completed === true || a.status === 'completed'`. What did NOT survive is any
 * query filtering on status — including the stage-transition stand-down in
 * app/api/admin/leads/update-stage, which matches `.eq("status","open")` and so
 * silently treated finished rows as live.
 *
 * Write completions through `completedPatch()` or `completeAction()` only.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** The ONLY correct shape for marking a next action done. */
export function completedPatch(now: string = new Date().toISOString()): {
  completed: true
  completed_at: string
  status: "completed"
} {
  return { completed: true, completed_at: now, status: "completed" }
}

/** Mark one action complete by id. Returns false when nothing was updated. */
export async function completeAction(
  client: SupabaseClient,
  id: number | string,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const { data, error } = await client
    .from("lead_next_actions")
    .update(completedPatch(now))
    .eq("id", id)
    .select("id")
  if (error) {
    console.error("[action-completion] complete failed:", error.message)
    return false
  }
  return (data ?? []).length > 0
}

/**
 * Find the OPEN action row for a lead by action_key, server-side.
 *
 * The follow-up completion path used to look its row up in client React state and
 * silently skip the database write when it wasn't there — while still
 * incrementing `follow_up_count` and creating the successor. That produced
 * Ka'Leah Davis (lead 84): count = 1, an FU2 successor, a `text_sent` timeline
 * event, and FU1 still sitting `open` with `completed_at = null`. The completion
 * had no durable record anywhere.
 *
 * Ordered oldest-first with an id tiebreaker: when a duplicate pair exists, the
 * one being completed is the earlier one, and `due_at` ties constantly (five
 * action types are stamped with the same `immediateNow()`), so id is what makes
 * this deterministic.
 */
export async function resolveOpenActionId(
  client: SupabaseClient,
  leadId: number | string,
  actionKey: string,
): Promise<number | string | null> {
  const { data, error } = await client
    .from("lead_next_actions")
    .select("id")
    .eq("lead_id", leadId)
    .eq("action_key", actionKey)
    .eq("completed", false)
    .neq("status", "canceled")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
  if (error) {
    console.error("[action-completion] resolve failed:", error.message)
    return null
  }
  return (data ?? [])[0]?.id ?? null
}

/**
 * The follow-up ladder created once a list has been sent.
 *
 * Retired together when the lead moves past List Sent — a lead being toured is
 * not still waiting on "did you see the list?" nudges. Mirrors
 * CONTACT_CHASE_ACTION_KEYS and is deliberately an explicit list rather than
 * "everything outside the new stage's foreground set": a foreground sweep would
 * also catch per-property email_guest_card rows and the applied→denied
 * regression, where foreground membership is not a safe proxy for "stale".
 *
 * `send_list` is included because it is the step the ladder descends FROM: a lead
 * in Ready to Tour self-evidently got a list.
 */
export const LIST_LADDER_ACTION_KEYS = [
  "send_list",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "final_follow_up",
] as const

/**
 * Stages at or beyond touring, where the List Sent ladder is finished.
 *
 * `list_sent` itself is absent — that is where the ladder lives. `done_touring`,
 * `applied` and `closed` are included so a lead dragged straight from List Sent
 * to Applied is cleaned up the same way.
 */
export const STAGES_PAST_LIST_LADDER: ReadonlySet<string> = new Set([
  "ready_to_tour",
  "done_touring",
  "applied",
  "closed",
])
