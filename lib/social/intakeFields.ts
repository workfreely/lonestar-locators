// Social Beast — shared helpers for the two INTAKE surfaces (Upload Video, Bulk Review).
//
// Both write the same social_content columns the Post Editor later edits, so they must offer the
// same vocabularies. Everything here either reuses an existing canonical source or encodes a rule
// that was previously missing; nothing introduces a second list.

import { getMarketByName } from "@/lib/markets/catalog"

// ── FILENAME PLAUSIBILITY ────────────────────────────────────────────────────────────────────
// Upload prefills Property / Building Name from the filename. That is genuinely useful for
// "Alaro Luxury Villas - Dallas.mov" and actively harmful for a camera/export name: a UUID or hash
// became a "property name", so the field arrived pre-filled with garbage the operator had to clear
// before the property search was usable.
//
// The guard asks one question — does this look like something a human named a building? — and when
// the answer is no the field is simply left blank, so the "Search existing property or type…"
// placeholder shows and the search is immediately usable. Market/type inference is unaffected.

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
const VOWEL_RE = /[aeiouy]/i
/** Camera/screen-capture prefixes that are never a building name. */
const DEVICE_PREFIX_RE = /^(img|dsc|dscn|mov|vid|mvi|gopr|pxl|rpreplay|screenrecording|screenshot|video|clip|final)$/i

/**
 * Does this parsed filename read as a real property name?
 *
 * The test is deliberately built from NEGATIVE signals — "is this provably machine junk?" — rather
 * than demanding positive evidence of a word. An earlier draft required a pure-alphabetic word and
 * rejected "1400HiLine" and "3700M", which are real buildings in the library. Blanking a correct
 * name is a worse failure than letting one odd string through, because the operator sees an empty
 * field and assumes inference is broken.
 */
export function isPlausiblePropertyName(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim()
  if (s.length < 3) return false

  const compact = s.replace(/[\s\-_]/g, "")
  if (!/[a-z]/i.test(compact)) return false            // digits only — never a name
  if (UUID_RE.test(compact)) return false              // "4C2A1F8E-9B7D-…" in any spacing
  // A long unbroken hex run is a hash. 12 clears real names like "Residences" (10) while catching
  // the 32-char md5-style names exporters produce ("212b44d5565644509ce5e4f2c2a5c82a").
  if (compact.length >= 12 && /^[0-9a-f]+$/i.test(compact)) return false
  // A very long run with no word break is a machine id even when it is not pure hex.
  if (compact.length >= 20 && !/[\s\-_]/.test(s)) return false

  // Judge each word on its own and reject only when NOTHING substantive is left. Testing the whole
  // string at once let a device prefix vouch for the junk beside it: "RPReplay Final1759650000"
  // passed because "RPReplay" is pronounceable, and "IMG 4C2A1F8E 9B7D" passed because its digit
  // ratio stayed under the threshold.
  const words = s.split(/[\s\-_]+/).filter(Boolean)
  const substantive = words.filter((w) => {
    const runs = w.match(/[a-z]+/gi) ?? []
    // A device prefix contributes nothing, whether it stands alone ("IMG") or is fused to a
    // timestamp ("Final1759650000"). Digit-only words contribute nothing either.
    const meaningful = runs.filter((run) => !DEVICE_PREFIX_RE.test(run))
    if (meaningful.length === 0) return false
    // A hex group with no pronounceable run is a machine token: "4C2A1F8E", "9B7D". A letter run of
    // 3+ with a vowel is what makes something pronounceable — "HiLine" in "1400HiLine" qualifies.
    const pronounceable = meaningful.some((run) => run.length >= 3 && VOWEL_RE.test(run))
    if (/^[0-9a-f]+$/i.test(w) && w.length >= 4 && !pronounceable) return false
    return true
  })
  if (substantive.length === 0) return false

  // Digit-dominated and unpronounceable overall is a counter ("20261005 142233"). The length floor
  // exempts genuinely short names like "3700M", which are digit-heavy but real.
  const digits = (s.match(/\d/g) ?? []).length
  const anyPronounceable = words.some((w) =>
    (w.match(/[a-z]+/gi) ?? []).some((run) => run.length >= 3 && VOWEL_RE.test(run)))
  if (s.length >= 8 && digits / s.length >= 0.5 && !anyPronounceable) return false

  return true
}

