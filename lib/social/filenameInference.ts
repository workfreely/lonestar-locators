// Social Autopilot — conservative, deterministic filename → metadata inference. SHARED by the
// single-video setup and bulk intake (one code path, never two). Produces EDITABLE SUGGESTIONS
// only; it never pretends confidence when the filename lacks information (e.g. IMG_3847.mp4).
//
// Example: "collection-at-schertz-townhomes-san-antonio.MP4"
//   → propertyName "Collection at Schertz Townhomes", market "San Antonio", type "Townhome"
import { SOCIAL_MARKETS, normalizeSocialMarket } from "@/lib/social/markets"
import { detectPropertyType, type PropertyType } from "@/lib/social/propertyTypes"

export type InferenceConfidence = "ready" | "review" | "missing"
export type FilenameInference = {
  propertyName: string | null
  market: string | null // one of SOCIAL_MARKETS, or null
  propertyType: PropertyType | null
  confidence: InferenceConfidence
}

const SMALL_WORDS = new Set(["at", "of", "the", "and", "in", "on", "by", "for", "to", "a", "an"])
// Market phrases to strip from the property name, mapped to the SA label (Dallas ≠ DFW).
const MARKET_PHRASES: [RegExp, string][] = [
  [/\bsan\s?antonio\b/i, "San Antonio"],
  [/\bfort\s?worth\b/i, "DFW"],
  [/\bdfw\b/i, "DFW"],
  [/\bdallas\b/i, "Dallas"],
  [/\bhouston\b/i, "Houston"],
  [/\baustin\b/i, "Austin"],
]
// Generic camera/export filenames that carry NO real property info.
const GENERIC = /^(img|dji|dsc|vid|mov|movie|clip|video|final|export|render|reel|gopro|iphone|screen[\s-]?recording)[\s_-]*\d*[a-z]?$/i

/** The locality/city from a formatted place address ("…, Schertz, TX 78154, USA" → "Schertz"),
 *  or null. Used to SUGGEST Area/Neighborhood from a matched property — no extra Places flow. */
export function localityFromAddress(address: string | null | undefined): string | null {
  const m = (address ?? "").match(/(?:^|,)\s*([A-Za-z][A-Za-z .'-]+?),\s*[A-Z]{2}\b/)
  return m ? m[1].trim() : null
}

/** Suggested Area/Neighborhood from a matched place address, EXCLUDING the case where it just
 *  duplicates the Market (avoids "Schertz San Antonio Schertz"-style redundancy). "" when none
 *  or when it equals the market. Never fabricates — derived only from the address. */
export function suggestArea(address: string | null | undefined, market: string | null | undefined): string {
  const loc = localityFromAddress(address)
  if (!loc) return ""
  const m = (market ?? "").trim().toLowerCase()
  if (loc.toLowerCase() === m) return ""
  if (normalizeSocialMarket(loc).toLowerCase() === m) return ""
  return loc
}

/** Detect an SA-taxonomy market anywhere in free text (filename or a place address).
 *  Fort Worth → DFW; Dallas stays Dallas (distinct). Null when none present. */
export function detectMarket(text: string): string | null {
  const t = ` ${(text || "").toLowerCase()} `
  for (const [re, label] of MARKET_PHRASES) {
    if (re.test(t)) {
      const m = normalizeSocialMarket(label)
      return SOCIAL_MARKETS.includes(m) ? m : null
    }
  }
  return null
}

function normalize(name: string): string {
  return name
    .replace(/\.[^.]+$/, "") // drop extension
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function titleCase(text: string): string {
  const words = text.split(" ").filter(Boolean)
  return words
    .map((w, i) => {
      const lower = w.toLowerCase()
      // Preserve acronyms / numbers / already-mixed-case tokens.
      if (/\d/.test(w) || (w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w))) return w
      if (i > 0 && SMALL_WORDS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(" ")
}

export function inferFromFilename(filename: string): FilenameInference {
  const norm = normalize(filename || "")
  if (!norm) return { propertyName: null, market: null, propertyType: null, confidence: "missing" }

  // Market: first phrase that matches; strip it from the name text.
  let market: string | null = null
  let nameText = norm
  for (const [re, label] of MARKET_PHRASES) {
    if (re.test(norm)) {
      market = normalizeSocialMarket(label)
      nameText = nameText.replace(re, " ").replace(/\s+/g, " ").trim()
      break
    }
  }
  // Guard: only accept a market that's in the SA taxonomy.
  if (market && !SOCIAL_MARKETS.includes(market)) market = null

  const propertyType = detectPropertyType(norm)

  // Property name = the remaining text, title-cased — UNLESS it's a generic camera filename or
  // has no meaningful words (then we don't invent a name).
  const meaningful = nameText.split(" ").filter((w) => w.length >= 2 && !GENERIC.test(w))
  const isGeneric = GENERIC.test(nameText) || meaningful.length === 0
  const propertyName = isGeneric ? null : titleCase(nameText)

  // Confidence: Ready = property name + market both present; Review = one of them; Missing = neither.
  const confidence: InferenceConfidence = propertyName && market ? "ready" : propertyName || market ? "review" : "missing"
  return { propertyName, market, propertyType, confidence }
}
