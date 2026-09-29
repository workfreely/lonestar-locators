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

import { buildHashtags, isCanonicalHashtag, MAX_HASHTAGS } from "@/lib/social/hashtags"
import { parseAmenities } from "@/lib/social/amenities"
import { normalizeSocialMarket, SOCIAL_MARKETS } from "@/lib/social/markets"
import { propertyNoun, propertyNounPlural, normalizeToCanonical, PROPERTY_TYPES } from "@/lib/social/propertyTypes"

// Re-exported from lib/social/hashtags, which owns the canonical generation cap (5). Kept as a named
// export here because callers already import it from this module.
export { MAX_HASHTAGS }

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

/** The LOWEST valid price found in the Price Range metadata, or null. Handles "$1,495–$2,100" → 1495,
 *  "$1,895" → 1895, "$1,200+" → 1200. Shared by every overlay/caption helper that needs the price
 *  number so the parsing rule lives in exactly one place. */
function lowestPrice(range: string | null | undefined): number | null {
  const tokens = (range ?? "").match(/\d[\d,]*/g)
  if (!tokens) return null
  const values = tokens.map((n) => parseInt(n.replace(/,/g, ""), 10)).filter((n) => Number.isFinite(n) && n > 0)
  return values.length ? Math.min(...values) : null
}

/** Overlay price rule (Template 1): "Starting at {lowest}/mo" derived from the LOWEST valid price
 *  in the Price Range metadata. The full Price Range stays stored internally — this is only overlay
 *  presentation. No valid price → "" (the overlay omits the line; never fabricates or substitutes
 *  another message). */
// The ONE place the monthly-rent suffix is spelled, so every template that shows generated rent reads
// the same string. DISPLAY ONLY — no stored price value changes. Was "/mo".
export const PER_MONTH_SUFFIX = "/month"

export function startingPriceLabel(range: string | null | undefined): string {
  const n = lowestPrice(range)
  return n === null ? "" : `Starting at $${n.toLocaleString("en-US")}${PER_MONTH_SUFFIX}`
}

/** Just the formatted lowest price ("$1,495", $ + thousands separator, no "Starting at"/"/mo") — for
 *  templates that build their own sentence around the number. No valid price → "" (never a
 *  fabricated $0/placeholder). Same parsing rule as startingPriceLabel (shares lowestPrice). */
export function startingPriceAmount(range: string | null | undefined): string {
  const n = lowestPrice(range)
  return n === null ? "" : `$${n.toLocaleString("en-US")}`
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

/** TEMPLATE-AWARE caption opener — the caption's FIRST LINE only. Everything below it (special,
 *  amenities, and the two fixed CTA sentences) is unchanged and shared by every template.
 *
 *  Returns null when the opener cannot be fully resolved (no market, or no price/type where the line
 *  needs one). The caller then falls back to the original seed-rotated hooks, which carry the same
 *  guarantee — so an unresolved "{Market}" or "$/month" placeholder can never be emitted.
 *
 *  Property-type wording and the price string are NOT re-formatted here: templates 11, 15 and 16 reuse
 *  buildTemplateHeadline verbatim, and the rest reuse propertyNoun / startingPriceAmount +
 *  PER_MONTH_SUFFIX, so there is exactly one casing/pluralization/price formatter in the module. */
export function captionOpener(template: OverlayTemplate, src: SourceMeta): string | null {
  const city = clean(normalizeSocialMarket(src.market))
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null)
  const noun = canonicalType ? propertyNoun(canonicalType) : ""
  const amount = startingPriceAmount(src.budgetRange)
  const price = amount ? `${amount}${PER_MONTH_SUFFIX}` : ""
  const moving = city ? `Moving to ${city}? ` : null

  switch (template) {
    case "market_type": return moving && `${moving}Check this out.`
    case "market_type_centered": return moving && `${moving}You need to see this.`
    // Approved wording, kept EXACTLY as it already reads.
    case "your_sign": return moving && `${moving}This is your sign.`
    case "special_feature": return moving && `${moving}This deal is hard to beat.`
    case "next_property": return moving && noun ? `${moving}This could be your next ${noun}.` : null
    case "upgrade": return moving && `${moving}Ready for an upgrade?`
    case "apartment_standards": return moving && `${moving}Your standards just went up.`
    case "pov_upgrade": return moving && `${moving}POV: you upgraded.`
    case "affordable_luxury": return moving && `${moving}Luxury doesn't have to break the budget.`
    case "pov_price": return city && price ? `POV: this is what ${price} gets you in ${city}.` : null
    // Reuses the approved Template 11 property-language logic verbatim ("These apartments just hit
    // different", "High-rises just hit different", …) rather than restating the rule here.
    case "hits_different": return canonicalType ? `${buildTemplateHeadline("hits_different", src)}.` : null
    case "trade_up": return moving && `${moving}It might be time to trade up.`
    case "wanted_luxury": return moving && `${moving}You wanted luxury.`
    case "real_living": return city && noun ? `This is real ${noun} living in ${city}.` : null
    // Identical copy for both, and identical to the template's own headline + a full stop.
    case "what_mo_gets_you":
    case "what_mo_gets_you_top": return city && price ? `${buildTemplateHeadline("what_mo_gets_you", src)}.` : null
  }
  return null
}

