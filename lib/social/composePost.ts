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

import { buildHashtags, isCanonicalHashtag, MAX_HASHTAGS, PLATFORM_HASHTAG_LIMIT } from "@/lib/social/hashtags"
import { parseAmenities, amenityEquivalenceKey, amenityImpliedBySelection } from "@/lib/social/amenities"
import { normalizeSocialMarket, SOCIAL_MARKETS } from "@/lib/social/markets"
import { propertyNoun, propertyNounPlural, normalizeToCanonical, PROPERTY_TYPES, COMPOUND_TYPE_QUALIFIERS, SOCIAL_CANONICAL_ORDER } from "@/lib/social/propertyTypes"

// Re-exported from lib/social/hashtags, which owns the canonical generation cap (5). Kept as a named
// export here because callers already import it from this module.
export { MAX_HASHTAGS }

export type SourceMeta = {
  market?: string | null
  propertyType?: string | null
  special?: string | null // RAW Current Special (source metadata) — factual, never overwritten
  socialSpecial?: string | null // per-post explicit short-form Social Special; wins over `special`
  budgetRange?: string | null // "Starting At" in the UI; column stays budget_range
  // What the price MEANS for this footage. Per-SOURCE, not per-post: "the exact unit
  // shown" describes the video itself, and stays true of every post made from it.
  // Undefined/null is "starting_at", so existing content keeps today's wording with
  // no backfill.
  priceLabelMode?: PriceLabelMode | null
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

/**
 * Drop a "{QUALIFIER} Layout" amenity when the property TYPE already carries that qualifier.
 *
 * Caption only. The amenity is not deselected, not rewritten and not removed from storage — a
 * Split-Level Loft really does have a split-level layout, and research should say so. This just
 * stops the public caption asserting it a second time, immediately under an overlay that already
 * says "Split-Level Loft".
 *
 * Comparison is by amenity EQUIVALENCE key, so "Split Level" and "Split-Level Layout" are both
 * caught. Anything that is not a redundant layout chip passes through untouched, in order.
 */
export function withoutRedundantLayout(list: readonly string[], propertyType: string | null | undefined): string[] {
  const type = (propertyType ?? "").trim()
  if (!type) return [...list]
  const qualifier = COMPOUND_TYPE_QUALIFIERS.find((q) => type.startsWith(`${q} `))
  if (!qualifier) return [...list]
  const redundant = amenityEquivalenceKey(`${qualifier} Layout`)
  return list.filter((a) => amenityEquivalenceKey(a) !== redundant)
}

/**
 * Withhold a feature from the caption when a STRONGER selected feature already entails it.
 *
 * "Tri-Level Layout" and "Multi-Level Layout" are both true of the same unit, and both are worth
 * recording — but a caption that bullets each one states the layout twice, the weaker time with
 * less information. So the entailed claim is dropped from the public copy and nothing else.
 *
 * NOT a deselection and NOT a storage change: the chips stay as the operator set them, and research
 * keeps both with their own applicability. Order of survivors is preserved.
 */
export function withoutImpliedFeatures(list: readonly string[], propertyType?: string | null): string[] {
  // THE PROPERTY TYPE IS PART OF THE CLAIM SET, not separate from it. A "Split-Level Loft" asserts
  // a split-level layout in its type — and therefore in the overlay headline — so it entails
  // multi-level just as a Split-Level CHIP would. Without this the caption still said the layout
  // twice: once in the type, once as a "Multi-Level Layout" bullet.
  const type = (propertyType ?? "").trim()
  const qualifier = type ? COMPOUND_TYPE_QUALIFIERS.find((q) => type.startsWith(`${q} `)) : undefined
  const claims = qualifier ? [...list, `${qualifier} Layout`] : list
  return list.filter((a) => !amenityImpliedBySelection(a, claims))
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

/** Rents at or above this compact to "K". Below it, full digits stay clearer. */
export const COMPACT_PRICE_MIN = 7000

/**
 * Display form of a whole-dollar rent. Compact only at/above COMPACT_PRICE_MIN AND
 * only when the value is exact to one decimal place — i.e. a multiple of 100:
 *
 *    7000 → $7K        7100 → $7.1K      12500 → $12.5K     20000 → $20K
 *    7250 → $7,250     7123 → $7,123                        6950  → $6,950
 *
 * NEVER ROUNDS. $7,250 would be $7.3K at one decimal and $7.25K at two — the first
 * misstates the rent, the second reads like a typo — so a value that cannot be said
 * exactly in one decimal keeps its full digits instead.
 *
 * The arithmetic is integer-only (whole thousands + tenths) rather than n/1000, so
 * no float formatting can introduce a stray decimal.
 *
 * DISPLAY ONLY. social_content.budget_range keeps whatever was typed; nothing here
 * parses, rewrites or stores a price.
 */
function formatPriceDisplay(n: number): string {
  if (n >= COMPACT_PRICE_MIN && n % 100 === 0) {
    const whole = Math.floor(n / 1000)
    const tenths = (n % 1000) / 100 // integer 0–9, because n is a multiple of 100
    return tenths === 0 ? `$${whole}K` : `$${whole}.${tenths}K`
  }
  return `$${n.toLocaleString("en-US")}`
}

/** How the price is introduced. Per-SOURCE; null/absent reads as "starting_at". */
export type PriceLabelMode = "starting_at" | "exact_unit"
export const PRICE_LABEL_MODES: readonly PriceLabelMode[] = ["starting_at", "exact_unit"] as const
const PRICE_LABEL_PREFIX: Record<PriceLabelMode, string> = {
  starting_at: "Starting at",
  exact_unit: "Exact unit shown:",
}
/** Narrow an unknown/stored value to a mode; anything else is "starting_at". */
export function priceLabelMode(v: unknown): PriceLabelMode {
  return v === "exact_unit" ? "exact_unit" : "starting_at"
}

export function startingPriceLabel(range: string | null | undefined, mode?: PriceLabelMode | null): string {
  const n = lowestPrice(range)
  if (n === null) return ""
  return `${PRICE_LABEL_PREFIX[priceLabelMode(mode)]} ${formatPriceDisplay(n)}${PER_MONTH_SUFFIX}`
}

/** Just the formatted lowest price ("$1,495", $ + thousands separator, no "Starting at"/"/mo") — for
 *  templates that build their own sentence around the number. No valid price → "" (never a
 *  fabricated $0/placeholder). Same parsing rule as startingPriceLabel (shares lowestPrice). */
export function startingPriceAmount(range: string | null | undefined): string {
  const n = lowestPrice(range)
  // Shares formatPriceDisplay so "What $7.5K/month gets you in Dallas" and
  // "Starting at $7.5K/month" can never disagree about the same number. The LABEL
  // mode deliberately does not apply here: these callers compose their own sentence.
  return n === null ? "" : formatPriceDisplay(n)
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
  return startingPriceLabel(src.budgetRange, src.priceLabelMode).slice(0, 60)
}

// ── APPROVED caption template system ─────────────────────────────────────────────────────────
// Every caption ends with the service line, a blank line, then ONE call to action.
const SERVICE_LINE = "My apartment locating service is completely free!"

// The ORIGINAL closing line. Superseded by the comment CTA below and never generated any more, but
// kept forever for RECOGNITION: isGeneratedCaption compares a stored caption against what the
// generator would produce, so without this every caption written before the comment CTA would stop
// matching, freeze as a "manual override" and never re-sync on a Market/Type change. Same rule the
// legacy "/mo" headline and superseded openers already follow in this file.
const LEGACY_FORM_CTA = "Submit the form to get your free custom apartment list."

// ── COMMENT CTA ──────────────────────────────────────────────────────────────────────────────
// Organic posts drive leads through automated DMs, so the closing line asks for a comment keyword.
// The keyword is DERIVED from the already-selected Property Type — no new field, no new state.
//
// Compound Social-only types reduce to their HEAD NOUN ("Split-Level Townhome" -> Townhome -> TOWN),
// which is the same rule hashtag ranking already applies, so the two stay consistent by construction
// rather than by a second hand-maintained list.
const COMMENT_KEYWORDS: Record<string, string> = {
  Studio: "LIST",
  Apartment: "LIST",
  Townhome: "TOWN",
  Loft: "LOFT",
  "High-Rise": "RISE",
  "Rental Home": "HOME",
  Penthouse: "KEY",
}

/**
 * "a townhome" / "an apartment". Chosen by the SOUND of the opening letter, not a vowel test:
 * every canonical and compound noun is checked against this list, and "high-rise" is the one that
 * would trip a naive rule (it takes "a", despite starting with a consonant that often precedes
 * "an" in careless copy).
 */
export function withArticle(noun: string): string {
  const n = noun.trim()
  if (!n) return ""
  return `${/^[aeiou]/i.test(n) ? "an" : "a"} ${n}`
}

/** The comment keyword for a Property Type. Unknown, absent or unmapped -> "LIST". */
export function commentCtaKeyword(propertyType: string | null | undefined): string {
  const raw = (propertyType ?? "").trim()
  // "Home" is accepted as a synonym of the canonical "Rental Home" so a non-canonical stored value
  // still resolves rather than silently falling back to LIST.
  if (/^home$/i.test(raw)) return "HOME"
  const canonical = normalizeToCanonical(raw) ?? raw
  const qualifier = COMPOUND_TYPE_QUALIFIERS.find((q) => canonical.startsWith(`${q} `))
  const head = qualifier ? canonical.slice(qualifier.length + 1) : canonical
  return COMMENT_KEYWORDS[head] ?? "LIST"
}

/** The closing CTA line for a Property Type. */
export function commentCta(propertyType: string | null | undefined): string {
  return `✅ Comment "${commentCtaKeyword(propertyType)}" and I’ll send you the best options within your budget.`
}

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

/** The three values every opener is built from, resolved ONCE through the canonical helpers:
 *  the selected Social Beast market, the natural lowercase singular property noun, and the
 *  "$X/month" price. No opener re-formats any of these itself. */
function openerParts(src: SourceMeta): { city: string; noun: string; price: string } {
  const city = clean(normalizeSocialMarket(src.market))
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null)
  const amount = startingPriceAmount(src.budgetRange)
  return { city, noun: canonicalType ? propertyNoun(canonicalType) : "", price: amount ? `${amount}${PER_MONTH_SUFFIX}` : "" }
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
  const { city, noun, price } = openerParts(src)
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null)
  const moving = city ? `Moving to ${city}? ` : null

  switch (template) {
    case "market_type": return moving && `${moving}I got you.`
    case "market_type_centered": return moving && `${moving}You need to see this.`
    case "your_sign": return moving && `${moving}This is your sign.`
    case "special_feature": return moving && `${moving}This won't last long.`
    case "next_property": return moving && `${moving}This could be home.`
    case "upgrade": return moving && `${moving}Ready for an upgrade?`
    // No market prefix — this one stands on its own, so it resolves even with no metadata at all.
    case "apartment_standards": return "Your standards just went up."
    // Needs only the TYPE (natural lowercase singular), not the market.
    case "pov_upgrade": return noun ? `POV: you upgraded your ${noun}.` : null
    case "affordable_luxury": return moving && `${moving}Luxury without breaking the bank.`
    case "pov_price": return city && price ? `POV: ${price} in ${city}.` : null
    // Reuses the approved Template 11 phrase generator verbatim ("These apartments just hit
    // different", "High-rises just hit different", …) rather than restating the rule here.
    case "hits_different": return canonicalType ? `${buildTemplateHeadline("hits_different", src)}.` : null
    case "trade_up": return moving && `${moving}It's time to trade up.`
    // Mirrors the on-video sentence rather than inventing a second voice for the same template.
    case "property_tour": return noun ? `Come tour this ${noun} with me.` : moving && `${moving}Come tour this one with me.`
    case "wanted_luxury": return moving && `${moving}You wanted luxury.`
    // T18. Mirrors the on-video question with the same price, and drops the figure the same way
    // the headline does when there is none — the two must never disagree about whether a price
    // exists, let alone about what it is.
    case "would_you_live_here":
      // The caption asks about the PRICE ("would you pay"); the on-video headline asks about the
      // place ("would you live here for $X/month"). Deliberately different questions — the caption
      // is not a transcript of the overlay. The no-price fallback is unchanged.
      return price ? `Be honest… would you pay ${price}? 👀` : "Be honest… would you live here? 👀"
    // T19. Metadata-free, like its headline, so it resolves for any walkthrough.
    case "imagine_coming_home": return "Imagine calling this place home. 🏡✨"
    // T20. The caption states the PROMISE rather than repeating the dialogue — the joke is the
    // video's; the caption is the offer.
    case "client_me": return "You tell me what you’re looking for. I’ll find it. 😎"
    // ── T25-T31 — the approved opening lines, verbatim ──────────────────────────────────────
    // Each is the FIRST line of the generated caption; everything after it is the existing
    // structure (details, city/market, verified pricing and specials, hashtags, CTA) untouched.
    // Metadata-free on purpose, so they resolve for any walkthrough — unlike the openers above
    // that return null without a city or a type.
    case "apartment_crush": return "I wasn't even looking to move… 👀"
    case "engagement": return "Who would you live here with? 👀"
    case "level_up": return "You leveled up 🔥"
    // The caption states the punchline alone; the setup is the video's. Same instinct as T20,
    // whose caption carries the promise rather than transcribing the dialogue.
    case "them_vs_me": return "Nah, I'm good 😂"
    case "view": return "I'll never get tired of this view 😍"
    // No property type in the caption — the type belongs to the on-video sentence, where the
    // short-type rule governs it. Repeating it here would risk the long label the rule excludes.
    case "aura": return "This has too much aura 🔥"
    case "pov_couple": return "POV: Tag your love ❤️"
    case "real_living": return city && noun ? `Real ${noun} living in ${city}.` : null
    case "what_mo_gets_you": return city && price ? `${price} in ${city}.` : null
    // Identical to this template's own headline plus a full stop.
    case "what_mo_gets_you_top": return city && price ? `${buildTemplateHeadline("what_mo_gets_you", src)}.` : null
  }
  return null
}

