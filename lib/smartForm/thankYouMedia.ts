// THANK YOU PAGE MEDIA — testimonials or video, and which testimonials are real.
//
// Pure and testable. Shared by the public page, the editor and the preview so the three cannot
// disagree about what a given agent's page shows.

import { DEFAULT_CONFIG } from "@/app/smart-lead-form/_lib/defaultConfig"

export type ThankYouMedia = "testimonials" | "video"
/** Stored value. "" means the agent has never chosen, and the legacy rule below decides. */
export type ThankYouMediaSetting = "" | ThankYouMedia

export const THANKYOU_MEDIA_DEFAULT: ThankYouMedia = "testimonials"

/**
 * What should this Thank You page show?
 *
 * ── THE LEGACY RULE, AND WHY IT IS AN INFERENCE RATHER THAN A MIGRATION ─────────────────────
 * The setting is new, so every existing agent has "". Defaulting all of them to testimonials
 * would silently remove a video somebody deliberately configured — in production exactly one
 * workspace has a thankYouVideoUrl, and that video is on their live page today.
 *
 * So an unset value reads the only evidence available: a configured video URL means that agent
 * chose a video, and their page keeps it. No stored config is rewritten, nothing is migrated, and
 * the moment they use the new control their explicit choice wins for ever after.
 *
 * New and unconfigured pages have no video URL and therefore get testimonials, which is the
 * intended default.
 */
export function resolveThankYouMedia(config: {
  thankYouMedia?: string | null
  thankYouVideoUrl?: string | null
}): ThankYouMedia {
  const explicit = (config.thankYouMedia ?? "").trim().toLowerCase()
  if (explicit === "video") return "video"
  if (explicit === "testimonials") return "testimonials"
  // Never chosen: infer from what they configured before this control existed.
  return (config.thankYouVideoUrl ?? "").trim() ? "video" : THANKYOU_MEDIA_DEFAULT
}

export type Testimonial = { name: string; city?: string | null; quote: string; photoUrl?: string | null }

/**
 * The built-in sample quotes. These ship in DEFAULT_CONFIG so the editor preview has something to
 * lay out, and they are attributed to invented people in three cities.
 *
 * Derived from DEFAULT_CONFIG rather than copied, so editing the samples there can never leave a
 * stale duplicate here that would let fiction through.
 */
const SAMPLE_QUOTES: ReadonlySet<string> = new Set(
  DEFAULT_CONFIG.copy.testimonials.map((t) => t.quote.trim().toLowerCase()),
)

/**
 * The testimonials that are safe to show a renter.
 *
 * ONLY GENUINE ONES. A renter reading the Thank You page has just trusted this agent with their
 * search; a fabricated review there is a lie told at the worst possible moment. An agent who has
 * never edited their testimonials still carries the three samples in their config, so "has
 * testimonials" is not the same question as "has real testimonials" — the sample quotes are
 * excluded by content, which is what makes an unconfigured page render nothing rather than fiction.
 *
 * Blank entries are dropped too: a half-filled row is not a review.
 */
export function genuineTestimonials(list: readonly Testimonial[] | null | undefined, limit = 2): Testimonial[] {
  return (list ?? [])
    .filter((t) => {
      const quote = (t?.quote ?? "").trim()
      const name = (t?.name ?? "").trim()
      if (!quote || !name) return false
      return !SAMPLE_QUOTES.has(quote.toLowerCase())
    })
    .slice(0, limit)
}

/**
 * Should the Thank You page render a media block at all?
 *
 * Testimonials with none genuine, or video with no URL, both render NOTHING — never an empty card
 * and never a broken player. The page's existing no-media layout already handles that case.
 */
export function thankYouMediaToShow(config: {
  thankYouMedia?: string | null
  thankYouVideoUrl?: string | null
  testimonials?: readonly Testimonial[] | null
}): { media: ThankYouMedia; show: boolean; testimonials: Testimonial[] } {
  const media = resolveThankYouMedia(config)
  if (media === "video") {
    return { media, show: !!(config.thankYouVideoUrl ?? "").trim(), testimonials: [] }
  }
  const testimonials = genuineTestimonials(config.testimonials)
  return { media, show: testimonials.length > 0, testimonials }
}
