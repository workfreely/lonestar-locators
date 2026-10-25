import { amenityByLabel, MAX_RECOMMENDATION_AMENITIES } from "./recommendationAmenities"

/**
 * "WHY I CHOSE THIS FOR YOU" — three slots, stored as the strings they already were.
 *
 *   1. Distance        automatic, generated upstream from commute_minutes
 *   2. Bedrooms & Price  "2BR from $1,725/month"
 *   3. Amenities         "Private Yard + W/D Included"   (at most two)
 *
 * ── WHY STRINGS, AND NOT NEW COLUMNS ────────────────────────────────────────────────────────
 * lead_property_reasons.reasons is already a text array, and the live data already follows this
 * shape — every one of the 26 rows reads like ["19 min to Fort Sam", "W/D Included",
 * "Garage included"]. Structuring it in the database would mean a migration, a second source of
 * truth for one displayed line, and a conversion of free text that nobody asked for. So the
 * editor PARSES the strings on open and FORMATS them on save, and the storage never changes.
 *
 * ── THE RULE THAT PROTECTS EXISTING WORK ────────────────────────────────────────────────────
 * A line is claimed by a slot only when it matches that slot's shape EXACTLY. Anything else is
 * legacy: kept, shown, saved back untouched, and never coerced into a dropdown. "W/D inlcuded"
 * — a real typo in lead 84's saved data — stays exactly as typed, because guessing which amenity
 * a misspelling meant is precisely the "uncertain mapping" that must not be forced.
 *
 * The consequence worth stating: opening the editor on a legacy property and saving without
 * touching anything rewrites nothing. The round trip is lossless by construction, and a test
 * runs every real stored row through it to prove it.
 */

/** "19 min to Fort Sam" — generated upstream. The editor shows it and never edits it. */
const DISTANCE_RE = /^\d+\s*min\b/i

/** "2BR from $1,725/month" / "Studio from $1,200/month". */
const BED_PRICE_RE = /^(Studio|\d+BR)\s+from\s+\$([\d,]+(?:\.\d{2})?)\s*\/\s*month$/i

/** The separator between two amenities, matching the approved format. */
export const AMENITY_JOINER = " + "

/**
 * ── A HIGHLIGHT MAY BE TYPED, NOT ONLY PICKED ───────────────────────────────────────────────
 * Either of the two slots takes a standardized label OR a short phrase the locator writes. The
 * live data is why: agents were already typing "Spacious Closets", "Large Closets", "Great
 * Reviews" and "Washer and Dryer" into these lines by hand, because the point of this reason is
 * what the CLIENT asked for, which a fixed vocabulary cannot always say.
 *
 * The cap is TWO HIGHLIGHTS TOTAL, not two picks plus free text — both kinds live in the same
 * `amenities` array, so the limit is structural rather than enforced by a second rule.
 *
 * A TYPED PHRASE IS NOT A VERIFIED FEATURE, and nothing here pretends otherwise: it is text on
 * lead_property_reasons, it creates no attribute key, and it never reaches Property Intelligence.
 * Confirming the claim is the locator's job before they send the recommendation.
 */

/** Long enough for "Plenty of Natural Light" (23), short enough to stay one line on a card. */
export const MAX_HIGHLIGHT_LEN = 36
const MAX_HIGHLIGHT_WORDS = 5

/**
 * Cleans TYPED input only — never a stored line, which is preserved exactly as saved.
 *
 * Deliberately NOT lib/social's sanitizeCustomAmenity: that one strips "/", which would turn
 * "W/D Included" into "W D Included". Commas and semicolons go because the client-facing line
 * already uses its own separators; "+" goes because it is the joiner and a phrase containing one
 * would silently split into two highlights.
 */
export function sanitizeHighlight(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\n\r,;•|+]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_HIGHLIGHT_LEN)
}

/**
 * Could this stored line be a highlight the editor should offer back as a chip?
 *
 * The test is deliberately TIGHT. A line it accepts becomes editable in slot 3; a line it rejects
 * stays in "Previously saved reasons", untouched. Erring toward rejection is the safe direction —
 * a legacy sentence wrongly pulled into a two-slot control is the way a reason gets mangled.
 */
