// THE SAME PROPERTY VIDEO, SCHEDULED SEPARATELY FOR TIKTOK.
//
// An Instagram Reel and a TikTok Video are one creative on two surfaces, and the system already
// has a word for that: a DESTINATION. What it does not have is a way to put one creative on both
// at times chosen independently, because a social_posts row carries exactly one destination and
// one scheduled_at. So this creates a SIBLING row.
//
// ── WHY NOT THE STORY COMPANION ─────────────────────────────────────────────────────────────
// storyCompanion.ts already copies a creative into a second row, and the resemblance is a trap.
// A companion Story is DEPENDENT: it carries follows_post_id, it has no schedule of its own, and
// releaseStoryForReel only arms it once the Reel has genuinely published. That is correct for a
// Story, which is a follow-up to a Reel.
//
// A TikTok post is not a follow-up to anything. It is the same video, posted to a different
// platform, on its own schedule, under its own approval. So the sibling copies the companion's
// SAFETY (created at approval so a human sees it first; idempotent; never auto-scheduled) and
// deliberately not its DEPENDENCY: no follows_post_id, no release step, no inherited schedule.
//
// ── IT NEEDS ITS OWN RENDER, AND THIS IS THE PART THAT BITES ────────────────────────────────
// A companion Story reuses the Reel's artifact because instagram_story and instagram_reel share
// one safeAreaId, so the two renders are byte-identical — that was measured, not assumed.
// tiktok_video does NOT: its safeAreaId is "tiktok", a different geometry with a different
// headline position. Copying the Instagram MP4 would publish a video laid out for another app,
// which is exactly the defect the publish route's `wrong_destination` guard exists to catch. So
// the sibling starts with NO render and must be rendered for TikTok before it can go anywhere.
//
// ── WHAT IT DOES NOT TOUCH ──────────────────────────────────────────────────────────────────
// Nothing here reads, updates or schedules the Instagram row. Creating a sibling cannot change
// an existing schedule, caption, render or approval; the Instagram post is the SOURCE of the
// copy and is left exactly as found.
import { DESTINATIONS, isSocialDestination, type SocialDestination } from "./destinations"

type Row = Record<string, unknown>

/** The columns a TikTok sibling needs from its Instagram original. */
export const SIBLING_SOURCE_COLUMNS =
  "id, owner_user_id, source_content_id, destination, platform, post_name, caption, hashtags, " +
  "social_special, overlay_headline, overlay_subheadline, overlay_mode, overlay_template, " +
  "audio_choice, audio_track_id, voice_hook_id, voice_cta_id, source_storage_path, approved_at, " +
  "follows_post_id, presenter_id, presenter_intro_seconds, presenter_side, presenter_width_px"

export type SiblingResult =
  | { created: true; postId: string }
  | {
      created: false
      reason:
        | "already_exists"
        | "source_not_found"
        | "not_approved"
        | "not_a_publishable_original"
        | "insert_failed"
      postId?: string
      message?: string
    }

/**
 * Is this row something we may copy to TikTok?
 *
 * Pure, so every refusal is testable without a database. The rules are deliberately narrow:
 * a companion Story is not an original, a row that is already a TikTok post is not copied again,
 * and an unapproved post has not been through the gate that makes copying safe.
 */
export function canCreateTikTokSibling(row: Row | null): { ok: true } | { ok: false; reason: SiblingResult extends { created: false; reason: infer R } ? R : never } {
  if (!row) return { ok: false, reason: "source_not_found" }
  // A Story companion is a derivative, not an original. Copying one would produce a TikTok post
  // from a row that itself has no independent meaning.
  if (row.follows_post_id) return { ok: false, reason: "not_a_publishable_original" }
  const dest: SocialDestination = isSocialDestination(row.destination)
    ? row.destination
    : "instagram_reel" // legacy rows with a null destination are Reels by history
  const spec = DESTINATIONS[dest]
  // Only an original on another provider's surface. A tiktok_video has nothing to copy to.
  if (spec.provider === "tiktok") return { ok: false, reason: "not_a_publishable_original" }
  if (spec.surface !== "reel") return { ok: false, reason: "not_a_publishable_original" }
  // APPROVAL IS THE GATE. The sibling is created at approval precisely so a human has already
  // looked at the creative before a second copy of it exists anywhere.
  if (!row.approved_at) return { ok: false, reason: "not_approved" }
  return { ok: true }
}

/**
 * Build the TikTok sibling row.
 *
 * Copies the CREATIVE — the property, the copy, the overlay, the audio, the presenter settings —
 * and nothing that would let it act on its own before a human says so.
 *
 * Specifically NOT copied, and each for its own reason:
 *   scheduled_at   — the whole point is an independent time. Inheriting one would schedule a
 *                    TikTok post the moment an Instagram post was approved.
 *   approved_at    — approving the Instagram post approved THAT post. TikTok carries different
 *                    obligations (privacy, disclosure, consent) and takes its own approval.
 *   rendered_*     — different safe area, so the Instagram artifact is the wrong pixels.
 *   external_post_id / published_at / error_message — publishing state belongs to the row that
 *                    published; a fresh sibling has none.
 *   connection_id  — resolved when the TikTok account is chosen, not inherited from Instagram.
 */
