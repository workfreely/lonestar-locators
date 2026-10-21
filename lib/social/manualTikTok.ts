// MANUAL TIKTOK PUBLISHING — the pure parts.
//
// ── WHY THIS IS MANUAL AT ALL ───────────────────────────────────────────────────────────────
// TikTok's inbox/draft upload needs the `video.upload` scope. Our connection holds `video.publish`
// (Direct Post) and `user.info.basic` and nothing else, by deliberate choice — see
// lib/social/tiktok.ts. Direct Post additionally needs audit approval we do not have, and the
// access token expired on 14 Oct. So no API path is open today, and these helpers exist to make
// the human path short rather than to pretend it is automated.
//
// Nothing here authenticates to TikTok, calls TikTok, or records a publish. Opening the upload
// page is not evidence that anything was posted, so no status is written when it happens.

/** The caption a locator pastes: the APPROVED text, with saved hashtags appended as a post carries
 *  them. Never recomposed, never regenerated — this only joins what is already stored. */
export function tiktokCaptionFor(input: { caption: string | null; hashtags?: string[] | null }): string {
  const body = (input.caption ?? "").trim()
  const tags = (input.hashtags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
  // Already present in the caption? Then the post carries them inline and appending would double
  // them — a locator pasting that into TikTok would ship a visibly duplicated tag list.
  const missing = tags.filter((t) => !body.includes(t))
  if (!missing.length) return body
  return body ? `${body}\n\n${missing.join(" ")}` : missing.join(" ")
}

/** A filename a person can find again: property, template and render version. */
export function tiktokDownloadName(input: {
  propertyName?: string | null
  overlayTemplate?: string | null
  renderVersion?: number | null
}): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const parts = [input.propertyName, input.overlayTemplate].map((p) => slug(String(p ?? ""))).filter(Boolean)
  const base = parts.join("-") || "social-video"
  return `${base}-v${input.renderVersion ?? 1}.mp4`
}

/** May the manual actions show? Only with a real rendered artifact to hand over. */
export function canPublishManually(input: { renderedPreviewUrl: string | null }): boolean {
  return typeof input.renderedPreviewUrl === "string" && input.renderedPreviewUrl.length > 0
}

export const TIKTOK_UPLOAD_URL = "https://www.tiktok.com/upload"
