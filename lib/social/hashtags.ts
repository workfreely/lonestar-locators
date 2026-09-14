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
import { normalizeToCanonical } from "@/lib/social/propertyTypes"

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

/** All market labels with a curated bank (for reference/UI). */
export const HASHTAG_MARKETS = Object.keys(MARKET_BANKS)

// Concept key: lowercase, strip leading # and ONE trailing 's', so a singular/plural pair collapses
// (#highrise ≡ #highrises, #townhome ≡ #townhomes) and we never waste a slot on both. Distinct
// concepts (#dallashighrise vs #highrise, #townhome vs #townhomeliving) are kept.
const concept = (t: string) => t.toLowerCase().replace(/^#+/, "").replace(/s$/, "")

/**
 * Build a BALANCED, deterministic set of up to `target` (max 7) hashtags for a market × property
 * type. Composition (each slot contributes the first still-unused, concept-unique candidate):
 *   1 strong market/apartment · 2 locator/service · 3 moving-to · 4 primary property (market-specific
 *   High-Rise term first) · 5 secondary property/crossover · 6 DOWNTOWN (guaranteed for High-Rise/
 *   Penthouse; otherwise another strong market term) · 7 additional ranked candidate. Remaining slots
 *   backfill from the pooled candidates. No duplicates; no singular/plural stuffing.
 */
export function buildHashtags(market: string | null | undefined, target = 7, propertyType?: string | null): string[] {
  const cap = Math.max(1, Math.min(7, target))
  const bank = MARKET_BANKS[normalizeSocialMarket(market)] as MarketBank | undefined
  const type = normalizeToCanonical(propertyType ?? null)
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
  addFrom([...marketType, ...propGeneric]) // 4 primary property (market-specific High-Rise first)
  addFrom([...propGeneric, ...(bank?.general ?? [])]) // 5 secondary property / crossover
  if (isHighRiseFamily) addFrom([...(bank?.downtown ?? [])]) // 6 DOWNTOWN — guaranteed for High-Rise/Penthouse
  else addFrom([...(bank?.general ?? []), ...(bank?.apartment ?? [])]) // 6 extra strong market term
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

/** Normalize a user-entered tag to a single #token (letters/digits/underscore). */
export function normalizeHashtag(raw: string): string {
  const t = (raw || "").trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")
  return t ? `#${t}` : ""
}

// Reference: the markets the engine composes for (kept in sync with SOCIAL_MARKETS).
export const _SUPPORTED_MARKETS = SOCIAL_MARKETS
