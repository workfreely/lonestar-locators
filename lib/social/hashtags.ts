// Social Beast — CENTRALIZED, deterministic hashtag engine. ONE editable config drives every
// generated set; nothing scatters hashtag arrays through UI. A generated post gets up to 7 tags
// composed as a BALANCED set (not the first 7 of one array) from: a strong market/apartment term, an
// apartment-locator/service term, a moving/relocation term, one or two property-type terms, strong
// crossover terms, and — for High-Rise/Penthouse — a guaranteed Downtown discovery term.
//
// The banks below are the user's Instagram-researched candidates. This file is designed to EVOLVE:
// add/remove a candidate, change ranking, or flip a preferred singular/plural by editing the arrays —
// the generator and UI never need to change. Ranking = array order (strongest first). We do NOT encode
// popularity numbers; the user's research decides what is approved and how it ranks.

import { normalizeSocialMarket, SOCIAL_MARKETS } from "@/lib/social/markets"
import { normalizeToCanonical, COMPOUND_TYPE_QUALIFIERS } from "@/lib/social/propertyTypes"

/** Per-market candidate groups (canonical market label → ranked candidates). */
type MarketBank = {
  apartment: string[] // strong market apartment terms
  locator: string[] // apartment-locator / service (prefer the strongest single form)
  movingTo: string[] // relocation / discovery intent
  downtown: string[] // ranked Downtown discovery candidates (used for High-Rise/Penthouse)
  highRise: string[] // market-specific High-Rise terms (empty ⇒ use generic)
  general: string[] // other strong market terms (crossover/rotation)
}

// ── MARKET BANKS (user-researched) ────────────────────────────────────────────────────────────
const MARKET_BANKS: Record<string, MarketBank> = {
  "San Antonio": {
    apartment: ["#sanantonioapartments", "#sanantoniotexas"],
    locator: ["#sanantonioapartmentlocator"],
    movingTo: ["#movingtosanantonio"],
    downtown: ["#downtownsanantonio", "#downtownsatx"],
    highRise: [], // no researched city-specific High-Rise term — use generic
    general: ["#sanantoniotx", "#satxapartments"],
  },
  Austin: {
    apartment: ["#austinapartments"],
    locator: ["#austinapartmentlocator"],
    movingTo: ["#movingtoaustin"],
    downtown: ["#downtownaustin", "#downtownaustintx"],
    highRise: [], // do NOT prioritize #austinhighrise (weak volume) — use generic
    general: ["#atxapartments", "#austintx", "#austintexas"],
  },
  Dallas: {
    apartment: ["#dallasapartments", "#dallasapts"],
    locator: ["#dallasapartmentlocators"],
    movingTo: ["#movingtodallas"],
    downtown: ["#downtowndallas", "#downtowndallastx"],
    highRise: ["#dallashighrise"], // researched, no trailing S
    general: ["#dallas", "#dallastx", "#dallastexas"],
  },
  DFW: {
    // Dallas/DFW share the researched Dallas discovery terms; the apartment term differs.
    apartment: ["#dfwapartments"],
    locator: ["#dallasapartmentlocators"],
    movingTo: ["#movingtodallas"],
    downtown: ["#downtowndallas", "#downtowndallastx"],
    highRise: ["#dallashighrise"],
    general: ["#dallasfortworth", "#dfwrealestate", "#fortworthapartments"],
  },
  Houston: {
    apartment: ["#houstonapartments", "#houstonapartment"],
    locator: ["#houstonapartmentlocator", "#houstonapartmentlocators"], // prefer singular; plural kept as candidate
    movingTo: ["#movingtohouston"],
    downtown: ["#downtownhouston", "#downtownhtx"],
    highRise: ["#houstonhighrise", "#houstonhighrises"], // researched Houston-specific
    general: ["#htxapartments", "#houstontx", "#houstontexas"],
  },
}

// ── PROPERTY-TYPE BANKS (canonical type → ranked generic candidates) ──────────────────────────
const PROPERTY_BANKS: Record<string, string[]> = {
  "High-Rise": ["#highrise", "#highrises"],
  Penthouse: ["#penthouse", "#penthouses"],
  Townhome: ["#townhome", "#townhomes", "#townhomeliving", "#townhouse", "#townhouses"],
  Loft: ["#loft", "#loftliving"],
  "Rental Home": ["#rentalhome", "#rentalhomes", "#homeforrent", "#homesforrent", "#houseforrent"],
  Apartment: ["#apartmenthunting", "#apartmentliving", "#luxuryapartments", "#apartmenttour"],
  Studio: ["#studioapartment", "#studioliving", "#studio"],
}

// Always-relevant service/leasing fallback tags (used only to fill remaining slots).
const BASE: readonly string[] = ["#nowleasing", "#apartmentlocator", "#forrent"]