/** The caption BODY below the opener — unchanged by the template-aware opener work. Split out so the
 *  legacy-recognition pass can rebuild an older caption with its original rotating hook without
 *  duplicating the section logic. */
function captionSections(src: SourceMeta, opener: string | null): string {
  const special = resolveSocialSpecial(src)
  const feats = features(src.amenities).slice(0, 3)
  const sections: string[] = []
  if (opener) sections.push(opener)
  if (special) sections.push(`✨ ${special}`)
  if (feats.length) sections.push(`🏡 Amenities\n${feats.map((f) => `• ${f}`).join("\n")}`)
  sections.push(CTA_LINES[0], CTA_LINES[1])
  return sections.join("\n\n").slice(0, 1800)
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
export function buildCaption(src: SourceMeta, seed?: string | number, template?: OverlayTemplate | null): string {
  const city = clean(normalizeSocialMarket(src.market))
  // Trim/normalize whitespace on the raw property type BEFORE canonicalization — a padded value
  // ("  Townhome  ") is not a canonical match otherwise and would wrongly drop Hook 4.
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null) // null for missing/non-canonical

  // Readable vertical spacing: each PRESENT section is separated from the next by ONE blank line
  // (sections are joined with "\n\n"). Absent sections produce no blank lines. The amenities section
  // renders as a "🏡 Amenities" heading with one "• " bullet per feature (max 3). The two fixed CTA
  // sentences are their own sections, so a blank line falls between them too.
  //
  // PRICE: the caption does NOT carry a price line — the Starting At price lives in the on-video
  // OVERLAY detail ("Starting at $X/mo"), not the caption. (Approved 2026-09-14.) Templates 10/15/16
  // do put the price in their OPENER, which is a deliberate part of those hooks.
  //
  // OPENER: template-aware (captionOpener). When the chosen template's opener cannot be fully
  // resolved — or no template is supplied — it falls back to the original seed-rotated hooks, so the
  // caption never loses its first line and never emits an unresolved placeholder.
  const opener = (template ? captionOpener(template, src) : null) ?? (() => {
    const hooks = eligibleHooks(city, canonicalType)
    return hooks.length ? hooks[hashSeed(seed) % hooks.length] : null
  })()
  return captionSections(src, opener)
}

