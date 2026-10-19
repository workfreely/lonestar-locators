// AI PRESENTER — matching a voice recording to the avatar clip that was lip-synced to it.
//
// PHASE 2a: lookup and reuse. Nothing here generates anything, calls HeyGen, or spends credit.
//
// ── THE ONE PROPERTY THAT MATTERS ───────────────────────────────────────────────────────────
// A clip lip-synced to recording A must NEVER be served for recording B. That failure renders
// cleanly, publishes cleanly, and looks like a broken product: the right words with the wrong
// mouth. Everything below is shaped around making it structurally impossible rather than merely
// unlikely —
//
//   * the match key is the AUDIO STORAGE PATH, so a lookup for B cannot return A's row;
//   * resolvePresenterClip RECOMPUTES on every change and never retains a previous answer, which
//     is the other half of the same bug: switching the hook while keeping the old clip path;
//   * a row is only usable at status 'ready' AND with a clip file present.
//
// ── WHY NOT KEY ON voice_clip_id ────────────────────────────────────────────────────────────
// The storage path is what was actually synced; the social_voice_clips row is a label pointing at
// it. Audio is immutable in practice (upsert:false, a fresh uuid per upload, no update route) but
// nothing enforces it, so the path is the honest key — and a deleted-then-re-uploaded hook gets a
// new path and correctly reads as "no match" instead of reusing the old mouth.
import { createHash } from "node:crypto"

/** The statuses a lookup may serve a clip from. Only one. */
export const USABLE_STATUS = "ready" as const

/** Statuses that occupy the (presenter, audio) slot and so block a duplicate. Mirrors the partial
 *  unique index in the migration — keep the two in step. */
export const LIVE_STATUSES = ["queued", "generating", "ready"] as const

export type PresenterClipStatus = "queued" | "generating" | "ready" | "failed" | "cancelled"

export type PresenterClipRow = {
  id: string
  presenterId: string | null
  voiceClipId: string | null
  audioStoragePath: string
  clipStoragePath: string | null
  status: PresenterClipStatus
  attemptCount?: number
  maxAttempts?: number
  errorMessage?: string | null
}

/**
 * The idempotency key for one (presenter, avatar, audio) triple.
 *
 * Hashed rather than concatenated for the same reason renderJobKey() hashes: the column is UNIQUE
 * and the inputs are arbitrary-length storage keys. Including the avatar id as well as the
 * presenter id means re-pointing a presenter at a different HeyGen avatar is correctly a different
 * clip rather than a collision with the old one.
 */
export function presenterClipKey(input: {
  presenterId: string
  audioStoragePath: string
  heygenAvatarId?: string | null
}): string {
  const canonical = JSON.stringify([
    input.presenterId.trim(),
    (input.heygenAvatarId ?? "").trim(),
    input.audioStoragePath.trim(),
  ])
  return createHash("sha256").update(canonical).digest("hex").slice(0, 48)
}

/** Is this row a clip a render may actually use? Status AND file, never status alone. */
export function isUsableClip(row: Pick<PresenterClipRow, "status" | "clipStoragePath"> | null | undefined): boolean {
  if (!row) return false
  return row.status === USABLE_STATUS && !!row.clipStoragePath && row.clipStoragePath.trim().length > 0
}

/**
 * Find the row for one audio recording among rows already scoped to a presenter.
 *
 * The path comparison is EXACT — no normalisation, no prefix matching, no case folding. A storage
 * key is an opaque identifier, and any fuzziness here is the desync bug wearing a helpful face.
 */
export function findMatch(rows: readonly PresenterClipRow[], audioStoragePath: string): PresenterClipRow | null {
  const want = audioStoragePath.trim()
  if (!want) return null
  return rows.find((r) => r.audioStoragePath === want) ?? null
}

/** What the editor should say, and what the renderer should be pointed at. */
export type ClipMatchState =
  /** No voice hook selected. The presenter's own clip is used, exactly as before this feature. */
  | "no_voice_selected"
  /** A clip lip-synced to THIS recording exists and will be reused. No generation needed. */
  | "matched"
  /** A generation is in flight for this pair (Phase 2b). Nothing to reuse yet. */
  | "pending"
  /** The last attempt for this pair failed. Retryable. */
  | "failed"
  /** No clip has ever been synced to this recording. */
  | "unmatched"
  /** A clip row exists and claims ready but its file is missing or empty — never served. */
  | "unavailable"

