// WHICH TAB DOES A POST BELONG IN?
//
// ONE definition, imported by the posts API, the single-post GET and the tests, so the library and
// the editor can never disagree about what "ready" means.
//
// ── TWO CONDITIONS, NOT ONE ──────────────────────────────────────────────────────────────────
// The first cut of this used "a rendered MP4 exists" alone. That silently promoted every TEST
// render into production-ready inventory, which is backwards: most rendered posts here are test
// renders whose property content (pricing, specials, amenities, keywords, notes, captions) has not
// been verified. An artifact proves a render succeeded. It proves nothing about whether anyone
// checked what is in it.
//
// So Rendered/Ready requires BOTH:
//   1. a usable artifact  — render_status='ready' AND rendered_storage_path
//   2. human approval     — approved_at, or already published
//
// Published counts as approved because it is a stronger fact than any flag: it went out. That also
// means publishing never needs an approval backfill.
//
// Everything else is Working — including a rendered-but-unapproved test post, which is exactly
// where it belongs while its content is still being verified. Nothing is deleted or hidden; the
// MP4 and the whole render history stay on the row.

export type PostLane = "working" | "rendered"

/** The render/approval facts a lane decision needs. Snake_case to match the DB row directly. */
export type LaneFacts = {
  render_status?: string | null
  rendered_storage_path?: string | null
  approved_at?: string | null
  published_at?: string | null
}

/** Is there a usable video for this post right now? */
export const hasRender = (p: LaneFacts): boolean =>
  p.render_status === "ready" && !!p.rendered_storage_path

/** Has a person signed this off? Publishing implies it — it already went out. */
export const isApproved = (p: LaneFacts): boolean =>
  !!p.approved_at || !!p.published_at

/**
 * Rendered/Ready means final: schedulable, publishable, reusable.
 *
 * Deliberately NOT keyed on `status`. status is set automatically by the renderer (measured:
 * status='ready' and render_status='ready' are perfectly correlated, 7 of 7 with no divergence),
 * so keying on it would both re-admit unapproved test renders and risk hiding published posts.
 */
export const isRenderedReady = (p: LaneFacts): boolean => hasRender(p) && isApproved(p)

export const laneOf = (p: LaneFacts): PostLane => (isRenderedReady(p) ? "rendered" : "working")

/**
 * Why is this post still in Working? Drives the card's one-line status.
 *
 * `rendered_unapproved` is the case that motivated all of this — the post looks finished and is
 * not, so it gets its own reason rather than being lumped in with drafts.
 */
export type WorkingReason =
  | "needs_render"        // no artifact yet
  | "rendering"           // in progress
  | "render_error"        // failed; render_error has the detail
  | "rendered_unapproved" // a video exists but nobody has signed off on the content
  | "needs_rerender"      // had a render, then the burned-in creative changed

export function workingReason(p: LaneFacts & { render_error?: string | null }): WorkingReason | null {
  if (isRenderedReady(p)) return null
  if (p.render_status === "rendering") return "rendering"
  if (p.render_status === "error") return "render_error"
  if (hasRender(p)) return "rendered_unapproved"
  // An artifact still on the row while render_status is no longer 'ready' means a render existed
  // and a real creative change invalidated it — distinct from "never rendered".
  if (p.rendered_storage_path) return "needs_rerender"
  return "needs_render"
}

export const WORKING_REASON_LABEL: Record<WorkingReason, string> = {
  needs_render: "Needs render",
  rendering: "Rendering…",
  render_error: "Render failed",
  rendered_unapproved: "Rendered · not approved",
  needs_rerender: "Re-render required",
}

/**
 * Does this SOURCE still belong in Working?
 *
 * Working is source-centric (one card per property/source video), so a source leaves Working only
 * when every one of its posts is finished. A source with no posts at all has definitionally not
 * been worked yet and stays.
 *
 * This is what stops a property lingering in Working after its creative is done, while still
 * keeping it there when one version is approved and another is mid-edit.
 */
export function sourceNeedsWork(posts: readonly LaneFacts[]): boolean {
  if (posts.length === 0) return true
  return posts.some((p) => !isRenderedReady(p))
}
