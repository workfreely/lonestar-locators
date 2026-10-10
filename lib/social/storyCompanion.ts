// THE MISSING LINK IN THE STORY CHAIN.
//
// Everything else already existed: a 45-minute delay constant, a decision function gated on the
// Reel's real publish facts, race guards, a partial unique index, and an eligibility exclusion so
// a Story never consumes a rotation slot. All of it was unreachable, because NOTHING EVER CREATED
// A ROW WITH follows_post_id. Every publish logged "story not scheduled: no_story".
//
// This creates that row. It does not schedule it and it does not publish it — releaseStoryForReel
// still owns that, and still only fires once the Reel has genuinely published. The division is
// deliberate: creating a companion is cheap and reversible, scheduling one is not.
//
// ── WHY AT APPROVAL, NOT AT PUBLISH ─────────────────────────────────────────────────────────
// The companion exists from the moment a human approves the Reel, so it is visible in the library
// and can be inspected or deleted BEFORE anything goes out. Creating it at publish time would
// conjure a post nobody had seen, 45 minutes before it appeared on Instagram.
//
// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────────────────
// A partial unique index on (follows_post_id) WHERE destination='instagram_story' makes a second
// companion impossible. This reads first for a friendly answer and treats 23505 as success,
// because the read-then-insert is not atomic and the index is the actual guarantee.
import { DESTINATIONS, isSocialDestination } from "./destinations"

export type CompanionResult =
  | { created: true; storyId: string }
  | { created: false; reason: "already_exists" | "not_a_reel" | "no_render" | "not_approved" | "reel_not_found" | "insert_failed"; storyId?: string; message?: string }

type Row = Record<string, unknown>
type Q = {
  select: (c: string) => Q
  eq: (c: string, v: unknown) => Q
  maybeSingle: () => Promise<{ data: Row | null; error: { code?: string; message?: string } | null }>
  insert: (v: Row) => Q
}
export type CompanionClient = { from: (t: string) => Q }

/**
 * The columns a companion Story copies from its Reel.
 *
 * It is the SAME creative on a second surface — same property, same footage, same rendered MP4
 * (instagram_story shares the Reel's safe-area geometry, so the artifact is byte-identical and is
 * deliberately reused rather than re-rendered). What it does NOT copy is anything that would make
 * it act like an independent post: no schedule, no connection, no approval, no caption. A Story
 * carries no caption on Instagram at all, so sending one would be meaningless.
 */
export function companionRowFrom(reel: Row, reelId: string): Row {
  return {
    owner_user_id: reel.owner_user_id,
    source_content_id: reel.source_content_id,
    platform: "instagram",
    destination: "instagram_story",
    post_type: reel.post_type ?? "story",
    post_name: reel.post_name,
    // The SAME artifact. Not a re-render: the two surfaces share geometry.
    rendered_storage_path: reel.rendered_storage_path,
    render_status: "ready",
    render_version: reel.render_version,
    source_storage_path: reel.source_storage_path,
    // Presenter settings ride along so the Story looks like the Reel it follows.
    presenter_id: reel.presenter_id ?? null,
    presenter_intro_seconds: reel.presenter_intro_seconds ?? null,
    presenter_side: reel.presenter_side ?? null,
    presenter_width_px: reel.presenter_width_px ?? null,
    presenter_clip_storage_path: reel.presenter_clip_storage_path ?? null,
    presenter_audio_storage_path: reel.presenter_audio_storage_path ?? null,
    // THE LINK. The partial unique index keys on exactly this.
    follows_post_id: reelId,
    // Deliberately NOT scheduled, NOT assigned, NOT approved. releaseStoryForReel stamps all three
    // once — and only once — the Reel has actually published.
    status: "draft",
    scheduled_at: null,
    connection_id: null,
    approved_at: null,
    created_via: "variation",
  }
}

/**
 * Create the companion Story for an approved Reel, if it does not already exist.
 *
 * Returns a reason rather than throwing: a missing companion is a degraded feature, while a thrown
 * error here would fail the approval that triggered it — and approval is the more important act.
 */
export async function ensureStoryCompanion(client: CompanionClient, reelId: string): Promise<CompanionResult> {
  const { data: reel, error: readErr } = await client.from("social_posts")
    .select("id, owner_user_id, source_content_id, destination, platform, post_type, post_name, rendered_storage_path, render_status, render_version, source_storage_path, approved_at, follows_post_id, presenter_id, presenter_intro_seconds, presenter_side, presenter_width_px, presenter_clip_storage_path, presenter_audio_storage_path")
    .eq("id", reelId).maybeSingle()
  if (readErr || !reel) return { created: false, reason: "reel_not_found" }

  // A Story never follows another Story. Without this, approving a companion would create a
  // companion-of-a-companion and the chain would not terminate.
  if (reel.follows_post_id) return { created: false, reason: "not_a_reel" }

  // Legacy rows may carry a null destination; those are Reels by history.
  const dest = isSocialDestination(reel.destination) ? reel.destination : "instagram_reel"
  if (DESTINATIONS[dest].surface !== "reel") return { created: false, reason: "not_a_reel" }

  // The companion reuses the Reel's artifact, so there must BE one.
  if (reel.render_status !== "ready" || !reel.rendered_storage_path) return { created: false, reason: "no_render" }
  if (!reel.approved_at) return { created: false, reason: "not_approved" }

  const { data: existing } = await client.from("social_posts")
    .select("id").eq("follows_post_id", reelId).eq("destination", "instagram_story").maybeSingle()
  if (existing?.id) return { created: false, reason: "already_exists", storyId: existing.id as string }

  const { data: made, error: insErr } = await client.from("social_posts")
    .insert(companionRowFrom(reel, reelId)).select("id").maybeSingle()
  if (insErr) {
    // 23505 = the one-story-per-reel index. A concurrent approval won the race, which is the
    // correct outcome, not a fault.
    if ((insErr as { code?: string }).code === "23505") return { created: false, reason: "already_exists" }
    return { created: false, reason: "insert_failed", message: insErr.message }
  }
  if (!made?.id) return { created: false, reason: "insert_failed" }
  return { created: true, storyId: made.id as string }
}