/** SUPERSEDED opener wording, kept ONLY so isGeneratedCaption still recognizes a caption written
 *  while it was live. Never generated. Same rule as the legacy "/mo" and pre-"new" headline forms: a
 *  draft written before a copy change must stay generator-owned, or it would freeze as a "manual
 *  override" and never re-sync on a Market/Type change.
 *    • 1a0bc1a — the first template-aware openers, replaced by the mapping above. */
function supersededOpeners(src: SourceMeta): string[] {
  const { city, noun, price } = openerParts(src)
  const moving = city ? `Moving to ${city}? ` : ""
  const out: string[] = []
  if (city) {
    out.push(`${moving}Check this out.`, `${moving}This deal is hard to beat.`, `${moving}Your standards just went up.`,
      `${moving}POV: you upgraded.`, `${moving}Luxury doesn't have to break the budget.`,
      `${moving}It might be time to trade up.`)
    if (noun) out.push(`${moving}This could be your next ${noun}.`, `Real ${noun} living in ${city}.`, `This is real ${noun} living in ${city}.`)
    if (price) out.push(`POV: this is what ${price} gets you in ${city}.`, `What ${price} gets you in ${city}.`)
  }
  // T18's first opener, replaced the same day it shipped. It needs no city, so it sits outside the
  // city branch: a draft written with it must still be recognised as GENERATED, or it would freeze
  // as a manual override and stop re-syncing when the price or property type changes.
  if (price) out.push(`Be honest… would you live here for ${price}? 👀`)
  return out
}

