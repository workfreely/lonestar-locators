// Social Autopilot — automatic post preparation (deterministic templates, NO AI yet).
//
// Turns a source video's INTERNAL social_content metadata into PUBLIC-safe suggested copy:
// overlay headline/subheadline, an Instagram caption, and hashtags. The operator reviews and
// edits everything before rendering. PRIVACY: only public-appropriate fields are used
// (property, market, special, budget/price, amenities). Internal-only fields (notes, place
// id, original filename) are NEVER emitted into public copy.

import { buildHashtags } from "@/lib/social/hashtags"
import { normalizeSocialMarket } from "@/lib/social/markets"
import { propertyNoun } from "@/lib/social/propertyTypes"

export type SourceMeta = {
  propertyName?: string | null
  market?: string | null
  propertyType?: string | null
  special?: string | null
  budgetRange?: string | null
  amenities?: string | null
  // notes / placeId / originalFilename are intentionally NOT accepted — internal only.
}


export type PreparedPost = {
  overlayHeadline: string
  overlaySubheadline: string
  caption: string
  hashtags: string[]
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()

/** Headline = the property name (falls back to the market, then a generic hook). Uppercased
 *  for the bold display overlay. */
export function buildOverlayHeadline(src: SourceMeta): string {
  const prop = clean(src.propertyName)
  const market = clean(normalizeSocialMarket(src.market))
  return (prop || market || "New Listing").toUpperCase().slice(0, 40)
}

/** Subheadline = the current special if present, else the market, else empty (only when it
 *  actually adds public value). */
export function buildOverlaySubheadline(src: SourceMeta): string {
  const special = clean(src.special)
  const market = clean(normalizeSocialMarket(src.market))
  if (special) return special.slice(0, 60)
  if (market && clean(src.propertyName)) return market.slice(0, 60) // property is the headline, market fits as sub
  return ""
}

/** Public Instagram caption from public-safe fields only. */
export function buildCaption(src: SourceMeta): string {
  const prop = clean(src.propertyName)
  const market = clean(normalizeSocialMarket(src.market))
  const special = clean(src.special)
  const budget = clean(src.budgetRange)
  const amenities = clean(src.amenities)

  const noun = propertyNoun(src.propertyType) // townhome | apartment | home | …

  const lines: string[] = []
  // Lead line: property + market.
  if (prop && market) lines.push(`${prop} — ${market}`)
  else if (prop) lines.push(prop)
  else if (market) lines.push(`Now leasing in ${market}`)
  else lines.push(`New ${noun} tour`)

  if (special) lines.push(`✨ ${special}`)
  if (budget) lines.push(`💰 ${budget}`)
  if (amenities) lines.push(`Amenities: ${amenities}`)

  lines.push("DM me to schedule a tour — free locating, no cost to you. 🔑")
  return lines.join("\n").slice(0, 1800)
}

/** Prepare all suggested fields at once. */
export function preparePost(src: SourceMeta): PreparedPost {
  return {
    overlayHeadline: buildOverlayHeadline(src),
    overlaySubheadline: buildOverlaySubheadline(src),
    caption: buildCaption(src),
    hashtags: buildHashtags(src.market, 8, src.propertyType),
  }
}

/** Combine the approved caption + hashtags into the final publish text (composer keeps them
 *  separate; this is only the eventual outgoing payload). */
export function composeFinalCaption(caption: string, hashtags: string[]): string {
  const tags = (hashtags ?? []).filter(Boolean)
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption
}
