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
import { parseAmenities } from "@/lib/social/amenities"
import { normalizeSocialMarket, SOCIAL_MARKETS } from "@/lib/social/markets"
import { propertyNoun, propertyNounPlural, normalizeToCanonical, PROPERTY_TYPES } from "@/lib/social/propertyTypes"

// Instagram's approved cap for a Beast Social caption's hashtag block.
export const MAX_HASHTAGS = 7

export type SourceMeta = {
  market?: string | null
  propertyType?: string | null
  special?: string | null // RAW Current Special (source metadata) — factual, never overwritten
  socialSpecial?: string | null // per-post explicit short-form Social Special; wins over `special`
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

/** Ordered, de-duplicated amenity/feature list from the stored value — via the shared amenity
 *  parser so canonical values, custom values, and legacy comma/newline free-text all resolve
 *  consistently (order preserved; selection order is meaningful downstream). */
function features(amenities: string | null | undefined): string[] {
  return parseAmenities(amenities)
}

// Number words we can safely map for promotional durations (weeks/months free are single/low digit).
const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

/** Concise SOCIAL-DISPLAY version of a Current Special for generated copy. The ORIGINAL Current
 *  Special metadata is NEVER mutated — this only DERIVES a short label. Deterministic (no AI/LLM):
 *  it looks for a promotional DURATION pattern ("[n | number-word] week(s)/month(s) free") anywhere
 *  in the text and returns e.g. "8 Weeks Free" / "1 Month Free". If no such pattern is safely
 *  recognized, it returns the trimmed original UNCHANGED — it never invents or hallucinates a
 *  special, preferring factual correctness over aggressive shortening. */
export function specialDisplay(raw: string | null | undefined): string {
  const s = clean(raw)
  if (!s) return ""
  const numToken = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)"
  const m = s.match(new RegExp(`\\b${numToken}\\s+(weeks?|months?)\\s+free\\b`, "i"))
  if (m) {
    const token = m[1].toLowerCase()
    const n = NUM_WORDS[token] ?? parseInt(token, 10)
    if (Number.isFinite(n) && n > 0) {
      const unit = /^month/i.test(m[2]) ? "Month" : "Week"
      return `${n} ${n === 1 ? unit : unit + "s"} Free`
    }
  }
  return s // safe fallback: the factual original, unshortened — never fabricated
}

/** The public-facing special for generated copy, by precedence: an EXPLICIT per-post Social Special
 *  (chosen from the standardized bank / gift-card / custom) wins; otherwise the deterministic
 *  short-form of the RAW Current Special; otherwise "". Never fabricates a promotion. */
export function resolveSocialSpecial(src: SourceMeta): string {
  const explicit = clean(src.socialSpecial)
  return explicit || specialDisplay(src.special)
}

/** Overlay price rule (Template 1): "Starting at {lowest}/mo" derived from the LOWEST valid price
 *  in the Price Range metadata. The full Price Range stays stored internally — this is only overlay
 *  presentation. Handles "$1,495–$2,100" → 1495, "$1,895" → 1895, "$1,200+" → 1200. No valid price
 *  → "" (the overlay omits the line; never fabricates or substitutes another message). */
export function startingPriceLabel(range: string | null | undefined): string {
  const tokens = (range ?? "").match(/\d[\d,]*/g)
  if (!tokens) return ""
  const values = tokens.map((n) => parseInt(n.replace(/,/g, ""), 10)).filter((n) => Number.isFinite(n) && n > 0)
  if (!values.length) return ""
  return `Starting at $${Math.min(...values).toLocaleString("en-US")}/mo`
}

/** Headline = Market + Property Type ("SAN ANTONIO TOWNHOMES"), a generic, public-safe leasing
 *  hook — NEVER the property/building name. Falls back to market alone, then a generic hook. */
export function buildOverlayHeadline(src: SourceMeta): string {
  const market = clean(normalizeSocialMarket(src.market))
  const cleanType = clean(src.propertyType) // trim BEFORE pluralizing (whitespace would drop to "apartments")
  const typePlural = cleanType ? propertyNounPlural(cleanType) : ""
  const text = market && typePlural ? `${market} ${typePlural}` : market ? `${market} ${propertyNounPlural(null)}` : typePlural || "New Listing"
  return text.toUpperCase().slice(0, 40)
}

/** Subheadline (Template 1) = "Starting at {lowest price}/mo" from the Price Range, or "" when no
 *  valid price exists (the overlay simply omits the line — no fabrication, no substitute yet).
 *  NEVER the property name, area, or notes. The current special still appears in the CAPTION's ✨
 *  line — it is intentionally not part of the Template 1 overlay subheadline. */
