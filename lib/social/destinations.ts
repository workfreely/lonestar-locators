// DESTINATIONS — the content surface a post is built for, which is NOT the same thing as the
// platform it publishes to.
//
// The system used to carry only `platform`, and that conflation is a trap: an Instagram Reel and
// an Instagram Story share one account, one OAuth token and one provider, but they are different
// surfaces with different UI chrome, so a frame that is safe in a Reel can have its headline under
// the Story reply bar. Collapsing them would mean either one asset that is wrong on one surface,
// or a second fake "platform" that lies about which account it belongs to.
//
// So: PROVIDER answers "whose API publishes this, and with which token". DESTINATION answers "what
// is it for, and what geometry does it need". A creative fans out across destinations; an account
// belongs to a provider.
import type { PlatformSafeArea } from "@/lib/social/platformSafeArea"

export const SOCIAL_PROVIDERS = ["instagram", "tiktok"] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

export const SOCIAL_SURFACES = ["reel", "story", "video"] as const
export type SocialSurface = (typeof SOCIAL_SURFACES)[number]

export const SOCIAL_DESTINATIONS = ["instagram_reel", "instagram_story", "tiktok_video", "tiktok_story"] as const
export type SocialDestination = (typeof SOCIAL_DESTINATIONS)[number]

export const isSocialDestination = (v: unknown): v is SocialDestination =>
  typeof v === "string" && (SOCIAL_DESTINATIONS as readonly string[]).includes(v)

/**
 * Can this destination be published automatically, and if not, why not?
 *
 * The distinction matters because the three "no" cases need different responses:
 *
 *   supported            — an official API endpoint exists and we may use it
 *   awaiting_approval    — the endpoint exists, our app is not yet cleared to call it. A waiting
 *                          problem; the publisher can be built now.
 *   unsupported_by_provider — the provider exposes NO official endpoint for this surface. Not a
 *                          waiting problem and never will be solved by waiting. Writing a publisher
 *                          would mean browser automation against a platform that does not offer the
 *                          capability, which is not something to build.
 */
export type PublishSupport = "supported" | "awaiting_approval" | "unsupported_by_provider"

export type DestinationSpec = {
  id: SocialDestination
  label: string
  provider: SocialProvider
  surface: SocialSurface
  /** Which safe-area geometry this destination's overlay is fitted into. Two destinations sharing
   *  one id produce byte-identical frames and may share a rendered asset. */
  safeAreaId: string
  publish: PublishSupport
  /** Why publish is not "supported". Null when it is. */
  publishNote: string | null
  /** Can the ASSET be produced even when publishing cannot happen? Rendering is always allowed —
   *  an unpublishable destination can still be exported for a manual, native upload. */
  renderable: boolean
}

export const DESTINATIONS: Record<SocialDestination, DestinationSpec> = {
  instagram_reel: {
    id: "instagram_reel", label: "Instagram Reel",
    provider: "instagram", surface: "reel",
    safeAreaId: "instagram",
    publish: "supported",
    publishNote: null,
    renderable: true,
  },
  instagram_story: {
    id: "instagram_story", label: "Instagram Story",
    provider: "instagram", surface: "story",
    // DIFFERENT GEOMETRY from the Reel, which is the whole reason this is its own destination.
    // Stories have no right-hand engagement rail, so the box is wider; but they do have a profile
    // header and a reply bar, so it is shorter. Sharing the Reel asset would put the headline
    // under the "Send message" bar.
    safeAreaId: "instagram_story",
    // Official Graph API: a STORIES container (media_type=STORIES) published through the same
    // /media + /media_publish pair a Reel uses, on the same IG Business account and token.
    publish: "supported",
    publishNote: null,
    renderable: true,
  },
  tiktok_video: {
    id: "tiktok_video", label: "TikTok Video",
    provider: "tiktok", surface: "video",
    safeAreaId: "tiktok",
    // The Content Posting API genuinely supports this. We are not cleared to call it yet — the app
    // is unaudited and restricted to self-posting, so the publisher stays off until approval.
    publish: "awaiting_approval",
    publishNote: "TikTok Content Posting API supports this surface; our app audit is incomplete, so automated publishing stays disabled.",
    renderable: true,
  },
  tiktok_story: {
    id: "tiktok_story", label: "TikTok Story",
    provider: "tiktok", surface: "story",
    // Same chrome as a TikTok video for our purposes until measured; the geometry is not the
    // blocker here, publishing is.
    safeAreaId: "tiktok",
    // NOT a waiting problem, and this was CHECKED rather than assumed. TikTok's Content Posting
    // API reference (developers.tiktok.com/doc/content-posting-api-reference-direct-post, read
    // 2026-10-08) documents video and photo publishing only: no Stories endpoint, no story
    // post_mode, no story media_type, no story privacy_level. No approval unlocks this, so the
    // only ways to "support" it would be browser automation or an undocumented endpoint, and
    // neither is something to build.
    publish: "unsupported_by_provider",
    publishNote: "TikTok's Content Posting API documents video and photo publishing only — no Story endpoint exists (verified against the official reference, 2026-10-08). The asset can still be rendered and exported for a manual upload in the TikTok app.",
    renderable: true,
  },
}

export const destinationSpec = (d: SocialDestination): DestinationSpec => DESTINATIONS[d]

/** Destinations belonging to one provider — e.g. everything an Instagram account can receive. */
export const destinationsForProvider = (p: SocialProvider): DestinationSpec[] =>
  SOCIAL_DESTINATIONS.map((d) => DESTINATIONS[d]).filter((s) => s.provider === p)

/** Only the destinations we may publish to automatically, right now. */
export const publishableDestinations = (): DestinationSpec[] =>
  SOCIAL_DESTINATIONS.map((d) => DESTINATIONS[d]).filter((s) => s.publish === "supported")

/**
 * Do two destinations produce the SAME frame?
 *
 * Asset sharing is decided by GEOMETRY, never by provider. Two destinations with one safeAreaId
 * are rendered identically, so one MP4 serves both and a second render would be waste. The moment
 * their geometry differs they are separate assets from the same source creative.
 */
export const sharesAssetWith = (a: SocialDestination, b: SocialDestination): boolean =>
  DESTINATIONS[a].safeAreaId === DESTINATIONS[b].safeAreaId

/** The distinct render variants a set of destinations needs — the fan-out, deduplicated. */
export function renderVariantsFor(destinations: readonly SocialDestination[]): { safeAreaId: string; destinations: SocialDestination[] }[] {
  const by = new Map<string, SocialDestination[]>()
  for (const d of destinations) {
    const k = DESTINATIONS[d].safeAreaId
    by.set(k, [...(by.get(k) ?? []), d])
  }
  return [...by.entries()].map(([safeAreaId, ds]) => ({ safeAreaId, destinations: ds }))
}

/** Legacy bridge: a bare `platform` value means that provider's primary video surface. Lets rows
 *  written before destinations existed resolve without a backfill. */
export function destinationFromLegacyPlatform(platform: string | null | undefined): SocialDestination {
  return (platform ?? "").toLowerCase() === "tiktok" ? "tiktok_video" : "instagram_reel"
}

export type { PlatformSafeArea }