/**
 * "Up to" for VARIABLE rent concessions — CAPTION ONLY.
 *
 * A free-weeks offer almost never applies to every unit, so a caption that states it flatly
 * overstates it. The video overlay must keep saying "8 Weeks Free" exactly, which is why this is a
 * separate function applied at ONE call site (captionSections) rather than inside
 * resolveSocialSpecial or buildTemplateDetail — both of those feed the overlay.
 *
 * SCOPE IS NARROW ON PURPOSE. Only a duration concession is qualified:
 *   "8 Weeks Free"  -> "Up to 8 weeks free!"      "2 Months Free" -> "Up to 2 months free!"
 * Anything else is returned UNCHANGED — a waived fee or a fixed gift card is not variable, and
 * "Up to $500 gift card" would invent uncertainty that does not exist.
 *
 * IDEMPOTENT. A stored Social Special that already reads "Up to 8 weeks free" is left alone, so
 * the caption can never say "Up to up to". Checked against the whole string, case-insensitively.
 */
export function captionSpecialPhrase(special: string | null | undefined): string {
  const s = (special ?? "").trim()
  if (!s) return ""
  // Already qualified — by the operator, or by an earlier pass over the same value.
  if (/^up\s+to\b/i.test(s)) return s
  // ONE shape: "<n> week(s)|month(s) free", optionally already punctuated. Anything else falls
  // through untouched rather than being guessed at.
  const m = s.match(/^(\d{1,2})\s+(weeks?|months?)\s+free[.!]?$/i)
  if (!m) return s
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return s
  const unit = /^month/i.test(m[2]) ? (n === 1 ? "month" : "months") : (n === 1 ? "week" : "weeks")
  return `Up to ${n} ${unit} free!`
}

/** The caption BODY below the opener — unchanged by the template-aware opener work. Split out so the
 *  legacy-recognition pass can rebuild an older caption with its original rotating hook without
 *  duplicating the section logic. */
