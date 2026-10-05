// Social Beast — the master Auto Posting switch, read server-side.
//
// This is the second of two independent gates on automatic Instagram publishing. The first is the
// environment flag (a deploy-time kill switch); this is the operator's, flipped from the UI and
// effective immediately. Publishing requires BOTH to be affirmative.
//
// Every function here is written so that the ONLY way to get permission to publish is an explicit,
// successfully-read 'on'. Absent row, unreadable row, unrecognised value, thrown error — all of
// them resolve to paused. "We could not determine the setting" never means "go ahead".

import type { SupabaseClient } from "@supabase/supabase-js"

export type AutoPostingState = "on" | "paused"

export type AutoPostingSettings = {
  state: AutoPostingState
  /** When auto posting last became 'on'. Null when never resumed (or currently paused). */
  resumedAt: string | null
  /** True when the setting could not be read at all — surfaced so the caller can SAY so rather
   *  than report a confident "paused" that is really "unknown". Still paused either way. */
  unreadable?: true
}

/** The one safe default. Exported so callers cannot invent a different fallback. */
export const AUTO_POSTING_FALLBACK: AutoPostingSettings = { state: "paused", resumedAt: null }

/** Narrow any stored/unknown value to a state. Anything that is not exactly "on" is paused. */
export function normalizeAutoPosting(v: unknown): AutoPostingState {
  return v === "on" ? "on" : "paused"
}

/**
 * Read one owner's Auto Posting settings.
 *
 * Returns paused on a query error, a missing row, or an unparseable value — and marks the error
 * case `unreadable` so the worker can report the difference without ever acting on it.
 */
export async function readAutoPosting(
  db: SupabaseClient<any, "public", any>,
  ownerUserId: string,
): Promise<AutoPostingSettings> {
  try {
    const { data, error } = await db
      .from("social_settings")
      .select("auto_posting, auto_posting_resumed_at")
      .eq("owner_user_id", ownerUserId)
      .maybeSingle()
    // A failed read is NOT "no row" — the setting might well be 'on'. We still refuse to publish,
    // because the alternative is publishing on the strength of a database error.
    if (error) return { ...AUTO_POSTING_FALLBACK, unreadable: true }
    if (!data) return AUTO_POSTING_FALLBACK
    const row = data as { auto_posting?: unknown; auto_posting_resumed_at?: unknown }
    return {
      state: normalizeAutoPosting(row.auto_posting),
      resumedAt: typeof row.auto_posting_resumed_at === "string" ? row.auto_posting_resumed_at : null,
    }
  } catch {
    return { ...AUTO_POSTING_FALLBACK, unreadable: true }
  }
}

/**
 * Is a due post eligible to publish automatically, given the owner's settings?
 *
 * THE BACKLOG RULE. Pausing leaves scheduled posts untouched, so resuming after a two-day pause
 * would otherwise find four posts "due" and publish them back to back. A post is eligible only if
 * its scheduled_at is at or after the moment auto posting was resumed; anything earlier was missed
 * during the pause and is reported as overdue instead — row intact, schedule intact, date not
 * rewritten, waiting for a human.
 *
 * A null resumedAt while 'on' is an anomaly the writer RPC cannot produce; it is treated as
 * not-eligible rather than guessed in the publishing direction.
 */
export function isEligibleAfterResume(scheduledAt: string | null | undefined, settings: AutoPostingSettings): boolean {
  if (settings.state !== "on") return false
  if (!settings.resumedAt || !scheduledAt) return false
  const due = Date.parse(scheduledAt)
  const resumed = Date.parse(settings.resumedAt)
  if (!Number.isFinite(due) || !Number.isFinite(resumed)) return false
  return due >= resumed
}

/**
 * How late a post may be and still publish automatically.
 *
 * The resume stamp covers the PAUSE case exactly. This covers the same hazard arriving by a
 * different route — a cron outage, a long deploy gap, a backlog built up before the worker
 * existed — where scheduled_at is far in the past but no pause was involved. The worker runs every
 * 5 minutes, so a healthy post is never more than minutes late and this window is invisible in
 * normal operation; it only ever catches a burst that should not happen.
 */
export const MAX_LATENESS_MS = 2 * 60 * 60 * 1000

/** Is this post merely late, or stale enough that publishing it now would be a surprise? */
export function isWithinLatenessWindow(scheduledAt: string | null | undefined, now = Date.now()): boolean {
  if (!scheduledAt) return false
  const due = Date.parse(scheduledAt)
  if (!Number.isFinite(due)) return false
  return now - due <= MAX_LATENESS_MS
}