/** The prefill value for Property / Building Name — the inferred name, or "" when implausible. */
export function propertyNamePrefill(inferred: string | null | undefined): string {
  return isPlausiblePropertyName(inferred) ? (inferred ?? "").trim() : ""
}

// ── AREA / NEIGHBOURHOOD OPTIONS ─────────────────────────────────────────────────────────────
// The CANONICAL bank is lib/markets/catalog.ts — the same `neighborhoods` and `submarkets` the
// Smart Lead Form's LocationPicker reads via getMarketByName. Social Beast stores ONE free-text
// area_neighborhood value rather than the lead form's two capped CSV columns, so this reuses the
// DATA and not that widget; forcing the multi-select widget onto a single-value column would be a
// shape mismatch, and copying its options into a new array would be the duplicate list we must not
// create.

export type AreaOptions = { neighborhoods: string[]; submarkets: string[] }

/** Both canonical groups for a market NAME ("San Antonio"), kept separate so the picker can label
 *  them. Unknown/empty market → empty groups, which is what disables the control. */
export function areaOptionsForMarket(market: string | null | undefined): AreaOptions {
  const m = getMarketByName((market ?? "").trim())
  return { neighborhoods: m?.neighborhoods ?? [], submarkets: m?.submarkets ?? [] }
}

/** Is this value one of the market's canonical options? */
export function isCanonicalArea(market: string | null | undefined, value: string | null | undefined): boolean {
  const v = (value ?? "").trim()
  if (!v) return false
  const { neighborhoods, submarkets } = areaOptionsForMarket(market)
  return neighborhoods.includes(v) || submarkets.includes(v)
}

/**
 * A stored value that is NOT in the current market's bank must still be selectable, or switching
 * markets would silently delete it. The picker renders this as an extra option so the value stays
 * visible, stays stored, and stays the user's to change.
 */
export function preservedAreaValue(market: string | null | undefined, value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  return v && !isCanonicalArea(market, v) ? v : null
}

// ── DISTRICT OPTIONS ─────────────────────────────────────────────────────────────────────────
// The FOURTH geographic layer, read from the SAME canonical market catalog as the area bank
// above — `districts` on the Market entry. No second list, no parallel source of truth.
//
// WHY THIS LAYER EXISTS: verified research keeps producing properties where two names are both
// accurate and only one field existed to hold them — Atelier Dallas is in Downtown Dallas AND the
// Arts District; Tin Top Flats is in Midtown San Antonio AND Tobin Hill. area_neighborhood keeps
// the broader one, district takes the specific one, and neither has to win.
//
// EVERY MARKET'S BANK IS EMPTY TODAY, deliberately. `districts` is optional on Market and is not
// populated anywhere, so the picker degrades to free text until verified district names are
// approved market by market. An empty bank is the correct state, not a missing one — it is what
// stops the field asserting a vocabulary nobody has reviewed.

/** The district bank for a market NAME ("Dallas"). Empty when the market carries none. */
export function districtOptionsForMarket(market: string | null | undefined): string[] {
  const m = getMarketByName((market ?? "").trim())
  return m?.districts ?? []
}

/** Is this value one of the market's canonical districts? */
export function isCanonicalDistrict(market: string | null | undefined, value: string | null | undefined): boolean {
  const v = (value ?? "").trim()
  if (!v) return false
  return districtOptionsForMarket(market).includes(v)
}

/**
 * A stored district the current market's bank does not contain — rendered as its own option so a
 * market switch cannot silently delete it. Identical guarantee to preservedAreaValue; with every
 * bank empty today this is the path EVERY stored district takes.
 */
export function preservedDistrictValue(market: string | null | undefined, value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  return v && !isCanonicalDistrict(market, v) ? v : null
}