/** Prepare all suggested fields at once. `seed` (the source id) makes hook rotation deterministic. */
export function preparePost(src: SourceMeta, seed?: string | number, template?: OverlayTemplate | null): PreparedPost {
  return {
    overlayHeadline: buildOverlayHeadline(src),
    overlaySubheadline: buildOverlaySubheadline(src),
    // No template supplied (Bulk Review has no per-row template yet) ⇒ the original rotating hook.
    caption: buildCaption(src, seed, template),
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
 *  (" · " — never a comma or pipe). Empty/whitespace parts are dropped, so special-only /
 *  price-only / feature-only / neither fall out naturally. */
export function joinDetailParts(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ")
}

// ── Overlay TEMPLATES (per-post choice of the on-video overlay copy) ──────────────────────────
// Eleven templates, four layout arrangements (geometry lives in overlaySpec):
//    1 market_type          — HERO           — {CITY} {TYPE_PLURAL} / "Starting at $X/mo"
//    2 market_type_centered — HERO CENTERED  — SAME as T1 (headline/detail/type/size/shadow), the
//                                              whole group VERTICALLY CENTERED (only positioning differs)
//    3 your_sign            — CENTER HOOK    — "Your sign to get that new {type}" / no detail
//    4 special_feature      — HERO           — {CITY} {TYPE_PLURAL} / "{special} · {feature}"
//    5 next_property        — CENTER HOOK    — "What your next {type} could look like" / no detail
//    6 upgrade              — CENTER HOOK+D  — "What life looks like when you upgrade" / "{special} · Starting at $X/mo"
//    7 apartment_standards  — CENTER HOOK+D  — SAME as Upgrade, headline "Your apartment standards went up" / same detail
//    8 pov_upgrade          — CENTER HOOK    — "POV: You upgraded …" (explicit per-type mapping) / no detail
//    9 affordable_luxury    — CENTER HOOK    — "Luxury doesn't have to be expensive" (fixed) / no detail
//   10 pov_price            — CENTER HOOK+D  — same POV per-type headline / "Starting at $X/mo" (or none)
//   11 hits_different       — CENTER HOOK+D  — "{TYPE} just hits different" / optional price
//   12 trade_up             — CENTER HOOK+D  — "What life looks like when you trade in your apartment for
//                                              a {TYPE}" / optional "Starting at $X/mo"
//   13 wanted_luxury        — CENTER HOOK+D  — "You wanted luxury. You got it." (fixed) / optional price
//   14 real_living          — CENTER HOOK+D  — "This is what real {TYPE} living looks like" / optional price
//                                              ONE line always: the shared conversational floor (34px
//                                              in overlaySpec) lets it shrink rather than strand
//                                              "looks like" on a second line
//   15 what_mo_gets_you     — CENTER HOOK    — "What {$price}/mo gets you in {city}" (Starting At + Market,
//                                              both live) / no detail — same T7 (apartment_standards)
//                                              center-hook typography; empty headline (never fabricated)
//                                              if either value is missing
//   16 what_mo_gets_you_top — CENTER HOOK    — IDENTICAL wording/values to T15, anchored at T1's TOP
//                                              position instead of vertically centered (see
//                                              templateFamily + the topAnchored branch in overlaySpec)
// T11–T14 share one centered treatment (center_hook_detail = the centered composition plus an OPTIONAL
// second line): when Starting At has no valid value the detail is "" and the group collapses to a
// headline-only render. No per-template CSS anywhere. NOTE: these numbers are PICKER POSITIONS, not
// identities — the key strings are what get stored and matched.
// ORDER = the picker's display order and its 1-based numbering ONLY (PostEditor renders `i + 1`).
// The stable identity is the KEY string, which is what a post stores in overlayTemplate and what every
// switch/lookup in this file and overlaySpec matches on — so reordering this array can never make a
// saved post render as a different template. `hits_different` and `what_mo_gets_you` were swapped
// (2026-09-29) purely so the two "$/mo Gets You" templates sit together at 15 and 16.
export const OVERLAY_TEMPLATES = ["market_type", "market_type_centered", "your_sign", "special_feature", "next_property", "upgrade", "apartment_standards", "pov_upgrade", "affordable_luxury", "pov_price", "hits_different", "trade_up", "wanted_luxury", "real_living", "what_mo_gets_you", "what_mo_gets_you_top"] as const
export type OverlayTemplate = (typeof OVERLAY_TEMPLATES)[number]
export const DEFAULT_OVERLAY_TEMPLATE: OverlayTemplate = "market_type"
export const OVERLAY_TEMPLATE_LABEL: Record<OverlayTemplate, string> = {
  market_type: "Market + Type",
  market_type_centered: "Market + Type (Centered)",
  your_sign: "Your Sign",
  special_feature: "Special + Feature",
  next_property: "Next Property",
  upgrade: "Upgrade",
  apartment_standards: "Your Apartment Standards",
  pov_upgrade: "POV Upgrade",
  affordable_luxury: "Affordable Luxury",
  pov_price: "POV + Price",
  what_mo_gets_you: "What $/mo Gets You",
  trade_up: "Trade Up",
  wanted_luxury: "You Wanted Luxury",
  real_living: "Real [Property Type] Living",
  hits_different: "Hits Different",
  what_mo_gets_you_top: "What $/mo Gets You — Top",
}

// Template 6 (POV Upgrade) — EXPLICIT deterministic copy per canonical Property Type. The grammar
// intentionally differs by type (NOT a generic "POV: You upgraded to a {type}" formula). When no
// property type is set, a neutral fallback is used.
const POV_UPGRADE_HEADLINE: Record<string, string> = {
  Studio: "POV: You upgraded your studio",
  Apartment: "POV: You upgraded your apartment",
  "High-Rise": "POV: You upgraded to high-rise living",
  Townhome: "POV: You upgraded to a townhome",
  "Rental Home": "POV: You upgraded to a rental home",
  Penthouse: "POV: You upgraded to a penthouse",
  Loft: "POV: You upgraded to a loft",
}
const POV_UPGRADE_FALLBACK = "POV: You upgraded"
// Template 7 (Affordable Luxury) — FIXED universal hook, no variables.
const AFFORDABLE_LUXURY_HEADLINE = "Luxury doesn't have to be expensive"
// Template 13 (You Wanted Luxury) — FIXED universal hook, no variables.
const WANTED_LUXURY_HEADLINE = "You wanted luxury. You got it."

/** "a" / "an" for a canonical property type ("an Apartment", "a Townhome"). Grammar only — NOT a
 *  second property-type mapping; the type itself still comes from normalizeToCanonical. */
function indefiniteArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

/** Display-cased PLURAL of a canonical Property Type, for Template 15's generated copy only
 *  ("High-Rise" → "High-Rises", "Rental Home" → "Rental Homes"). The pluralization itself comes from
 *  the SHARED propertyNounPlural map — the same explicit per-type mapping Template 1 uses, so there is
 *  no second mapping and no blind "+s" — and this only restores the title casing that helper's
 *  lowercase output drops. DISPLAY ONLY: the stored/selected Property Type stays singular everywhere. */
/** Template 11 only: the two GENERIC categories whose bare plural would read as a claim about the
 *  whole market rather than about this video, so they take "These {plural}" instead. */
const THESE_PLURAL_TYPES: ReadonlySet<string> = new Set(["Apartment", "Studio"])

function propertyTypePluralDisplay(canonicalType: string): string {
  // SENTENCE case for EVERY type, not title case: this is a sentence subject, not the dropdown label,
  // so only the first letter is capitalized — "High-rises just hit different", "Rental homes just hit
  // different", "Split-level penthouses just hit different". (Compound types were sentence-cased
  // first; this extends the same rule to the plain types for consistency.)
  const plural = propertyNounPlural(canonicalType)
  return plural.charAt(0).toUpperCase() + plural.slice(1).toLowerCase()
}
export function isOverlayTemplate(v: unknown): v is OverlayTemplate {
  return typeof v === "string" && (OVERLAY_TEMPLATES as readonly string[]).includes(v)
}

/** The FIRST selected amenity (the primary feature), used by Template 3's detail. */
function firstFeature(amenities: string | null | undefined): string {
  return features(amenities)[0] ?? ""
}

/** HERO headlines (T1/T3) are UPPERCASE {city} {type_plural}; CENTER-HOOK headlines (T2/T4/T5) are
 *  natural sentence-case hooks. Never the property name/area/notes — public-safe fields only. */
export function buildTemplateHeadline(template: OverlayTemplate, src: SourceMeta): string {
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null)
  const noun = canonicalType ? propertyNoun(canonicalType) : "" // "high-rise" | "townhome" | …
  switch (template) {
    case "market_type":
    case "market_type_centered": // same Market + Type headline as T1; only the layout is centered
    case "special_feature":
      return buildOverlayHeadline(src) // "SAN ANTONIO HIGH-RISES" (or market/generic fallback)
    case "your_sign":
      // Property Type ONLY (Market removed) — shorter copy renders larger via fit-to-width. "new"
      // reads as an upgrade rather than a specific listing; `noun` is already lowercase for every
      // type, including the compounds ("new split-level loft").
      return noun ? `Your sign to get that new ${noun}` : "This is your sign"
    case "next_property":
      return `What your next ${noun || "home"} could look like`
    case "upgrade":
      return "What life looks like when you upgrade"
    case "apartment_standards": // Upgrade variant — same center-hook typography, fixed headline
      return "Your apartment standards went up"
    case "pov_upgrade":
    case "pov_price":
      return (canonicalType && POV_UPGRADE_HEADLINE[canonicalType]) || POV_UPGRADE_FALLBACK
    case "affordable_luxury":
      return AFFORDABLE_LUXURY_HEADLINE
    // T16 is the SAME wording/values as T11 — only its vertical anchor differs (overlaySpec), so the
    // two deliberately share one implementation here.
    case "what_mo_gets_you":
    case "what_mo_gets_you_top": {
      // Needs BOTH the price AND the city — unlike every other template's single-variable fallback,
      // there's no sensible generic sentence that keeps this one honest without either value, so
      // (matching startingPriceLabel/buildTemplateDetail's "no valid input -> ''" rule, applied here
      // for the same reason: never fabricate) this is the one headline that can be empty.
      const city = clean(normalizeSocialMarket(src.market))
      const amount = startingPriceAmount(src.budgetRange)
      return city && amount ? `What ${amount}${PER_MONTH_SUFFIX} gets you in ${city}` : ""
    }
    case "trade_up": {
      // Canonical display type ("Townhome", "High-Rise"); no type → the same generic "home" fallback
      // Template 5 uses, never "undefined"/"null".
      const subject = canonicalType ?? "home"
      // Lowercased for DISPLAY, same reasoning as T14: the type sits inside a sentence here, so title
      // case reads as a label rather than prose. The canonical Property Type value is untouched, and
      // indefiniteArticle() is case-insensitive so "a"/"an" is unaffected ("an Apartment" → "an
      // apartment"). This block is uppercase:false, so the lowercase reaches preview and render alike.
      return `What life looks like when you trade in your apartment for ${indefiniteArticle(subject)} ${subject.toLowerCase()}`
    }
    case "wanted_luxury":
      return WANTED_LUXURY_HEADLINE
    case "real_living":
      // No type → drop the type word rather than fabricate one.
      // The type is LOWERCASED for display in this template only — it reads as prose here ("…real
      // townhome living…"), not as a label. Display formatting ONLY: the canonical Property Type value
      // is untouched, every other template still renders it in canonical case, and this block is
      // uppercase:false so the lowercase survives to both the preview and the burned-in render.
      return canonicalType ? `This is what real ${canonicalType.toLowerCase()} living looks like` : "This is what real living looks like"
    case "hits_different":
      // PLURAL display copy ("Penthouses just hit different") — display only; the Property Type value
      // itself stays singular. No type → a grammatical generic plural subject, never a fabricated type.
      if (!canonicalType) return "These just hit different"
      // Apartment and Studio are the GENERIC categories, so the bare plural reads like a statement
      // about the whole market ("Apartments just hit different"). Leading with "These" points the
      // sentence back at the video. Every other type is specific enough to carry the bare plural, and
      // is deliberately left alone.
      if (THESE_PLURAL_TYPES.has(canonicalType)) return `These ${propertyNounPlural(canonicalType).toLowerCase()} just hit different`
      return `${propertyTypePluralDisplay(canonicalType)} just hit different`
  }
}

/** Template detail (ONE line, " · "-joined). Derived from metadata per template; empty when the
 *  template has no detail or the needed values are missing (never fabricated). */
export function buildTemplateDetail(template: OverlayTemplate, src: SourceMeta): string {
  const special = resolveSocialSpecial(src)
  const price = startingPriceLabel(src.budgetRange)
  const feature = firstFeature(src.amenities)
  switch (template) {
    case "market_type":
    case "market_type_centered": // same "Starting at $X/mo" detail as T1
    case "pov_price":
    // T12–T15 all take the SAME optional price line: "Starting at $X/mo" when Starting At holds a
    // valid value, "" otherwise — startingPriceLabel already returns "" for missing/invalid input, so
    // the line (and its gap) simply collapses. Never "Starting at", "$0", undefined, null or a blank
    // second line.
    case "trade_up":
    case "wanted_luxury":
    case "real_living":
    case "hits_different":
      return price // "Starting at $X/mo" or "" (T8 shows the POV headline + this price line)
    case "your_sign":
    case "next_property":
    case "pov_upgrade":
    case "affordable_luxury":
    case "what_mo_gets_you": // the price+city sentence is the whole headline — no separate detail
    case "what_mo_gets_you_top": // T16 = T11's copy, top-anchored; same "no detail"
      return "" // center-hook, no detail
    case "special_feature":
      return joinDetailParts([special, feature]) // special+feature / special / feature / none
    case "upgrade":
    case "apartment_standards": // same shared special+price detail as Upgrade
      return joinDetailParts([special, price]) // special+price / special / price / none
  }
}

// ── Overlay-preview staleness (Post Editor) ──────────────────────────────────────────────────
// A previously RENDERED post's burned-in MP4 only reflects whatever mode/template/headline were
// current the last time it was rendered. Once the editor changes any of those, that MP4 no longer
// represents the current configuration, so the editor should fall back to its live CSS overlay
// preview instead of misleadingly presenting stale burned-in text as current. Pure/exported so the
// exact rule is unit-testable without React.
export type OverlayPreviewBaseline = { mode: "generate" | "existing"; template: OverlayTemplate; headline: string }

export function isOverlayPreviewStale(baseline: OverlayPreviewBaseline | null, current: OverlayPreviewBaseline): boolean {
  if (!baseline) return false // nothing loaded yet to compare against — never stale by default
  return current.mode !== baseline.mode || current.template !== baseline.template || current.headline !== baseline.headline
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
  // what_mo_gets_you embeds a live, user-edited PRICE (arbitrary digits, not a small enum like
  // market/type) that the sweep below can't enumerate — it always calls buildTemplateHeadline
  // without a budgetRange, so that template's own contribution to the sweep is always "". Recognize
  // its exact shape for any REAL market instead, regardless of the specific price, so a value this
  // template just generated is never mistaken for a manual override after a reload.
  // Accepts the CURRENT "/month" and the legacy "/mo": a headline generated before the suffix changed
  // must stay generator-owned, or it would be frozen as a "manual override" and never re-sync.
  const whatMo = t.match(/^What \$[\d,]+\/(?:month|mo) gets you in (.+)$/)
  if (whatMo && SOCIAL_MARKETS.includes(whatMo[1])) return true
  // Recognize a headline as generator-owned if it equals what ANY template would produce for SOME
  // market × property type. This covers the Hero forms AND every center-hook form (incl. Template 6's
  // per-type POV strings and Template 7's fixed hook), so a value left stale by a prior market/type
  // change is re-synced rather than mistaken for a manual override. (Headlines depend only on
  // market/type — never special/price/amenities — so those can stay unset here.)
  for (const m of MARKETS_WITH_NULL) for (const pt of TYPES_WITH_NULL) {
    if (buildOverlayHeadline({ market: m, propertyType: pt }) === t) return true
    for (const tpl of OVERLAY_TEMPLATES) {
      if (buildTemplateHeadline(tpl, { market: m, propertyType: pt }) === t) return true
    }
  }
  // LEGACY generated forms, kept recognized for exactly the reason the legacy "/mo" is above: a
  // headline produced before a COPY change must stay generator-owned, or an existing draft would be
  // frozen as a "manual override" and would never re-sync when its Property Type changes.
  //   • your_sign before "new" was added:        "Your sign to get that {noun}"
  //   • hits_different before sentence casing:   "{Title Cased Plural} just hit different"
  const legacySign = t.match(/^Your sign to get that (.+)$/)
  const legacyHit = t.match(/^(.+) just hit different$/)
  for (const pt of TYPES_WITH_NULL) {
    if (legacySign && propertyNoun(pt) === legacySign[1]) return true
    if (legacyHit && pt && propertyNounPlural(pt).replace(/(^|[\s-])([a-z])/g, (_x, sep: string, ch: string) => sep + ch.toUpperCase()) === legacyHit[1]) return true
  }
  return false
}

/** Compare captions ignoring PRESENTATION-only differences so a caption generated by an OLDER
 *  engine is still recognized as generator-owned (and thus re-synced / republished in the current
 *  canonical format) rather than mistaken for a manual override. Normalizes two things:
 *   1) blank-line spacing — trim each line, drop empties.
 *   2) the AMENITIES section shape — the current engine renders "🏡 Amenities" + one "• item"
 *      line per feature, while the older engine rendered a single inline "🏡 a, b, c" line. Both
 *      are collapsed to the canonical single line "🏡 a, b, c" so they compare equal. Without this
 *      an inline-amenity caption never matches the bulleted generator output and is frozen as
 *      "manual" forever (the bug that let a stale caption publish). */
const captionKey = (s: string) => {
  const lines = s.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^🏡\s*Amenities\s*$/i.test(l)) {
      // Collapse the "🏡 Amenities" heading + following "• item" bullet lines into one inline line.
      const items: string[] = []
      let j = i + 1
      while (j < lines.length && /^•\s*/.test(lines[j])) {
        items.push(lines[j].replace(/^•\s*/, "").trim())
        j++
      }
      out.push(`🏡 ${items.join(", ")}`)
      i = j - 1
      continue
    }
    out.push(l)
  }
  return out.join("\n")
}