// LEGACY tags produced by the PREVIOUS hashtag engine. Kept ONLY for generated-vs-manual DETECTION
// (never for generation/selection), so migrated posts whose stored hashtags predate the current
// engine are still recognized as generator-owned and re-sync on a metadata change — instead of being
// mistaken for manual overrides. Adding a term here does NOT change any generated set.
const LEGACY_HASHTAGS: readonly string[] = [
  "#atxliving", "#austinrealestate", "#dallasliving", "#dallasrealestate", "#uptowndallas",
  "#dfwliving", "#htxliving", "#houstonrealestate", "#satxliving", "#sanantoniorealestate",
  "#townhouseliving", "#townhometour", "#hometour", "#loftlife", "#lofttour",
  "#apartmenthunting", "#apartmentliving", "#luxuryapartments", "#apartmenttour",
]

// The full canonical hashtag VOCABULARY (every tag the engine can emit + curated legacy tags), used
// by the generated-vs-manual detector: a set whose every tag is in here is generator-owned; a set
// with any OTHER tag is a manual override and is preserved.
const HASHTAG_VOCABULARY: ReadonlySet<string> = new Set(
  [
    ...Object.values(MARKET_BANKS).flatMap((b) => [...b.apartment, ...b.locator, ...b.movingTo, ...b.downtown, ...b.highRise, ...b.general]),
    ...Object.values(PROPERTY_BANKS).flat(),
    ...BASE,
    ...LEGACY_HASHTAGS,
  ].map((t) => t.toLowerCase()),
)

/** Is this a recognized canonical (or legacy) hashtag — i.e., not a custom/manual tag? */
export function isCanonicalHashtag(tag: string | null | undefined): boolean {
  return !!tag && HASHTAG_VOCABULARY.has(tag.toLowerCase())
}

/** All market labels with a curated bank (for reference/UI). */
export const HASHTAG_MARKETS = Object.keys(MARKET_BANKS)