function captionSections(src: SourceMeta, opener: string | null, ctaTail?: string, legacySpecialWording = false): string {
  // CAPTION ONLY. resolveSocialSpecial stays untouched so buildTemplateDetail — and therefore every
  // overlay and the FFmpeg render — keeps the exact stored wording. `legacySpecialWording` exists
  // purely for recognition: a caption generated before this change says "8 Weeks Free", and without
  // a way to rebuild that form it would freeze as a manual override.
  const rawSpecial = resolveSocialSpecial(src)
  const special = legacySpecialWording ? rawSpecial : captionSpecialPhrase(rawSpecial)
  // LAYOUT IS NOT SAID TWICE. A post typed "Split-Level Loft" already carries the qualifier in its
  // type — and therefore in the overlay headline and the hashtags — so repeating it as an
  // Amenities bullet reads as padding rather than a second fact. The chip stays SELECTED and
  // stored (it is true, and research keeps it); it is only withheld from this caption.
  //
  // Driven off COMPOUND_TYPE_QUALIFIERS rather than a hardcoded "Split-Level", so a future
  // qualifier behaves the same way without another edit here. Applied BEFORE the slice, so
  // dropping one promotes the next amenity into the caption instead of leaving two bullets.
  // ORDER IS LOAD-BEARING. Implication is evaluated FIRST, against the full selection plus the
  // type's own layout claim — if withoutRedundantLayout ran first it would already have removed the
  // Split-Level chip, leaving nothing to entail Multi-Level, and the caption would bullet
  // "Multi-Level Layout" under a "Split-Level Loft" overlay. Type-redundancy is removed second.
  const feats = withoutRedundantLayout(
    withoutImpliedFeatures(features(src.amenities), src.propertyType),
    src.propertyType,
  ).slice(0, 3)
  const sections: string[] = []
  if (opener) sections.push(opener)
  if (special) sections.push(`✨ ${special}`)
  // Blank line after the heading so the bullets read as a list rather than running
  // straight into it. PRESENTATION ONLY: captionKey() below trims each line and
  // drops empties, so a caption stored without this blank line still compares
  // equal to a freshly generated one — an existing draft is NOT reclassified as a
  // manual override, which is the failure mode that once let a stale caption
  // publish.
  if (feats.length) sections.push(`🏡 Amenities\n\n${feats.map((f) => `• ${f}`).join("\n")}`)
  // Joined with "\n\n", so this is exactly ONE blank line between the service line and the CTA.
  sections.push(SERVICE_LINE, ctaTail ?? commentCta(src.propertyType))
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
/**
 * T21's caption, verbatim and FIXED.
 *
 * Returned WHOLE rather than composed, because the approved copy carries no special line and no
 * amenities block — routing it through captionSections would insert whichever of those the property
 * happens to have, producing copy nobody approved. It also ends with a qualifier, and the section
 * builder has no slot after the call to action.
 *
 * THE QUALIFIER IS LOAD-BEARING. "Applications approved on a case-by-case basis" is the sentence
 * that keeps this from reading as a promise, and it is the reason the credit question never appears
 * in the video overlay: a disclaimer that cannot be read at overlay size, attached to footage that
 * gets re-used, is worse than no claim at all.
 *
 * Hashtags are unaffected — they are merged separately at publish by composeFinalCaption.
 */
// ── THE CLIENT / ME FIXED CAPTIONS (T21-T24) ────────────────────────────────────────────────────
//
// These four templates are the only ones whose caption is fixed copy rather than composed sections:
// each is a short joke that carries no special line, no amenities section and no price, and T21 ends
// with a qualifier the section builder has no slot for. buildCaption returns them whole.
//
// THE CLOSING CTA IS NOT RESTATED HERE. It is commentCta's sentence — the same one every other
// template's caption ends with — with the keyword pinned to LIST (commentCta(null) resolves to
// "LIST"), so these four and the composed captions cannot drift apart, and a future change to the
// CTA wording reaches all of them from one place.
const CLIENT_ME_CTA = commentCta(null)

// The SUPERSEDED Client / Me CTA, kept for exactly the reason LEGACY_FORM_CTA is kept: a caption
// written while it was live must stay generator-owned, or an existing draft freezes as a "manual
// override" and never re-syncs again. Never generated — recognition only.
const LEGACY_CLIENT_ME_CTA = "✅ Comment LIST and I'll help you find options that fit your budget and situation."

/** T21. The city is the ONE variable; everything else is fixed copy. A missing or blank market
 *  degrades to the cityless opening line rather than printing "Moving to  with Bad credit?" or
 *  inventing a city — the same never-fabricate rule the headlines follow. The qualifying sentence
 *  lives here and ONLY here: burning a disclaimer into the video would be unreadable at this size
 *  and would follow the footage into every re-use of it. */
const badCreditLines = (city: string, cta: string) => [
  city ? `Moving to ${city} with Bad credit? 😭` : "Bad credit? 😭",
  "Some apartment communities offer flexible credit requirements.",
  "My apartment locating service is completely FREE!",
  cta,
  "Applications approved on a case-by-case basis.",
].join("\n\n")

export function badCreditCaption(src: SourceMeta): string {
  return badCreditLines(clean(normalizeSocialMarket(src.market)), CLIENT_ME_CTA)
}

// The CITYLESS form — what T21 produces for a post with no market, and ALSO the wording it produced
// before the city was added. Nothing extra is needed to keep those captions generator-owned:
// isGeneratedCaption already rebuilds every template's caption across MARKETS_WITH_NULL, and the
// null market reproduces this string byte for byte.
export const BAD_CREDIT_CAPTION = badCreditLines("", CLIENT_ME_CTA)

// T22. Metadata-free fixed copy.
const exCheatedLines = (cta: string) => [
  "My ex cheated. I need a new apartment. 😭",
  "Some apartment communities offer flexible options depending on your situation.",
  "My apartment locating service is completely FREE!",
  cta,
].join("\n\n")
export const EX_CHEATED_CAPTION = exCheatedLines(CLIENT_ME_CTA)

// T23. Metadata-free fixed copy. Says communities MAY offer better pricing — never that they will.
const rentIncreaseLines = (cta: string) => [
  "Rent went up AGAIN? 😩",
  "Some apartment communities may offer better pricing, specials, or a better overall fit for your budget.",
  "My apartment locating service is completely FREE!",
  cta,
].join("\n\n")
export const RENT_INCREASE_CAPTION = rentIncreaseLines(CLIENT_ME_CTA)

// T24. Metadata-free fixed copy. The caption makes no claim about the current place beyond the
// renter's own words, and promises help exploring options rather than an outcome.
const roachesLines = (cta: string) => [
  "Unwanted roommates? 😭 I got you!",
  "If your current place isn't working out, I can help you explore other apartment options within your budget.",
  "My apartment locating service is completely FREE!",
  cta,
].join("\n\n")
export const ROACHES_CAPTION = roachesLines(CLIENT_ME_CTA)

/** Every SUPERSEDED form of a fixed Client / Me caption, for isGeneratedCaption only. Rebuilt from
 *  the CURRENT copy with the old CTA substituted, rather than re-spelling the old captions, so an
 *  edit to the copy cannot leave a stale duplicate behind here. */
function supersededFixedCaptions(template: OverlayTemplate | null | undefined, src: SourceMeta): string[] {
  switch (template) {
    case "client_me_bad_credit": return [badCreditLines(clean(normalizeSocialMarket(src.market)), LEGACY_CLIENT_ME_CTA)]
    case "client_me_ex_cheated": return [exCheatedLines(LEGACY_CLIENT_ME_CTA)]
    case "client_me_rent_increase": return [rentIncreaseLines(LEGACY_CLIENT_ME_CTA)]
    case "client_me_roaches": return [roachesLines(LEGACY_CLIENT_ME_CTA)]
    default: return []
  }
}

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
  // T21 is the one template whose caption is fixed copy rather than composed sections. Checked
  // BEFORE resolveOpener so no hook is selected and no special/amenity section can be appended.
  if (template === "client_me_bad_credit") return badCreditCaption(src)
  // T22 is the same shape: fixed copy, checked before resolveOpener so no hook is chosen and no
  // special / amenity section can be appended to it.
  if (template === "client_me_ex_cheated") return EX_CHEATED_CAPTION
  // T23 and T24 are the same shape, checked here for the same reason.
  if (template === "client_me_rent_increase") return RENT_INCREASE_CAPTION
  if (template === "client_me_roaches") return ROACHES_CAPTION
  return captionSections(src, resolveOpener(src, seed, template ?? null))
}

/** The opener buildCaption would choose. Extracted so the legacy-recognition pass can rebuild a
 *  caption with the CURRENT opener but the SUPERSEDED closing line, without a second copy of this
 *  selection rule drifting out of step with the real one. */
