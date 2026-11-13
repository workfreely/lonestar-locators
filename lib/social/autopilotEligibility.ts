// THE ready-pool predicate: which posts may the autopilot planner schedule?
//
// Stated as one named function rather than inline query filters, because "eligible" is a safety
// boundary. Every exclusion below prevents a specific wrong outcome, and each is spelled out so a
// future query change cannot quietly widen the pool.
//
// The planner NEVER renders. A post that is not already a finished artifact is not eligible —
// it is reported as missing inventory instead (see planAutopilot).
import { DESTINATIONS, isSocialDestination, destinationFromLegacyPlatform } from "./destinations"

export type EligibilityInput = {
  /** Set when this post is a companion distribution of another (a Story following its Reel).
   *  Follow-ups are released by their parent's publish, never by the planner. */
  followsPostId?: string | null
  status: string | null
  renderStatus: string | null
  renderedStoragePath: string | null
  scheduledAt: string | null
  publishedAt: string | null
  externalPostId: string | null
  connectionId: string | null
  /**
   * The legacy column. It is NO LONGER what decides which network a post belongs to — see
   * providerOf below — and is kept because a row with a NULL destination still has to be placed
   * somewhere, and because it is what the Instagram worker's own due query filters on.
   */
  platform: string | null
  /**
   * THE SURFACE this post is laid out for, and now the thing that decides its network.
   *
   * Six production rows carry destination = 'tiktok_video' with platform = 'instagram': the
   * editor's destination control writes `destination` and deliberately leaves `platform` alone,
   * on the stated grounds that every GEOMETRY path reads the destination. True — and the planner
   * is not a geometry path. It grouped by `platform`, so those rows entered the INSTAGRAM
   * rotation, where the Instagram worker would then refuse them at its publishability gate and
   * fail them to needs_attention.
   */
  destination?: string | null
  /** EXPLICIT HUMAN APPROVAL. Null means nobody has signed off on this creative. */
  approvedAt?: string | null
}

export type Ineligible =
  | "not_ready"            // still a draft / rendering — the planner does not render
  | "already_scheduled"
  | "already_published"
  | "assigned_to_connection"
  | "needs_attention"
  | "render_failed"
  | "no_rendered_artifact"
  | "wrong_platform"
  | "follow_up_post"       // a companion Story — scheduled by its Reel, not by the rotation
  | "not_approved"         // rendered, but no human has signed off on it

/**
 * Why this post cannot be scheduled, or null when it can.
 *
 * Order matters only for the REASON reported, never for the verdict — a post excluded by two
 * rules is excluded either way; the first reason is simply the most useful one to show.
 */
export function ineligibleReason(p: EligibilityInput, platform = "instagram"): Ineligible | null {
  // A finished MP4 is the hard precondition. render_status alone is not enough: a row can say
  // "ready" with no artifact if an upload failed, and handing Meta a null path fails at publish
  // time, far from here.
  if (p.renderStatus === "error") return "render_failed"
  if (p.renderStatus !== "ready" || !p.renderedStoragePath) return "no_rendered_artifact"

  // needs_attention is a human-review state. Scheduling it would bury the thing asking for review.
  if (p.status === "needs_attention") return "needs_attention"

  // Published is terminal. external_post_id and published_at are checked as well as status,
  // because the publish worker sets the id BEFORE the local status round-trips — a post mid-flight
  // has an id and must never be picked up again.
  if (p.status === "published" || p.publishedAt || p.externalPostId) return "already_published"

  // Already placed on the calendar. Re-scheduling would double-book the slot and could publish the
  // same creative twice.
  if (p.scheduledAt) return "already_scheduled"

  // Already belongs to a connected account. Taking it would let two accounts publish one post.
  if (p.connectionId) return "assigned_to_connection"

  // Only a post that is RENDERED and otherwise untouched is available. 'ready' is the one status
  // that means exactly that; 'draft'/'rendering'/'publishing' are not the planner's to take.
  if (p.status !== "ready") return "not_ready"

  // ── EXPLICIT HUMAN APPROVAL ───────────────────────────────────────────────────────────────
  // status='ready' is a MACHINE fact: renderPost sets it automatically when a render succeeds, so
  // every rendered post has it and it expresses no human intent whatsoever. Before this check the
  // library could label a post "RENDERED · NOT APPROVED" in amber while that same post sat in the
  // autopilot's eligible pool — the UI and the automation used two different definitions of
  // "ready" and the automation used the weaker one.
  //
  // approved_at is the only column a human sets deliberately. Nothing else in this predicate is.
  if (!p.approvedAt) return "not_approved"

  if (providerOf(p) !== platform) return "wrong_platform"

  // A COMPANION STORY IS NOT A ROTATION ENTRY. It is the same property and the same creative as a
  // Reel already in the plan, released 45 minutes after that Reel publishes. Letting it into the
  // pool would consume one of the day's two slots and show a viewer the same building twice.
  if (p.followsPostId) return "follow_up_post"
  return null
}

/**
 * WHICH NETWORK THIS POST PUBLISHES TO — one answer, derived from the destination.
 *
 * The destination registry already states each surface's provider (DESTINATIONS[d].provider), so
 * this reads the fact rather than inferring it from a second column that can disagree. A row with
 * no destination falls back to destinationFromLegacyPlatform, which is exactly how every other
 * destination-aware path in the codebase treats a legacy row — so nothing about those rows moves.
 *
 * The consequence that matters: a post is grouped by where it is GOING, not by a column that was
 * last written when it was created.
 */
export function providerOf(p: Pick<EligibilityInput, "platform" | "destination">): string {
  const d = isSocialDestination(p.destination) ? p.destination : destinationFromLegacyPlatform(p.platform)
  return DESTINATIONS[d].provider
}

export function isEligible(p: EligibilityInput, platform = "instagram"): boolean {
  return ineligibleReason(p, platform) === null
}

/**
 * The equivalent SERVER-SIDE filter, kept beside the predicate so the two cannot drift.
 *
 * The database narrows the set; ineligibleReason is still applied to every returned row, so a
 * column this filter forgets cannot silently admit an ineligible post.
 */
export const ELIGIBLE_POOL_FILTER = {
  status: "ready",
  render_status: "ready",
  scheduled_at: null,
  published_at: null,
  external_post_id: null,
  connection_id: null,
} as const

/** Columns that must be NOT NULL for a post to be eligible. Separate from the equality filter
 *  above because PostgREST expresses the two differently (`.eq` vs `.not(...,"is",null)`). */
export const ELIGIBLE_POOL_NOT_NULL = ["approved_at"] as const