export function tiktokSiblingRowFrom(original: Row, originalId: string): Row {
  return {
    owner_user_id: original.owner_user_id,
    source_content_id: original.source_content_id,
    platform: "tiktok",
    destination: "tiktok_video",
    post_type: "video",
    post_name: original.post_name,

    // The creative travels.
    caption: original.caption ?? null,
    hashtags: original.hashtags ?? null,
    social_special: original.social_special ?? null,
    overlay_headline: original.overlay_headline ?? null,
    overlay_subheadline: original.overlay_subheadline ?? null,
    overlay_mode: original.overlay_mode ?? null,
    overlay_template: original.overlay_template ?? null,
    audio_choice: original.audio_choice ?? null,
    audio_track_id: original.audio_track_id ?? null,
    voice_hook_id: original.voice_hook_id ?? null,
    voice_cta_id: original.voice_cta_id ?? null,
    source_storage_path: original.source_storage_path ?? null,
    presenter_id: original.presenter_id ?? null,
    presenter_intro_seconds: original.presenter_intro_seconds ?? null,
    presenter_side: original.presenter_side ?? null,
    presenter_width_px: original.presenter_width_px ?? null,

    // TikTok geometry differs — this must be rendered for TikTok before it can publish, and the
    // publish route refuses an Instagram-geometry render outright.
    rendered_storage_path: null,
    render_status: "none",
    render_version: null,

    // Inert until a human schedules, approves and renders it.
    status: "draft",
    scheduled_at: null,
    approved_at: null,
    connection_id: null,
    // NOT a companion: this row stands alone. follows_post_id stays null deliberately, so the
    // Story release machinery never sees it and the Instagram row never points at it.
    follows_post_id: null,
    created_via: "variation",
  }
}

type Q = {
  select: (c: string) => Q
  eq: (c: string, v: unknown) => Q
  is: (c: string, v: unknown) => Q
  maybeSingle: () => Promise<{ data: Row | null; error: { code?: string; message?: string } | null }>
  insert: (v: Row) => Q
}
export type SiblingClient = { from: (t: string) => Q }

/**
 * Create the TikTok sibling for an approved post, if one does not already exist.
 *
 * IDEMPOTENCY, HONESTLY STATED. This reads first and treats a 23505 as success, exactly as the
 * Story companion does — but the Story companion is backed by a partial unique index, and the
 * equivalent index for TikTok siblings is PREPARED AND NOT APPLIED (see
 * supabase/migrations/.../tiktok_sibling_unique.sql, held back while the Content Posting API
 * audit is under review). Until that index exists, the read-then-insert is the only guard and it
 * is NOT atomic: two simultaneous callers can both see "none" and both insert.
 *
 * That is acceptable only because nothing calls this automatically yet. It must not be wired to
 * an automatic trigger, and the worker must not be armed, until the index is applied.
 *
 * Returns a reason rather than throwing: a missing sibling is a degraded feature, and throwing
 * here would fail whatever approval triggered it — approval being the more important act.
 */
export async function ensureTikTokSibling(client: SiblingClient, originalId: string): Promise<SiblingResult> {
  const { data: original, error: readErr } = await client
    .from("social_posts")
    .select(SIBLING_SOURCE_COLUMNS)
    .eq("id", originalId)
    .maybeSingle()
  if (readErr || !original) return { created: false, reason: "source_not_found" }

  const allowed = canCreateTikTokSibling(original)
  if (!allowed.ok) return { created: false, reason: allowed.reason }

  // Already there? Keyed on the same pair the prepared index keys on.
  const { data: existing } = await client
    .from("social_posts")
    .select("id")
    .eq("source_content_id", original.source_content_id)
    .eq("destination", "tiktok_video")
    .maybeSingle()
  if (existing?.id) return { created: false, reason: "already_exists", postId: String(existing.id) }

  const { data: inserted, error: insErr } = await client
    .from("social_posts")
    .insert(tiktokSiblingRowFrom(original, originalId))
    .select("id")
    .maybeSingle()
  if (insErr) {
    // The index — once applied — is the real guarantee, so a uniqueness violation means someone
    // else won the race and the desired state is reached. Not an error.
    if (insErr.code === "23505") return { created: false, reason: "already_exists" }
    return { created: false, reason: "insert_failed", message: insErr.message }
  }
  if (!inserted?.id) return { created: false, reason: "insert_failed" }
  return { created: true, postId: String(inserted.id) }
}