export function isHighlightShaped(line: string): boolean {
  const t = (line ?? "").trim()
  if (!t || t.length > MAX_HIGHLIGHT_LEN) return false
  if (t.split(/\s+/).length > MAX_HIGHLIGHT_WORDS) return false
  // Prose punctuation means a sentence, not a highlight.
  if (/[.!?,;:]/.test(t)) return false
  // Defensive: the other two slots own these shapes. A SECOND distance-shaped line must stay
  // legacy rather than being swallowed as a highlight, which "11 min to Fort Sam" otherwise is.
  if (DISTANCE_RE.test(t) || BED_PRICE_RE.test(t)) return false
  return true
}

/** True when a chip is typed wording rather than one of the standardized labels. */
export function isCustomHighlight(label: string): boolean {
  return !amenityByLabel(label)
}

export const BEDROOM_OPTIONS = [
  { value: "studio", label: "Studio", rentColumn: "studio_starting_rent" },
  { value: "1br", label: "1BR", rentColumn: "onebr_starting_rent" },
  { value: "2br", label: "2BR", rentColumn: "twobr_starting_rent" },
  { value: "3br", label: "3BR", rentColumn: "threebr_starting_rent" },
  { value: "4br", label: "4BR", rentColumn: "fourbr_starting_rent" },
  { value: "townhome", label: "Townhome", rentColumn: "townhome_starting_rent" },
  { value: "loft", label: "Loft", rentColumn: "loft_starting_rent" },
  { value: "penthouse", label: "Penthouse", rentColumn: "penthouse_starting_rent" },
] as const

export type BedroomValue = (typeof BEDROOM_OPTIONS)[number]["value"]

export type StructuredReasons = {
  /** Slot 1, read-only here. Null when no commute has been generated. */
  distance: string | null
  /** Slot 2. Either both are set, or the reason is omitted. */
  bedroom: BedroomValue | null
  price: string
  /** Slot 3 — labels, at most two. */
  amenities: string[]
  /** Everything a slot could not claim, kept verbatim and saved back. */
  legacy: string[]
  /** EXACTLY what was loaded. buildReasons returns this untouched when nothing changed — see
   *  the note on the dirty check there. Absent for a state the editor built from scratch. */
  original?: readonly string[]
}

const BY_LABEL = new Map(BEDROOM_OPTIONS.map((b) => [b.label.toLowerCase(), b]))

/** The Property Intelligence column holding this bedroom type's starting rent. */
export function rentColumnFor(bedroom: BedroomValue | null): string | null {
  return BEDROOM_OPTIONS.find((b) => b.value === bedroom)?.rentColumn ?? null
}

/** Digits only, so "$1,725" and "1725" and "1,725.00" all round-trip to the same line. */
function normalizePrice(raw: string): string {
  return (raw ?? "").replace(/[^0-9.]/g, "")
}

