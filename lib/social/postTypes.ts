// Social Autopilot post types — platform-scoped, so each platform owns its own content
// types without overloading another's. Instagram is first (Reel | Feed Post | Story);
// TikTok/YouTube can be added here later with NO migration (post_type is free text in the
// DB, validated against this map in the API).

export const POST_TYPES_BY_PLATFORM: Record<string, readonly string[]> = {
  instagram: ["reel", "feed", "story"],
}

export const DEFAULT_POST_TYPE: Record<string, string> = {
  instagram: "reel", // new video posts default to Reel
}

export const POST_TYPE_LABEL: Record<string, string> = {
  reel: "Reel",
  feed: "Feed Post",
  story: "Story",
}

export function isValidPostType(platform: string, postType: string): boolean {
  return (POST_TYPES_BY_PLATFORM[platform] ?? []).includes(postType)
}

export function defaultPostType(platform: string): string {
  return DEFAULT_POST_TYPE[platform] ?? (POST_TYPES_BY_PLATFORM[platform]?.[0] ?? "")
}

// Preview framing per Instagram type (foundation — not a pixel-perfect IG simulation).
// Reel & Story are full-height 9:16; Feed is a 4:5 portrait card.
export function previewAspectClass(platform: string, postType: string): string {
  if (platform === "instagram" && postType === "feed") return "aspect-[4/5]"
  return "aspect-[9/16]"
}