/** Caption is generated if it matches buildCaption for SOME market × type, holding the CURRENT
 *  special/price/amenities + the deterministic seed fixed (only the metadata-driven variables vary).
 *  Blank-line spacing is ignored — only the content lines must match. */
export function isGeneratedCaption(text: string | null | undefined, src: SourceMeta, seed?: string | number): boolean {
  const t = captionKey((text ?? "").trim())
  if (!t) return true
  for (const m of MARKETS_WITH_NULL) for (const pt of TYPES_WITH_NULL) {
    const s2 = { ...src, market: m, propertyType: pt }
    // LEGACY (no template ⇒ the original seed-rotated hook). Kept first and kept forever: a caption
    // written before openers became template-aware must stay generator-owned, or an existing draft
    // would freeze as a "manual override" and never re-sync on a Market/Type change.
    if (captionKey(buildCaption(s2, seed)) === t) return true
    for (const tpl of OVERLAY_TEMPLATES) {
      if (captionKey(buildCaption(s2, seed, tpl)) === t) return true
    }
  }
  return false
}

/** A hashtag set is GENERATOR-OWNED (safe to re-sync when Market/Property Type changes) when it
 *  matches buildHashtags for SOME market × type, OR — to cover re-ordered / OLDER-engine generated
 *  sets — when EVERY tag is a recognized canonical/legacy hashtag. A set containing any tag outside
 *  the canonical vocabulary is treated as a MANUAL override and is preserved (never overwritten). */