export type ClipResolution = {
  state: ClipMatchState
  /** The storage key the post should carry, or null to leave the presenter with no clip. */
  clipStoragePath: string | null
  /** True when clipStoragePath came from a clip synced to the SELECTED recording. */
  lipSyncVerified: boolean
  /** The matched row's id, when there is one. */
  clipId: string | null
}

/**
 * Decide which clip a post should use, given the presenter, the selected recording and the cache.
 *
 * ── THE FALLBACK, AND WHY IT IS NOT SILENT ──────────────────────────────────────────────────
 * On a miss this returns the presenter's OWN clip — which is what a post gets today, so behaviour
 * is unchanged for anyone not using the cache — but with lipSyncVerified FALSE. That flag is the
 * contract: the editor must say out loud that the mouth was not synced to this recording. The
 * alternative, returning null, would silently render no avatar at all, which is a different
 * silent wrong answer rather than a fix.
 *
 * ── THE RECOMPUTE RULE ──────────────────────────────────────────────────────────────────────
 * This function takes the CURRENT selection and the CURRENT rows and returns a complete answer. It
 * has no memory and no "keep what was there" branch, which is deliberate: retaining a previously
 * resolved path across a change of hook is exactly how a clip synced to A ends up on B. Callers
 * must always write what this returns, including when it returns the fallback.
 */
export function resolvePresenterClip(input: {
  /** The presenter's own default clip, from social_presenters.clip_storage_path. */
  presenterClipStoragePath: string | null
  /** The storage path of the selected voice recording, or null when none is selected. */
  selectedAudioStoragePath: string | null
  /** Cache rows for this presenter. May be empty. */
  rows: readonly PresenterClipRow[]
}): ClipResolution {
  const audio = (input.selectedAudioStoragePath ?? "").trim()
  const own = (input.presenterClipStoragePath ?? "").trim() || null

  if (!audio) {
    // Unchanged pre-cache behaviour: the presenter's own clip, no claim about lip-sync.
    return { state: "no_voice_selected", clipStoragePath: own, lipSyncVerified: false, clipId: null }
  }

  const row = findMatch(input.rows, audio)
  if (!row) return { state: "unmatched", clipStoragePath: own, lipSyncVerified: false, clipId: null }

  if (row.status === "queued" || row.status === "generating") {
    return { state: "pending", clipStoragePath: own, lipSyncVerified: false, clipId: row.id }
  }
  if (row.status === "failed" || row.status === "cancelled") {
    return { state: "failed", clipStoragePath: own, lipSyncVerified: false, clipId: row.id }
  }
  // status === 'ready'. The DB CHECK requires a file for 'ready', but a row whose object was
  // deleted out from under it would still read as ready — so the file is checked here too, and a
  // readyish row with no usable path is reported rather than served.
  if (!isUsableClip(row)) {
    return { state: "unavailable", clipStoragePath: own, lipSyncVerified: false, clipId: row.id }
  }
  return { state: "matched", clipStoragePath: row.clipStoragePath, lipSyncVerified: true, clipId: row.id }
}

/** One line of operator-facing copy per state. The warning cases say what will actually happen. */
export const CLIP_STATE_MESSAGE: Record<ClipMatchState, string> = {
  no_voice_selected: "Using this presenter’s own clip.",
  matched: "Reusing the avatar clip recorded for this voice hook — no new generation needed.",
  pending: "An avatar clip for this voice hook is still being generated.",
  failed: "The last avatar clip for this voice hook failed. You can try again.",
  unmatched: "No avatar clip has been matched to this voice hook, so the avatar’s mouth will not match the audio.",
  unavailable: "The avatar clip matched to this voice hook is missing its file and will not be used.",
}

/** Does this state mean the avatar is safe to show against the selected recording? */
export function isLipSyncSafe(state: ClipMatchState): boolean {
  return state === "matched"
}