/** "1725" → "1,725". Presentation only; the stored line carries the formatted form. */
export function formatPrice(raw: string): string {
  const n = Number(normalizePrice(raw))
  if (!Number.isFinite(n) || n <= 0) return ""
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

/** Slot 2's line, or null when the price is not confirmed — the reason is simply omitted. */
export function formatBedroomPrice(bedroom: BedroomValue | null, price: string): string | null {
  const opt = BEDROOM_OPTIONS.find((b) => b.value === bedroom)
  const money = formatPrice(price)
  if (!opt || !money) return null
  return `${opt.label} from $${money}/month`
}

/** Slot 3's line, or null when nothing is selected. */
export function formatAmenities(labels: readonly string[]): string | null {
  const kept = labels.map((l) => (l ?? "").trim()).filter(Boolean).slice(0, MAX_RECOMMENDATION_AMENITIES)
  return kept.length ? kept.join(AMENITY_JOINER) : null
}

/**
 * Saved lines → the editor's state.
 *
 * Each line is offered to the slots in order and claimed by the FIRST that matches exactly;
 * unclaimed lines become `legacy`. A slot never claims twice, so a second distance-shaped line
 * (which should not exist) is preserved rather than silently dropped.
 */
export function parseReasons(reasons: readonly string[] | null | undefined): StructuredReasons {
  const out: StructuredReasons = {
    distance: null, bedroom: null, price: "", amenities: [], legacy: [],
    original: (reasons ?? []).map((r) => (r ?? "").trim()).filter(Boolean),
  }
  for (const raw of reasons ?? []) {
    const line = (raw ?? "").trim()
    if (!line) continue

    if (!out.distance && DISTANCE_RE.test(line)) { out.distance = line; continue }

    const bp = BED_PRICE_RE.exec(line)
    if (!out.bedroom && bp) {
      const opt = BY_LABEL.get(bp[1].toLowerCase())
      if (opt) { out.bedroom = opt.value; out.price = bp[2].replace(/,/g, ""); continue }
    }

    // An amenity line is claimed when every part is EITHER a known label or highlight-shaped
    // (short, unpunctuated, not one of the other slots' shapes). A part that is neither — a
    // sentence, a long note — sends the whole line to legacy, verbatim, because splitting it
    // would silently discard the part we could not name.
    // ACCUMULATES ACROSS LINES. Real rows store amenities as SEPARATE entries —
    // ["20 min…", "W/D Included", "Private Yard"] — so claiming only the first left the second
    // as legacy, and legacy sits after the generated lines. Add a price and the fourth line fell
    // off MAX_REASONS and was deleted on save. Both known labels now fill the one slot.
    if (out.amenities.length < MAX_RECOMMENDATION_AMENITIES) {
      const parts = line.split(AMENITY_JOINER).map((p) => p.trim()).filter(Boolean)
      const room = MAX_RECOMMENDATION_AMENITIES - out.amenities.length
      if (parts.length && parts.length <= room && parts.every((p) => amenityByLabel(p) || isHighlightShaped(p))) {
        // The part is kept AS TYPED, not swapped for the canonical label: "Walk-In Closets" is
        // a real stored value and rewriting its casing is a rewrite of the client's line. The
        // dropdown still resolves it to the right chip, because amenityByLabel ignores case.
        out.amenities = [...out.amenities, ...parts]
        continue
      }
    }

    out.legacy.push(line)
  }
  return out
}

/**
 * The editor's state → the lines to save, in the approved order.
 *
 * Legacy lines are appended, never dropped. A property whose reasons the editor could not parse
 * therefore saves back byte-identical as long as the locator did not change anything.
 */
export function buildReasons(s: StructuredReasons): string[] {
  // NOTHING UNTOUCHED IS REWRITTEN. Rebuilding from the slots necessarily emits them in the
  // approved order — distance, price, amenities, then whatever was left — and that reordering is
  // itself a change to stored data when the original happened to be ordered differently. A real
  // row proved it: ["20 min…", "W/D inlcuded", "Private Yard"] came back with the typo moved to
  // the end, because an unparseable line becomes legacy and legacy is appended.
  //
  // So when the state still describes exactly what was loaded, the loaded array is returned
  // verbatim. The reordering happens only once the locator actually changes something, which is
  // the moment the approved order is what they asked for.
  if (s.original) {
    const from = parseReasons(s.original)
    const same =
      from.distance === s.distance &&
      from.bedroom === s.bedroom &&
      from.price === s.price &&
      JSON.stringify(from.amenities) === JSON.stringify(s.amenities) &&
      JSON.stringify(from.legacy) === JSON.stringify(s.legacy)
    if (same) return [...s.original]
  }
  const lines: string[] = []
  if (s.distance?.trim()) lines.push(s.distance.trim())
  const bp = formatBedroomPrice(s.bedroom, s.price)
  if (bp) lines.push(bp)
  const am = formatAmenities(s.amenities)
  if (am) lines.push(am)
  for (const l of s.legacy) {
    const t = (l ?? "").trim()
    if (t && !lines.includes(t)) lines.push(t)
  }
  return lines
}

/**
 * How many lines this state would save, and what would not fit.
 *
 * The client page shows three and `save` used to slice to three — so a fourth line was not
 * merely hidden, it was DELETED. A locator adding Bedrooms & Price to a property that already
 * had a distance and two separate amenity lines would have lost one of them silently.
 *
 * Nothing truncates any more. The editor calls this, shows exactly which lines would not fit,
 * and refuses to save until the locator resolves it — which is the only honest way to spend a
 * limit that belongs to the client's card.
 */
export function reasonOverflow(s: StructuredReasons, max: number): { lines: string[]; dropped: string[] } {
  const lines = buildReasons(s)
  return { lines, dropped: lines.slice(max) }
}
