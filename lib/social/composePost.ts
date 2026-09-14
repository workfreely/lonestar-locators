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
import { propertyNoun, propertyNounPlural, normalizeToCanonical } from "@/lib/social/propertyTypes"

// Instagram's approved cap for a Beast Social caption's hashtag block.
export const MAX_HASHTAGS = 7

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

// ── APPROVED caption template system ─────────────────────────────────────────────────────────
// The fixed CTA every caption ends with (two lines, no emoji — never rotated).
const CTA_LINES = [
  "My apartment locating service is completely free!",
  "Submit the form to get your free custom apartment list.",
] as const

// Deterministic, stable string hash (FNV-1a, 32-bit unsigned) used ONLY to pick a hook. Same seed
// (a source video's id) → same hook across renders/deploys; different sources rotate. NO AI, no RNG.
function hashSeed(seed: string | number | undefined): number {
  const s = String(seed ?? "")
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** The 4 APPROVED rotating opening hooks, in fixed order. Hooks 1–3 require {city}; Hook 4
 *  requires a canonical {property_type}. Only fully-resolvable hooks are eligible, so an
 *  unresolved {city}/{property_type} placeholder can never be emitted. Verbatim wording. */
function eligibleHooks(city: string, canonicalType: string | null): string[] {
  const noun = canonicalType ? propertyNoun(canonicalType) : "" // apartment | studio | high-rise | townhome | rental home | penthouse
  const hooks: { text: string; ok: boolean }[] = [
    { text: `Moving to ${city}? This is your sign.`, ok: !!city },
    { text: `This is your sign to move to ${city}.`, ok: !!city },
    { text: `Moving to ${city}? You need to see this one.`, ok: !!city },
    { text: `Need a new ${noun}?`, ok: !!canonicalType },
  ]
  return hooks.filter((h) => h.ok).map((h) => h.text)
}

/** Public Instagram caption in the APPROVED format:
 *    {rotating hook}
 *    ✨ {current special}      — only if present
 *    🏡 {up to 3 amenities}    — only if present
 *    💰 {price range}          — only if present
 *    My apartment locating service is completely free!
 *    Submit the form to get your free custom apartment list.
 *  Built from PUBLIC-SAFE fields only (market, type, special, price, amenities). NEVER the property
 *  name, area/neighborhood, notes, place_id, or any internal/source-only metadata. Hashtags are
 *  handled separately and merged at publish (composeFinalCaption). `seed` is the source id, so a
 *  given source video deterministically gets the same eligible hook. */
export function buildCaption(src: SourceMeta, seed?: string | number): string {
  const city = clean(normalizeSocialMarket(src.market))
  // Trim/normalize whitespace on the raw property type BEFORE canonicalization — a padded value
  // ("  Townhome  ") is not a canonical match otherwise and would wrongly drop Hook 4.
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null) // null for missing/non-canonical
  const special = clean(src.special)
  const price = clean(src.budgetRange)
  const feats = features(src.amenities).slice(0, 3) // max 3, existing stored order, verbatim

  const lines: string[] = []
  const hooks = eligibleHooks(city, canonicalType)
  if (hooks.length) lines.push(hooks[hashSeed(seed) % hooks.length])
  if (special) lines.push(`✨ ${special}`)
  if (feats.length) lines.push(`🏡 ${feats.join(", ")}`)
  if (price) lines.push(`💰 ${price}`)
  lines.push(...CTA_LINES)
  return lines.join("\n").slice(0, 1800)
}

/** Prepare all suggested fields at once. `seed` (the source id) makes hook rotation deterministic. */
export function preparePost(src: SourceMeta, seed?: string | number): PreparedPost {
  return {
    overlayHeadline: buildOverlayHeadline(src),
    overlaySubheadline: buildOverlaySubheadline(src),
    caption: buildCaption(src, seed),
    hashtags: buildHashtags(src.market, MAX_HASHTAGS, src.propertyType),
  }
}

/** Combine the approved caption + hashtags into the final publish text (composer keeps them
 *  separate; this is only the eventual outgoing payload). */
export function composeFinalCaption(caption: string, hashtags: string[]): string {
  const tags = (hashtags ?? []).filter(Boolean)
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption
}