export function isGeneratedHashtags(tags: string[] | null | undefined, src: SourceMeta): boolean {
  const arr = (tags ?? []).filter(Boolean)
  if (arr.length === 0) return true
  const joined = arr.join(" ")
  for (const m of SOCIAL_MARKETS) for (const pt of TYPES_WITH_NULL) {
    if (buildHashtags(m, MAX_HASHTAGS, pt).join(" ") === joined) return true
  }
  // Every tag canonical (current bank or legacy) ⇒ generator-owned; any custom tag ⇒ manual.
  return arr.every((t) => isCanonicalHashtag(t))
}

/** The caption body to actually PUBLISH, canonicalized at publish time. If the stored caption is
 *  GENERATOR-OWNED (per isGeneratedCaption, now backward-compatible with older inline-amenity
 *  captions), it is regenerated from the source metadata via buildCaption so it publishes in the
 *  CURRENT canonical format (blank-line sections + "🏡 Amenities" bullets) — even when the row was
 *  saved by an older engine. A genuine MANUAL caption (not generator-owned) is returned verbatim.
 *  Pure: no DB, no mutation of the stored row — existing unpublished posts benefit automatically at
 *  publish without any migration. Callers still append hashtags via composeFinalCaption. */
export function publishCaption(storedCaption: string | null | undefined, src: SourceMeta, seed?: string | number, template?: OverlayTemplate | null): string {
  const stored = storedCaption ?? ""
  return isGeneratedCaption(stored, src, seed) ? buildCaption(src, seed, template) : stored
}

