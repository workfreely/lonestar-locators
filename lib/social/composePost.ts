// Social Autopilot — automatic post preparation (deterministic templates, NO AI yet).
//
// Turns a source video's INTERNAL social_content metadata into PUBLIC-safe suggested copy:
// overlay headline/subheadline, an Instagram caption, and hashtags. The operator reviews and
// edits everything before rendering.
//
// PRIVACY — internal/public separation is enforced at the TYPE level. The preparation engine
// only accepts PUBLIC-SAFE facts: Market, Property Type, Current Special, Price Range, and
// Amenities / Features. The internal source references — Property / Building Name, Area /
// Neighborhood, Notes, place_id, display_name, original filename — are intentionally NOT part of
// SourceMeta, so they can never leak into public copy automatically. The operator may still type
// any of those into the editable fields as an explicit creative decision.

import { buildHashtags } from "@/lib/social/hashtags"
import { normalizeSocialMarket } from "@/lib/social/markets"
import { propertyNoun, propertyNounPlural } from "@/lib/social/propertyTypes"

export type SourceMeta = {
  market?: string | null
  propertyType?: string | null
  special?: string | null
  budgetRange?: string | null // "Price Range" in the UI; column stays budget_range
  amenities?: string | null
  // propertyName / areaNeighborhood / notes / placeId / originalFilename are INTERNAL — never
  // accepted here, so the public preparation engine cannot emit them.
}

export type PreparedPost = {
  overlayHeadline: string
  overlaySubheadline: string
  caption: string
  hashtags: string[]
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim()

/** Split an amenities/features string ("private yard, garage, pool") into individual features. */
function features(amenities: string | null | undefined): string[] {
  return clean(amenities)
    .split(/[,;/•|]+|\band\b/i)
    .map((f) => f.trim())
    .filter(Boolean)
}

/** Light pluralize a short feature phrase for a headline ("private yard" → "private yards"). */
function pluralizeFeature(f: string): string {
  const words = f.split(" ")
  const last = words[words.length - 1]
  if (!last) return f
  const lower = last.toLowerCase()
  if (lower.endsWith("s")) return f // already plural / mass noun
  const plural = /[^aeiou]y$/i.test(last) ? last.slice(0, -1) + "ies" : last + "s"
  words[words.length - 1] = plural
  return words.join(" ")
}

/** Headline = Market + Property Type ("SAN ANTONIO TOWNHOMES"), a generic, public-safe leasing
 *  hook — NEVER the property/building name. Falls back to market alone, then a generic hook. */
export function buildOverlayHeadline(src: SourceMeta): string {
  const market = clean(normalizeSocialMarket(src.market))
  const typePlural = src.propertyType ? propertyNounPlural(src.propertyType) : ""
  const text = market && typePlural ? `${market} ${typePlural}` : market ? `${market} ${propertyNounPlural(null)}` : typePlural || "New Listing"
  return text.toUpperCase().slice(0, 40)
}

/** Subheadline = the current special if present, else a short public-safe features hook
 *  ("PRIVATE YARDS + GARAGES"), else the price range, else empty. NEVER the property name, area,
 *  or notes. */
export function buildOverlaySubheadline(src: SourceMeta): string {
  const special = clean(src.special)
  if (special) return special.slice(0, 60)
  const feats = features(src.amenities).slice(0, 2).map(pluralizeFeature)
  if (feats.length) return feats.join(" + ").toUpperCase().slice(0, 60)
  const price = clean(src.budgetRange)
  if (price) return price.slice(0, 60)
  return ""
}

/** Public Instagram caption from PUBLIC-SAFE fields only (market, type, special, price,
 *  amenities). Never emits the property name, area/neighborhood, or notes. */
export function buildCaption(src: SourceMeta): string {
  const market = clean(normalizeSocialMarket(src.market))
  const special = clean(src.special)
  const price = clean(src.budgetRange)
  const amenities = clean(src.amenities)
  const noun = propertyNoun(src.propertyType) // townhome | apartment | home | …
  const typePlural = src.propertyType ? propertyNounPlural(src.propertyType) : ""

  const lines: string[] = []
  // Lead line: market + type — a public leasing hook, not the property identity.
  if (market && typePlural) lines.push(`Now leasing — ${market} ${typePlural}`)
  else if (market) lines.push(`Now leasing in ${market}`)
  else lines.push(`New ${noun} tour`)

  if (special) lines.push(`✨ ${special}`)
  if (price) lines.push(`💰 ${price}`)
  if (amenities) lines.push(`Features: ${amenities}`)

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