// Concept key: lowercase, strip leading # and ONE trailing 's', so a singular/plural pair collapses
// (#highrise ≡ #highrises, #townhome ≡ #townhomes) and we never waste a slot on both. Distinct
// concepts (#dallashighrise vs #highrise, #townhome vs #townhomeliving) are kept.
const concept = (t: string) => t.toLowerCase().replace(/^#+/, "").replace(/s$/, "")

/**
 * Build a BALANCED, deterministic set of up to `target` (capped at MAX_HASHTAGS) hashtags for a
 * market × property type. Composition (each slot contributes the first still-unused, concept-unique
 * candidate):
 *   1 strong market/apartment · 2 locator/service · 3 moving-to · 4 primary property (High-Rise leads
 *   with the market-specific term, Penthouse leads with canonical #penthouse) · 5 DOWNTOWN for the
 *   High-Rise/Penthouse family, otherwise secondary
 *   property/crossover · 6 the one the other branch took · 7 additional ranked candidate. Remaining
 *   slots backfill from the pooled candidates. No duplicates; no singular/plural stuffing.
 * Only the High-Rise/Penthouse family sees slots 5/6 swapped; every other type keeps its exact
 * original order and output.
 */
/** Social Beast generates at most this many hashtags — the CANONICAL product rule, enforced HERE in
 *  the generator rather than by trimming a longer set at the UI, so no path can exceed it whatever
 *  target it passes. Lowered 7 -> 5: the ranked candidate order already puts the strongest market /
 *  locator / property terms first, so capping at 5 keeps the five MOST RELEVANT rather than hiding
 *  two. Defined here (not in composePost) because composePost imports this module, not the reverse. */
export const MAX_HASHTAGS = 5

/** The canonical type a property type CONTRIBUTES HASHTAGS AS. A compound Social-only type
 *  ("{QUALIFIER} {HEAD NOUN}") contributes as its HEAD NOUN, so "Split-Level Penthouse" and
 *  "Industrial-Style Penthouse" draw the Penthouse bank and the Penthouse/High-Rise Downtown
 *  priority. Without this they matched no PROPERTY_BANKS key at all and silently produced NO
 *  property-type hashtag — their slots 4/5 fell through to generic market terms. Display, overlay
 *  and Property Intelligence logic are untouched: this mapping exists only for hashtag ranking. */
export function hashtagPropertyType(propertyType: string | null | undefined): string | null {
  const t = normalizeToCanonical(propertyType ?? null)
  if (!t) return null
  const qualifier = COMPOUND_TYPE_QUALIFIERS.find((q) => t.startsWith(`${q} `))
  return qualifier ? t.slice(qualifier.length + 1) : t
}

export function buildHashtags(market: string | null | undefined, target = MAX_HASHTAGS, propertyType?: string | null): string[] {
  const cap = Math.max(1, Math.min(MAX_HASHTAGS, target))
  const bank = MARKET_BANKS[normalizeSocialMarket(market)] as MarketBank | undefined
  const type = hashtagPropertyType(propertyType)
  const isHighRiseFamily = type === "High-Rise" || type === "Penthouse"
  const propGeneric = (type && PROPERTY_BANKS[type]) || []
  const marketType = bank && isHighRiseFamily ? bank.highRise : []

  const chosen: string[] = []
  const usedConcepts = new Set<string>()
  const addFrom = (candidates: string[]): void => {
    for (const c of candidates) {
      if (!c) continue
      const key = c.toLowerCase()
      const con = concept(c)
      if (usedConcepts.has(con) || chosen.some((x) => x.toLowerCase() === key)) continue
      chosen.push(c)
      usedConcepts.add(con)
      return
    }
  }

  addFrom([...(bank?.apartment ?? []), ...(bank?.general ?? [])]) // 1 market/apartment
  addFrom([...(bank?.locator ?? []), "#apartmentlocator"]) // 2 locator/service
  addFrom([...(bank?.movingTo ?? [])]) // 3 moving-to
  // 4 primary property — the slot that carries WHAT IT IS. For HIGH-RISE the market-specific term
  // (#dallashighrise) IS the strongest expression of that identity, so it leads. For PENTHOUSE it is
  // not: the market High-Rise term is a crossover, and with Downtown holding slot 5 it would push the
  // canonical #penthouse out of the five entirely — exactly what happened in Dallas/DFW/Houston. So
  // Penthouse leads with its OWN canonical tag and keeps the market High-Rise term as the fallback
  // (used only where the Penthouse bank is exhausted). Markets without a researched city High-Rise
  // term (San Antonio, Austin) are unaffected either way, since marketType is empty there.
  addFrom(type === "Penthouse" ? [...propGeneric, ...marketType] : [...marketType, ...propGeneric])
  if (isHighRiseFamily) {
    // 5 DOWNTOWN — PROMOTED from slot 6 so it survives the 5-tag cap for High-Rise/Penthouse, which
    // is where Downtown is the strongest discovery term. It displaces the old slot 5 (secondary
    // property / crossover), which for this family resolved to a SECOND generic market term while
    // slot 1 already carries one — so the set keeps market + locator + moving-to + property and
    // trades a duplicate-intent market tag for Downtown. Promotion happens INSIDE the ranking; no
    // tag is appended afterwards and MAX_HASHTAGS is never exceeded.
    addFrom([...(bank?.downtown ?? [])])
    addFrom([...propGeneric, ...(bank?.general ?? [])]) // 6 secondary property / crossover (was 5)
  } else {
    // Every other property type keeps the ORIGINAL slot order and therefore its exact current output.
    addFrom([...propGeneric, ...(bank?.general ?? [])]) // 5 secondary property / crossover
    addFrom([...(bank?.general ?? []), ...(bank?.apartment ?? [])]) // 6 extra strong market term
  }
  addFrom([...(bank?.general ?? []), ...propGeneric, ...marketType, ...(bank?.downtown ?? []), ...BASE]) // 7 additional

  // Backfill any remaining slots from the full relevant pool (keeps sets full without stuffing).
  const pool = [
    ...(bank?.apartment ?? []), ...(bank?.general ?? []), ...propGeneric, ...marketType,
    ...(bank?.downtown ?? []), ...(bank?.locator ?? []), ...(bank?.movingTo ?? []), ...BASE,
  ]
  for (const c of pool) {
    if (chosen.length >= cap) break
    addFrom([c])
  }
  return chosen.slice(0, cap)
}

// ── PLATFORM-AWARE CAPS ───────────────────────────────────────────────────────────────────────
// Social Beast PRODUCT limits per publishing destination — NOT platform API hard caps.
//
// Instagram is 5, the SAME number as MAX_HASHTAGS. That is the point: this used to read 7, which
// contradicted the canonical product rule two screens up and let the editor add two tags that
// generation would never produce. One rule, one number. YouTube keeps its own 7 because no
// YouTube publishing exists yet to have an opinion.
export const PLATFORM_HASHTAG_LIMIT: Record<string, number> = { instagram: MAX_HASHTAGS, tiktok: 5, youtube: 7 }

/** The hashtag cap for one platform id — the single server-side answer to "how many may be stored
 *  for this post?". Unknown/absent platform falls back to the canonical MAX_HASHTAGS rather than a
 *  looser per-route constant. */
export function hashtagLimitForPlatform(platform: string | null | undefined): number {
  const n = PLATFORM_HASHTAG_LIMIT[(platform ?? "").toLowerCase()]
  return typeof n === "number" ? n : MAX_HASHTAGS
}

/**
 * The editor hashtag cap for a set of selected destinations: the STRICTEST (smallest) limit among
 * them. Unknown platform ids are ignored; an empty/all-unknown selection falls back to `fallback`,
 * which is the canonical MAX_HASHTAGS — never a looser number, so a cleared selection can only
 * tighten the cap, never widen it. Pure and deterministic — existing tags over the cap are the
 * caller's concern (they are kept and flagged, never trimmed here).
 */
export function hashtagLimitFor(selected: Iterable<string>, fallback = MAX_HASHTAGS): number {
  const limits: number[] = []
  for (const id of selected) {
    const n = PLATFORM_HASHTAG_LIMIT[id]
    if (typeof n === "number") limits.push(n)
  }
  return limits.length ? Math.min(...limits) : fallback
}

/** Normalize a user-entered tag to a single #token (letters/digits/underscore). */
export function normalizeHashtag(raw: string): string {
  const t = (raw || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")
  return t ? `#${t}` : ""
}

// Reference: the markets the engine composes for (kept in sync with SOCIAL_MARKETS).
export const _SUPPORTED_MARKETS = SOCIAL_MARKETS