/** Combine the approved caption + hashtags into the final publish text (composer keeps them
 *  separate; this is only the eventual outgoing payload). */
export function composeFinalCaption(caption: string, hashtags: string[]): string {
  const tags = (hashtags ?? []).filter(Boolean)
  return tags.length ? `${caption}\n\n${tags.join(" ")}` : caption
}

/** THE single source of truth for the EXACT outgoing Instagram caption text (caption body +
 *  hashtag block), built from a post + its source row. Used identically by the real publish path
 *  AND the dry-run preview so the two can never drift: it maps the DB row to SourceMeta,
 *  canonicalizes a generator-owned caption (publishCaption), then appends the hashtags
 *  (composeFinalCaption). Pure — no DB, no side effects, no publishing. */
export function buildInstagramCaptionPayload(input: {
  caption: string | null | undefined
  hashtags: string[] | null | undefined
  socialSpecial: string | null | undefined
  sourceContentId: string | null | undefined
  source: { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null } | null | undefined
}): string {
  const s = input.source ?? null
  const meta: SourceMeta = {
    market: s?.market ?? null,
    propertyType: s?.property_type ?? null,
    special: s?.special ?? null,
    socialSpecial: input.socialSpecial ?? null,
    budgetRange: s?.budget_range ?? null,
    amenities: s?.amenities ?? null,
  }
  return composeFinalCaption(publishCaption(input.caption, meta, input.sourceContentId ?? undefined), (input.hashtags ?? []).filter(Boolean))
}

