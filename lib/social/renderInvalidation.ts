// WHEN DOES AN EDIT INVALIDATE A RENDERED VIDEO?
//
// Only when it actually changes the pixels. That sounds obvious; the route did not do it.
//
// ── THE BUG THIS EXISTS TO FIX ───────────────────────────────────────────────────────────────
// The PATCH route decided "this edit is render-affecting" from KEY PRESENCE:
//
//     if ("overlayHeadline" in body) { patch.overlay_headline = …; renderAffecting = true }
//
// …while the editor's fieldsBody() sends overlayHeadline, overlaySubheadline, overlayMode,
// overlayTemplate, audioChoice, voiceHookId and voiceCtaId on EVERY save. So every save — a
// schedule, a caption tweak, a hashtag edit — set render_status = 'none' and threw away a
// perfectly good MP4 that still matched its inputs exactly.
//
// Reproduced live on 2026-10-08: scheduling post 882a9b4c reset render_status to 'none' while
// every burned-in value stayed byte-identical. One post in the database (3dcb7a69) is still
// sitting draft/'none' holding a valid v4 artifact because of this.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────────────────────
// Compare the INCOMING value against the STORED value. Invalidate only on a real difference.
// This is change-based, not presence-based — the same distinction applied to content freshness
// elsewhere in Social Beast.
//
// PURE, so the policy is testable without a database or an HTTP request.

/**
 * The columns whose values are burned into the MP4.
 *
 * This list is the definition of "changes the pixels" for the editor's save path. It deliberately
 * mirrors the inputs of renderJobKey() in lib/social/renderJobs.ts, which is the same question
 * asked by the render queue — if a column is added to one it belongs in the other.
 *
 * NOT here, on purpose, because they do not touch the rendered frames:
 *   caption, hashtags, social_special  — Instagram caption text, never drawn into the video
 *   cover_thumb_offset_ms, cover_storage_path, cover_render_version
 *                                      — which frame Instagram SHOWS, not what the MP4 contains
 *   scheduled_at, status, destination, post_name, on_video_text/config
 */
export const RENDER_AFFECTING_COLUMNS = [
  "overlay_headline",
  "overlay_subheadline",
  "overlay_mode",
  "overlay_template",
  "audio_choice",
  "audio_track_id",
  "voice_hook_id",
  "voice_cta_id",
  // The post's own footage. Swapping the video is the most render-affecting change there is.
  "source_storage_path",
] as const

export type RenderAffectingColumn = (typeof RENDER_AFFECTING_COLUMNS)[number]

/**
 * Is the incoming value different from the stored one?
 *
 * null, undefined and "" are treated as THE SAME ABSENT VALUE. They are genuinely interchangeable
 * here — an empty headline and a null headline both render nothing — and the editor round-trips
 * one as the other (a cleared input posts "", a never-set column reads null). Without this, every
 * save of a post with an empty subheadline would look like a change and re-invalidate the render,
 * which is the original bug wearing a different hat.
 *
 * Strings are compared TRIMMED, because `str()` in the route trims before storing: an incoming
 * " ROOFTOP POOL " stores as "ROOFTOP POOL" and must not then read back as a difference.
 */
export function valueChanged(stored: unknown, incoming: unknown): boolean {
  const norm = (v: unknown): string | null => {
    if (v === null || v === undefined) return null
    if (typeof v === "string") {
      const t = v.trim()
      return t === "" ? null : t
    }
    return String(v)
  }
  return norm(stored) !== norm(incoming)
}

/**
 * Which render-affecting columns does this patch actually change?
 *
 * `patch` is the already-built column-level patch (snake_case keys), NOT the raw request body, so
 * this sees exactly the values that are about to be written — including the route's own trimming
 * and validation. A column absent from the patch is not being written and cannot be a change.
 *
 * Returns the column names rather than a bare boolean so the caller can log or surface WHAT forced
 * a re-render. "Re-render required" with no reason is the kind of message operators learn to
 * ignore.
 */
export function renderAffectingChanges(
  stored: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): RenderAffectingColumn[] {
  if (!stored) return []
  return RENDER_AFFECTING_COLUMNS.filter(
    (col) => col in patch && valueChanged(stored[col], patch[col]),
  )
}

/**
 * Should this patch invalidate the existing render?
 *
 * FAIL-SAFE WHEN THE STORED ROW IS UNKNOWN. If the row could not be read, we cannot prove the
 * edit is harmless, so any render-affecting column in the patch invalidates — the old
 * presence-based behaviour, kept only for that one case. Wrongly invalidating costs a re-render;
 * wrongly KEEPING a stale artifact would publish a video that does not match the post.
 */
export function shouldInvalidateRender(
  stored: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): boolean {
  if (!stored) return RENDER_AFFECTING_COLUMNS.some((col) => col in patch)
  return renderAffectingChanges(stored, patch).length > 0
}