function resolveOpener(src: SourceMeta, seed: string | number | undefined, template: OverlayTemplate | null): string | null {
  const city = clean(normalizeSocialMarket(src.market))
  const canonicalType = normalizeToCanonical(clean(src.propertyType) || null)
  return (template ? captionOpener(template, src) : null) ?? (() => {
    const hooks = eligibleHooks(city, canonicalType)
    return hooks.length ? hooks[hashSeed(seed) % hooks.length] : null
  })()
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
  return startingPriceLabel(src.budgetRange, src.priceLabelMode)
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
export const OVERLAY_TEMPLATES = ["market_type", "market_type_centered", "your_sign", "special_feature", "next_property", "upgrade", "apartment_standards", "pov_upgrade", "affordable_luxury", "pov_price", "hits_different", "trade_up", "wanted_luxury", "real_living", "what_mo_gets_you", "what_mo_gets_you_top", "property_tour",
  // T18-T20. Appended LAST so every existing index is untouched; all three are Template 8's
  // treatment with different wording — same family, same geometry, same caption structure.
  "would_you_live_here", "imagine_coming_home", "client_me",
  // T21. Template 20's exact treatment with different wording — same family, same geometry, same
  // headline/detail split. Appended LAST so every existing index is untouched.
  "client_me_bad_credit",
  // T22-T24. Same again: Template 20's treatment, three more wordings. Appended LAST so every
  // existing index — and therefore every saved post's stored template string — is untouched.
  "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches",
  // T25-T31 (dropdown positions 20-26). APPENDED LAST, exactly like every batch before them, so
  // every existing index — and therefore every saved post's stored overlay_template string — is
  // untouched. They are SHOWN before the Client / Me group via OVERLAY_TEMPLATE_ORDER below:
  // identity and display order are deliberately different things.
  "apartment_crush", "engagement", "level_up", "them_vs_me", "view", "aura", "pov_couple"] as const
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
  property_tour: "Property Tour",
  would_you_live_here: "Would You Live Here?",
  imagine_coming_home: "Imagine Coming Home",
  client_me: "Client / Me",
  client_me_bad_credit: "Client / Me — Bad Credit",
  client_me_ex_cheated: "Client / Me — My Ex Cheated",
  client_me_rent_increase: "Client / Me — Rent Increase",
  client_me_roaches: "Client / Me — Roaches",
  apartment_crush: "Apartment Crush",
  engagement: "Engagement",
  level_up: "Level Up",
  them_vs_me: "Them vs. Me",
  view: "View",
  aura: "Aura",
  pov_couple: "POV Couple",
}

/**
 * THE DROPDOWN ORDER — display only, and deliberately not the registry order.
 *
 * OVERLAY_TEMPLATES is an IDENTITY list: a post stores its template as a string, and new entries
 * are appended so no existing entry ever moves. That rule is what keeps saved drafts valid, and it
 * is not negotiable.
 *
 * But the seven conversational templates belong beside the hooks they resemble, not after the
 * Client / Me group that happened to be added before them. Separating display from identity gives
 * both: the array above never reorders, and the operator sees a sensible list.
 *
 * Positions 1-19 are the registry's own first nineteen, unchanged. Then the seven new ones, then
 * the five Client / Me templates. Every registered template appears exactly once — asserted in
 * scripts/social/newTemplates.test.ts, so a template added to one list and forgotten in the other
 * cannot ship.
 */
export const OVERLAY_TEMPLATE_ORDER: readonly OverlayTemplate[] = [
  ...OVERLAY_TEMPLATES.slice(0, 19),
  "apartment_crush", "engagement", "level_up", "them_vs_me", "view", "aura", "pov_couple",
  "client_me", "client_me_bad_credit", "client_me_ex_cheated", "client_me_rent_increase", "client_me_roaches",
]

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
/**
 * T30 AURA — the only property types short enough for its sentence.
 *
 * "This high-rise has too much aura" works; "This rental home has too much aura" does not, and a
 * compound Social type ("Split-Level Townhome") is worse still. So the allow-list is explicit
 * rather than derived: six canonical types in, everything else — Rental Home, compounds,
 * non-canonical values and absent metadata alike — falls back to the typeless sentence, which is
 * always complete and always this short.
 *
 * Deliberately NOT SOCIAL_CANONICAL_ORDER minus one: that list exists for a different purpose and
 * would silently admit a seventh type the day it grows.
 */