// TikTok's own product limit. It now COINCIDES with the shared MAX_HASHTAGS (both 5) but stays a
// separate named constant so a future platform-specific change does not silently move the shared rule.
export const TIKTOK_MAX_HASHTAGS = 5

/** THE single source of truth for the EXACT outgoing TikTok caption text. Mirrors the Instagram
 *  payload's CAPTION BODY exactly — same hook / blank line / "🏡 Amenities" bullets / blank line /
 *  service CTA / blank line / form CTA structure, and the same generated-vs-manual semantics
 *  (publishCaption preserves a user-written caption and regenerates a generator-owned one) — but
 *  the hashtags are generated SEPARATELY for TikTok (buildHashtags) and capped at
 *  TIKTOK_MAX_HASHTAGS (5), independent of the stored Instagram set. Pure. */
export function buildTikTokCaptionPayload(input: {
  caption: string | null | undefined
  socialSpecial: string | null | undefined
  sourceContentId: string | null | undefined
  source: { market: string | null; property_type: string | null; special: string | null; budget_range: string | null; amenities: string | null } | null | undefined
}): string {
  const s = input.source ?? null
  const meta: SourceMeta = {
    market: s?.market ?? null,
    propertyType: s?.property_type ?? null,
    special: s?.special ?? null,
    socialSpecial: input.socialSpecial ?? null,
    budgetRange: s?.budget_range ?? null,
    amenities: s?.amenities ?? null,
  }
  const body = publishCaption(input.caption, meta, input.sourceContentId ?? undefined)
  // TikTok hashtags computed independently from Instagram's, limited to 5.
  const tags = buildHashtags(meta.market, TIKTOK_MAX_HASHTAGS, meta.propertyType)
  return composeFinalCaption(body, tags)
}