export function buildOverlaySubheadline(src: SourceMeta): string {
  return startingPriceLabel(src.budgetRange).slice(0, 60)
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
  const special = resolveSocialSpecial(src) // explicit Social Special, else normalized raw special
  const feats = features(src.amenities).slice(0, 3) // max 3, existing stored order, verbatim

  // Readable vertical spacing: each PRESENT section is separated from the next by ONE blank line
  // (sections are joined with "\n\n"). Absent sections produce no blank lines. The amenities section
  // renders as a "🏡 Amenities" heading with one "• " bullet per feature (max 3). The two fixed CTA
  // sentences are their own sections, so a blank line falls between them too. This is the INSTAGRAM
  // CAPTION layout only — on-video overlays use their own compact template formatting.
  //
  // PRICE: the caption does NOT carry a price line — the Starting At price lives in the on-video
  // OVERLAY detail ("Starting at $X/mo"), not the caption. (Approved 2026-09-14.)
  const sections: string[] = []
  const hooks = eligibleHooks(city, canonicalType)
  if (hooks.length) sections.push(hooks[hashSeed(seed) % hooks.length])
  if (special) sections.push(`✨ ${special}`)
  if (feats.length) sections.push(`🏡 Amenities\n${feats.map((f) => `• ${f}`).join("\n")}`)
  sections.push(CTA_LINES[0], CTA_LINES[1])
  return sections.join("\n\n").slice(0, 1800)
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

// ── Overlay Template detail + generated-vs-manual detection (sync engine) ─────────────────────
// The OVERLAY TEMPLATE decides the detail formula; the metadata supplies the values. TEMPLATE 1's
// detail is "Starting at {lowest price}/mo" (or empty). It is DERIVED — never a free-text field —
// so a stale manual value (e.g. "This could be your next home") can never masquerade as it.
export function buildOverlayDetail(src: SourceMeta): string {
  return startingPriceLabel(src.budgetRange)
}

/** Join present overlay-detail parts into ONE line with the canonical centered-dot separator
 *  (" · " — never a comma or pipe). Shared helper for the template-driven detail lines: e.g.
 *  Template 3 uses [special_display, feature]; Template 5 uses [special_display, "Starting at …/mo"].
 *  Empty/whitespace parts are dropped, so special-only / price-only / neither fall out naturally.
 *  (Templates 2–5 are NOT implemented yet; this exists so the shared formatting is correct.) */
export function joinDetailParts(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ")
}

// A field is AUTO-GENERATED (safe to keep in sync with metadata) when it equals what the generator
// WOULD produce for SOME supported market × property type — market-agnostic, so a value left stale
// by a prior market/type change (e.g. "SAN ANTONIO TOWNHOMES" while the market is now Dallas) is
// still recognized as generated and re-synced. Anything that matches no generated form is treated
// as an intentional MANUAL override and preserved. Empty always counts as generated (nothing typed).
const MARKETS_WITH_NULL: (string | null)[] = [...SOCIAL_MARKETS, null]
const TYPES_WITH_NULL: (string | null)[] = [...PROPERTY_TYPES, null]

export function isGeneratedHeadline(text: string | null | undefined): boolean {
  const t = (text ?? "").trim()
  if (!t) return true
  for (const m of MARKETS_WITH_NULL) for (const pt of TYPES_WITH_NULL) {
    if (buildOverlayHeadline({ market: m, propertyType: pt }) === t) return true
  }
  return false
}

/** Compare captions ignoring blank-line spacing: trim each line and drop empty lines. This makes
 *  detection robust to the caption's section spacing (a caption stored in an older, more compressed
 *  format still matches the current generator by content, so it is recognized as generated and
 *  re-synced rather than mistaken for a manual override). */
const captionKey = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n")

/** Caption is generated if it matches buildCaption for SOME market × type, holding the CURRENT
 *  special/price/amenities + the deterministic seed fixed (only the metadata-driven variables vary).
 *  Blank-line spacing is ignored — only the content lines must match. */
export function isGeneratedCaption(text: string | null | undefined, src: SourceMeta, seed?: string | number): boolean {
  const t = captionKey((text ?? "").trim())
  if (!t) return true
  for (const m of MARKETS_WITH_NULL) for (const pt of TYPES_WITH_NULL) {
    if (captionKey(buildCaption({ ...src, market: m, propertyType: pt }, seed)) === t) return true
  }
  return false
}

/** Hashtags are generated if they match buildHashtags for SOME market × type (7-tag cap). */
export function isGeneratedHashtags(tags: string[] | null | undefined, src: SourceMeta): boolean {
  const arr = (tags ?? []).filter(Boolean)
  if (arr.length === 0) return true
  const joined = arr.join(" ")
  for (const m of SOCIAL_MARKETS) for (const pt of TYPES_WITH_NULL) {
    if (buildHashtags(m, MAX_HASHTAGS, pt).join(" ") === joined) return true
  }
  return false
}

/** Combine the approved caption + hashtags into the final publish text (composer keeps them
 *  separate; this is only the eventual outgoing payload). */
export function composeFinalCaption(caption: string, hashtags: string[]): string {
  const tags = (hashtags ?? []).filter(Boolean)
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption
}