export const AURA_SHORT_TYPES = ["Studio", "Apartment", "High-Rise", "Loft", "Townhome", "Penthouse"] as const
const AURA_FALLBACK_HEADLINE = "This place has too much aura"

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

    // ── T18 WOULD YOU LIVE HERE? ────────────────────────────────────────────────────────────
    // The price is INSIDE the sentence, so it degrades rather than printing an empty slot: with
    // no verified price the question still stands on its own. Never an invented number — the
    // whole point of the template is that the figure is real.
    case "would_you_live_here": {
      const amount = startingPriceAmount(src.budgetRange)
      return amount ? `Would you live here for ${amount}${PER_MONTH_SUFFIX}?` : "Would you live here?"
    }

    // ── T19 IMAGINE COMING HOME ─────────────────────────────────────────────────────────────
    // Deliberately metadata-free: no type, no market, no price. It is the one template that can
    // caption any walkthrough, which is exactly its job.
    case "imagine_coming_home":
      // NO EMOJI IN A BURNED-IN HEADLINE. Verified against the shipped TTF: Libre Baskerville
      // contains no glyph for U+2728 ✨, U+1F60E 😎, U+1F440 👀 or U+1F3E1 🏡, so drawtext renders
      // them as tofu boxes. The sparkle lives in the CAPTION, where Instagram draws it properly.
      return "Imagine coming home to this"

    // ── T20 CLIENT / ME ─────────────────────────────────────────────────────────────────────
    // A two-statement exchange, carried by TWO ELEMENTS — this HEADLINE holds the client's line and
    // the DETAIL line holds the reply, exactly the way T19 pairs its hook with "Starting at $X".
    //
    // It used to be one headline with an authored "\n" in the middle. That was the wrong structure:
    // a headline is a single element, so the reply had no independent position, and its spacing had
    // to be faked with line-spacing values the editor preview did not even read. Splitting it means
    // the pair inherits T19's gap, sizing and alignment with no special case anywhere.
    //
    // The client's line still degrades independently so the setup works with partial metadata: no
    // type and no city gives the generic "I need a place." withArticle avoids "a apartment", and
    // propertyNoun already reduces a compound type to natural wording, so "Split-Level Townhome"
    // reads "a split-level townhome" rather than duplicating the qualifier. The reply is fixed and
    // lives in buildTemplateDetail.
    case "client_me": {
      const cityName = clean(normalizeSocialMarket(src.market))
      const noun = canonicalType ? propertyNoun(canonicalType) : ""
      const want = noun
        ? `${withArticle(noun)}${cityName ? ` in ${cityName}` : ""}`
        : (cityName ? `a place in ${cityName}` : "a place")
      return `Client: “I need ${want}.”`   // 😎 lives in the caption — see above
    }
    // ── T21 CLIENT / ME — BAD CREDIT ────────────────────────────────────────────────────────
    // Template 20's structure exactly: the client's line is the HEADLINE, the reply is the DETAIL.
    // Deliberately metadata-free — the question does not vary by property, and a credit question is
    // not something to decorate with a market or a type.
    //
    // THE QUALIFYING LANGUAGE IS NOT HERE. "Applications approved on a case-by-case basis" lives in
    // the caption only; burning a disclaimer into the video would be unreadable at this size and
    // would follow the footage into every re-use of it.
    case "client_me_bad_credit":
      return "Client: “I have bad credit. Can you help me?”"
    // ── T23 CLIENT / ME — RENT INCREASE ─────────────────────────────────────────────────────
    // T24 CLIENT / ME — ROACHES follows it. Both are Template 20's structure: the client's line is
    // the HEADLINE, the reply is the DETAIL. Deliberately metadata-free, like T21 — neither
    // complaint varies by property or market, and neither is something to decorate with a city.
    // The capitalisation ("AGAIN", "ROACHES", "OUT") is the approved emphasis, not a formatter.
    case "client_me_rent_increase":
      return "Client: “My rent went up AGAIN. I need to move.”"
    case "client_me_roaches":
      return "Client: “My apartment has ROACHES. I need OUT!”"
    // ── T22 CLIENT / ME — MY EX CHEATED ─────────────────────────────────────────────────────
    // Template 20's structure again: client's line in the HEADLINE, reply in the DETAIL.
    //
    // ONE variable, and only the SEVEN SIMPLE nouns. propertyNoun turns the canonical value into
    // natural lowercase wording ("high-rise", "rental home"), and SOCIAL_CANONICAL_ORDER is the
    // gate: a Social-only COMPOUND type ("Split-Level Townhome", "Industrial-Style Apartment") is
    // deliberately excluded, because "I need a new industrial-style penthouse" is neither short nor
    // in this template's voice. Anything outside the seven — compound, non-canonical or absent —
    // falls back to "apartment", so the sentence is always complete and always this short. The
    // article is always "a" ("a new apartment"), so withArticle is not involved.
    // ── T25-T31 — THE CONVERSATIONAL SEVEN ──────────────────────────────────────────────────
    // Six of them are a fixed spoken hook plus the shared optional price line, which is Template
    // 8's established shape. No metadata is required, so they caption any walkthrough — and
    // nothing here invents a price: buildTemplateDetail returns "" when there is no valid one and
    // the line collapses with its gap.
    case "apartment_crush":
      return "I wasn’t even looking to move…"
    case "engagement":
      return "Who would you live here with?"
    case "level_up":
      return "You leveled up"
    case "view":
      return "I’ll never get tired of this view"
    case "pov_couple":
      return "POV: You just moved in with the love of your life"
    // T30 AURA. The ONE variable, gated by AURA_SHORT_TYPES — see the constant for why the
    // allow-list is explicit. Anything outside the six reads as the typeless sentence.
    case "aura": {
      const short = canonicalType && (AURA_SHORT_TYPES as readonly string[]).includes(canonicalType)
        ? canonicalType.toLowerCase()
        : null
      return short ? `This ${short} has too much aura` : AURA_FALLBACK_HEADLINE
    }
    // T28 THEM VS. ME. Structurally a Client / Me exchange — the first statement is the HEADLINE,
    // the reply is the DETAIL — so it joins that family in overlaySpec and inherits its layout,
    // sizing, gap and timing wholesale. Nothing of Client / Me is copied or modified; membership
    // IS the reference, which is what stops the two drifting apart.
    case "them_vs_me":
      return "Them: Just get a regular apartment bro"
    case "client_me_ex_cheated": {
      const noun = canonicalType && (SOCIAL_CANONICAL_ORDER as readonly string[]).includes(canonicalType)
        ? propertyNoun(canonicalType)
        : "apartment"
      return `Client: “My ex cheated. I need a new ${noun}.”`
    }
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
    // TOUR — Template 3's structure and geometry with a tour-specific sentence: "San Antonio
    // apartment tour" / "Dallas penthouse tour". Sentence case, never a hero title — the
    // center_hook_detail branch renders uppercase:false, so what is written here is what is drawn.
    //
    // `noun` is the shared lowercase singular every conversational template uses, so the compounds
    // read correctly too ("Dallas split-level loft tour"), and the market goes through the same
    // normalizer the other city-bearing templates use.
    //
    // Degrades rather than fabricates, matching startingPriceLabel's rule: market only gives
    // "San Antonio tour", type only gives "apartment tour", neither gives "" — never "undefined
    // tour", never an invented city.
    case "property_tour": {
      const city = clean(normalizeSocialMarket(src.market))
      const parts = [city, noun, "tour"].filter(Boolean)
      return parts.length > 1 ? parts.join(" ") : ""
    }
    case "trade_up": {
      // APARTMENT TRADES FOR AN APARTMENT — the one destination type that cannot be phrased as a
      // trade. "…trade in your apartment for an apartment" is what the generic sentence produced,
      // and it reads as a non-statement. An apartment-to-apartment move is an UPGRADE, so that is
      // what it says. Only the exact canonical "Apartment" is special-cased: the compound
      // "Industrial-Style Apartment" IS a meaningfully different destination, so it keeps the trade
      // wording ("…for an industrial-style apartment") and reads correctly.
      if (canonicalType === "Apartment") return "What life looks like when you upgrade your apartment"
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
  const price = startingPriceLabel(src.budgetRange, src.priceLabelMode)
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
    // T9 Affordable Luxury joins this group rather than getting a branch of its own. It is the same
    // optional-price behaviour T6 Upgrade established, and `startingPriceLabel` is already the one
    // implementation of it: it resolves BOTH label modes ("Starting at $1,495/month" / "Exact unit
    // shown: $1,495/month") and already returns "" for a missing or invalid price, so the line and
    // its gap collapse on their own with no second code path to keep in step.
    //
    // Deliberately the price ALONE, not T6's special+price lockup. T9's headline — "Luxury doesn't
    // have to be expensive" — is an argument about COST, so the number is the payoff; a special
    // sitting beside it competes with the one point the template is making.
    case "affordable_luxury":
      return price // "Starting at $X/month" or "" (T8 shows the POV headline + this price line)
    case "next_property":
    case "pov_upgrade":
    // T19 joins Template 8's group exactly: the headline carries no number, so the optional
    // "Starting at $X/month" line applies and collapses on its own when there is no valid price.
    // That is what lets T19 caption any walkthrough, priced or not.
    case "imagine_coming_home":
    // T25-T31 (minus Them vs. Me) take the SAME optional price line, for the same reason every
    // template above does: startingPriceLabel resolves both label modes and already returns ""
    // for a missing or invalid price, so the line and its gap collapse on their own. The price
    // shown is this property's verified Starting At value — never a constant, and never invented.
    case "apartment_crush":
    case "engagement":
    case "level_up":
    case "view":
    case "aura":
    case "pov_couple":
      return price // T5/T8 gained the same optional price line — see the group above

    // T28 THEM VS. ME fills the detail slot with the second half of its exchange, exactly as
    // Client / Me fills it with "Me: “Say less.”" — same slot, same size, same gap, same timing.
    case "them_vs_me":
      return "Me: Nah, I’m good"

    // T18 states the price INSIDE its question ("Would you live here for $1,500/month?"), so a
    // price line below would print the same number twice — the identical reason T15/T16 take no
    // detail. The family still has one, so an empty string simply collapses it.
    case "would_you_live_here":
      return ""

    // T20's SECOND STATEMENT. This is the reply half of the exchange, and it lives here — in the
    // same slot, at the same size, gap and alignment T19 gives "Starting at $X/month" — rather than
    // inside the headline after an authored newline.
    //
    // Deliberately NOT the price: the dialogue makes no claim about rent that needs substantiating,
    // and the slot can hold only one line. Fixed wording, so it needs no metadata and never
    // degrades. The 😎 stays in the caption — Libre Baskerville has no emoji glyphs and would
    // render tofu on the video.
    // T21's reply is its OWN line. "I got you." answers a question about the renter's situation,
    // where the other four answer a request — so this is the one Client / Me template that does not
    // share the branch below. It is still the same slot, size, gap and alignment: only the words
    // differ, and the family it belongs to is unchanged.
    case "client_me_bad_credit":
      return "Me: “I got you.”"
    case "client_me":
    // T22, T23 and T24 all reply with T20's line, from this one branch rather than four copies, so
    // they cannot fall out of step with each other.
    case "client_me_ex_cheated":
    case "client_me_rent_increase":
    case "client_me_roaches":
      return "Me: “Say less.”"
    // T3 your_sign now takes the SAME optional price line too. Its headline is unchanged and still
    // uses no metadata; the price is purely an additional, collapsible second line.
    case "your_sign":
    // Tour takes the identical optional price line: startingPriceLabel resolves both label modes
    // and returns "" for a missing/invalid price, so the line AND its gap collapse on their own.
    case "property_tour":
      return price
    case "what_mo_gets_you": // the price+city sentence is the whole headline — no separate detail
    case "what_mo_gets_you_top": // T16 = T11's copy, top-anchored; same "no detail"
      return "" // center-hook, no detail
    case "special_feature":
      return joinDetailParts([special, feature]) // special+feature / special / feature / none
    // T6 and T7 USED TO fold the current special in alongside the price
    // (joinDetailParts([special, price]) -> "2 Months Free · Starting at $1,495/month"). They now
    // show the price alone, like every other T5-T14 template, so all ten have one secondary-line
    // behaviour and one line shape. The special is NOT lost: resolveSocialSpecial still drives the
    // caption's ✨ line, which is where it was always the more natural fit.
    case "upgrade":
    case "apartment_standards":
      return price
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
  // T20 BEFORE THE EXCHANGE WAS SPLIT INTO TWO ELEMENTS. It used to be one headline carrying both
  // statements separated by an authored newline; the reply now lives in the detail line, so the
  // generator never produces the combined form again. Rebuilt from the CURRENT headline rather
  // than re-spelling the old string, so it cannot drift from whatever the client line becomes.
  //
  // No production rows carry this today (0 posts use client_me), but an in-flight draft would
  // otherwise freeze as a "manual override" and stop re-syncing on a Market/Type change — the same
  // failure the "/mo" and your_sign entries above exist to prevent.
  {
    const m = t.match(/^([\s\S]+)\n *Me: *[“"]Say less\.[”"]$/)
    if (m) {
      for (const mk of MARKETS_WITH_NULL) for (const pt of TYPES_WITH_NULL) {
        if (buildTemplateHeadline("client_me", { market: mk, propertyType: pt }) === m[1]) return true
      }
    }
  }
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
/**
 * Collapse EQUIVALENT price spellings to one canonical token so a caption stored
 * before compact formatting still matches the generator afterwards.
 *
 *   "$18,000" and "$18K"   → "$18000"
 *   "$7,500"  and "$7.5K"  → "$7500"
 *
 * Deliberately narrow: it only rewrites the NUMBER's spelling, never any words, and
 * different amounts stay different ($18K and $19K do not collapse). So a genuinely
 * manual caption is still manual — the only captions this makes equal are ones that
 * already said the same rent a different way.
 *
 * Without it, three templates would silently break: pov_price, what_mo_gets_you and
 * what_mo_gets_you_top put the price in the CAPTION, so changing the number format
 * would make their stored captions stop matching buildCaption, freeze them as
 * "manual", and publish the old spelling forever.
 */
const canonicalizePriceText = (s: string) =>
  s
    // Compact form first ("$7.5K", "$18K") → the dollar amount it denotes.
    .replace(/\$(\d[\d,]*)(?:\.(\d))?K\b/gi, (_m, whole: string, tenth?: string) => {
      const n = parseInt(whole.replace(/,/g, ""), 10) * 1000 + (tenth ? Number(tenth) * 100 : 0)
      return `$${n}`
    })
    // Full form ("$18,000") → the same digits without separators.
    .replace(/\$(\d[\d,]*)/g, (_m, d: string) => `$${d.replace(/,/g, "")}`)

const captionKey = (s: string) => {
  const lines = canonicalizePriceText(s).replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean)
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
      // ...and every superseded form of a FIXED caption (currently: the old Client / Me CTA), so a
      // caption written before the wording changed stays generator-owned instead of freezing as a
      // manual override.
      for (const old of supersededFixedCaptions(tpl, s2)) if (captionKey(old) === t) return true
    }
    // ...and every SUPERSEDED opener wording, so a caption written under an earlier mapping is still
    // generator-owned rather than frozen as a manual override.
    for (const legacy of supersededOpeners(s2)) {
      if (captionKey(captionSections(s2, legacy)) === t) return true
    }
    // ...and the SUPERSEDED CLOSING LINE. Every caption in the library predates the comment CTA and
    // ends with "Submit the form…"; without this it would match nothing, be judged a manual override
    // and never re-sync again. Checked for the current opener and for every superseded one, because
    // an old caption can be old in both respects at once.
    if (captionKey(captionSections(s2, resolveOpener(s2, seed, null), LEGACY_FORM_CTA)) === t) return true
    for (const tpl of OVERLAY_TEMPLATES) {
      if (captionKey(captionSections(s2, resolveOpener(s2, seed, tpl), LEGACY_FORM_CTA)) === t) return true
    }
    for (const legacy of supersededOpeners(s2)) {
      if (captionKey(captionSections(s2, legacy, LEGACY_FORM_CTA)) === t) return true
    }
    // ...and the SUPERSEDED SPECIAL WORDING. Every caption written before "Up to" says the stored
    // form ("8 Weeks Free"); the generator now says "Up to 8 weeks free!". Without rebuilding the
    // old form here, each of those captions would match nothing, be judged a manual override, and
    // never re-sync again — the identical failure the legacy CTA and superseded openers above exist
    // to prevent. Only reachable for a post that HAS a duration special, so it costs nothing
    // otherwise.
    for (const cta of [undefined, LEGACY_FORM_CTA] as const) {
      if (captionKey(captionSections(s2, resolveOpener(s2, seed, null), cta, true)) === t) return true
      for (const tpl of OVERLAY_TEMPLATES) {
        if (captionKey(captionSections(s2, resolveOpener(s2, seed, tpl), cta, true)) === t) return true
      }
      for (const legacy of supersededOpeners(s2)) {
        if (captionKey(captionSections(s2, legacy, cta, true)) === t) return true
      }
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

/** Instagram's own hard limit on caption text. Enforced on the FINAL payload (body + hashtag
 *  block), which is the only string Meta ever sees — the 2200 applied when a caption is SAVED is a
 *  per-field truncation that happens before hashtags exist, so the two together could exceed it. */
export const IG_CAPTION_MAX = 2200

/** Combine the approved caption + hashtags into the final publish text (composer keeps them
 *  separate; this is only the eventual outgoing payload).
 *
 *  `tagLimit` caps the hashtag block. Legacy rows can still hold more than today's product rule
 *  allows (the stored cap was once 30), and nothing trims them on read, so the cap is applied HERE
 *  as well — the last point before the text leaves for Meta. The caption body is never touched by
 *  the tag cap. */
export function composeFinalCaption(caption: string, hashtags: string[], tagLimit = MAX_HASHTAGS): string {
  const tags = (hashtags ?? []).filter(Boolean).slice(0, Math.max(0, tagLimit))
  const full = tags.length ? `${caption}\n\n${tags.join(" ")}` : caption
  if (full.length <= IG_CAPTION_MAX) return full
  // Over the limit: keep the WHOLE hashtag block and trim the body, because losing a tag changes
  // distribution while losing a trailing sentence does not. Falls back to a hard slice if the tag
  // block alone somehow exceeds the limit.
  const suffix = tags.length ? `\n\n${tags.join(" ")}` : ""
  const room = IG_CAPTION_MAX - suffix.length
  return room > 0 ? `${caption.slice(0, room).trimEnd()}${suffix}` : full.slice(0, IG_CAPTION_MAX)
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
  /** The post's saved overlay template. REQUIRED for the published text to match what was
   *  approved: a generator-owned caption is regenerated here, and buildCaption picks the opener
   *  from the template. Omitting it (as this did) silently fell through to the seed-rotated legacy
   *  hooks, so the first line of every template-drafted post changed at publish time. */
  overlayTemplate?: OverlayTemplate | null
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
  const caption = publishCaption(input.caption, meta, input.sourceContentId ?? undefined, input.overlayTemplate ?? null)
  return composeFinalCaption(caption, (input.hashtags ?? []).filter(Boolean), PLATFORM_HASHTAG_LIMIT.instagram)
}

// TikTok's own product limit. It now COINCIDES with the shared MAX_HASHTAGS (both 5) but stays a
// separate named constant so a future platform-specific change does not silently move the shared rule.
export const TIKTOK_MAX_HASHTAGS = 5

/**
 * TIKTOK-ONLY paragraph padding. U+2800 BRAILLE PATTERN BLANK, one per blank line.
 *
 * WHY THIS EXISTS. Social Beast stores and sends \n\n between every caption section, and that is
 * verifiably what leaves our server — the publish route passes `title` to TikTok verbatim and
 * JSON.stringify preserves \n. TikTok's published caption nevertheless renders the sections hard
 * against each other: it keeps the single line break and drops the EMPTY line between paragraphs,
 * so the hook, special, amenities, service statement, CTA and hashtags all run together.
 *
 * The fix is to stop the line being empty. U+2800 was chosen over the obvious U+200B ZERO WIDTH
 * SPACE on one property: U+200B is category Cf, a format control, and that is precisely the class
 * of character platforms strip — zero-width characters are the classic keyword-cloaking vector.
 * U+2800 is category So, an ordinary printable glyph that happens to render blank, so it survives
 * both whitespace-collapsing and control-character stripping. It is also what creators already use
 * for caption spacing on TikTok and Instagram, so it is unremarkable rather than anomalous.
 *
 * NOT OFFICIALLY SUPPORTED. TikTok documents no rule for whitespace in post_info.title. This is
 * matched to observed behaviour, not to a guarantee, and it degrades safely: if TikTok honours
 * \n\n after all, \n<pad>\n still renders as exactly one blank line — never two.
 *
 * IDEMPOTENT BY CONSTRUCTION. The output contains no run of two or more newlines, so re-applying
 * it cannot match again and invisible characters can never accumulate. `\n{2,}` rather than
 * `\n\n` is deliberate: on "a\n\n\nb" a two-character pattern would leave a stray \n\n behind
 * for the next pass to pad a second time.
 *
 * SCOPE. Applied ONLY to the outgoing TikTok payload, as the last step, and never written back —
 * the stored caption stays clean and human-readable, which also keeps isGeneratedCaption working
 * (a padded line is not whitespace, so it would survive that function's blank-line filter and make
 * a generated caption look manual). Instagram is a different function and is untouched.
 */
export const TIKTOK_SECTION_PAD = "\u2800"

/** Replace every blank-line boundary with a line holding TIKTOK_SECTION_PAD. Single newlines —
 *  the amenity bullets — are left alone, and a caption with no blank lines is returned unchanged. */
export function padTikTokSectionBreaks(text: string): string {
  return text.replace(/\n{2,}/g, `\n${TIKTOK_SECTION_PAD}\n`)
}

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
  // LAST STEP, TikTok only: make the blank lines survive TikTok's rendering. Applied after the
  // body and hashtags are composed so every section boundary is covered, including CTA → hashtags.
  return padTikTokSectionBreaks(composeFinalCaption(body, tags))
}
