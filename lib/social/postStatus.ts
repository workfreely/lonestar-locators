// Social Autopilot post lifecycle — the single source of truth for post status values,
// their display labels, and which statuses belong in the Queue. Rendering/publishing
// workers are NOT built yet; this just names the states cleanly so they can be added.

export const POST_STATUSES = [
  "draft",
  "rendering",
  "ready",
  "scheduled",
  "publishing",
  "needs_attention",
  "published",
] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  rendering: "Rendering",
  ready: "Ready",
  scheduled: "Scheduled",
  publishing: "Publishing",
  needs_attention: "Needs Attention",
  published: "Published",
}

// Queue holds everything that has NOT yet successfully published. 'published' lives in
// History (once real publishing exists); it never appears in the Queue.
export const QUEUE_STATUSES: PostStatus[] = [
  "draft",
  "rendering",
  "ready",
  "scheduled",
  "publishing",
  "needs_attention",
]

export function isPostStatus(v: unknown): v is PostStatus {
  return typeof v === "string" && (POST_STATUSES as readonly string[]).includes(v)
}
