// Quick Match — the two curated tables behind the client-facing LOCATION line.
//
// This file answers exactly two questions, and nothing else:
//
//   1. Is this property VERIFIABLY inside the area the client asked for?   → AREA_ZIPS
//   2. If not, what point do we measure the drive to?                      → AREA_REFERENCE
//
// ZERO I/O and zero imports beyond the market catalogue, so the pure decisions stay testable
// without a network or a database, exactly like lib/leads/locationHighlight.ts.
//
// ── WHY AN EXPLICIT TABLE AND NOT A RULE ────────────────────────────────────────────────────
// Same reasoning as lib/propertyExplorer/areaAliases.ts, which this file deliberately imitates
// rather than extends (extending it would mean editing an Unleash Beast file). Every entry below
// was read, measured and reviewed one at a time. Matching is EXACT EQUALITY after normalisation:
// a property qualifies because its ZIP is on a list a person approved, never because a filter
// decided it was close enough. There is no filter to get wrong.
//
// ── WHY BOTH TABLES ARE MARKET-SCOPED ───────────────────────────────────────────────────────
// "Medical Center" names a district in San Antonio AND in Houston. An unscoped reference table
// would route a Houston client's drive time to a San Antonio hospital — a wrong answer that
// looks like a right one. So both tables are keyed by market display name first, which is what
// `leads.city` stores and what getMarketByName already resolves. An area this file has never
// heard of produces null, and the caller leaves the highlight editable.
//
// ── WHAT A DRIVE TIME HERE MEASURES ─────────────────────────────────────────────────────────
// A district is not a point. "Medical Center" is roughly 900 acres, so any single destination is
// a representative point, not the whole area — and each one below was chosen as the closest
// VERIFIED institution to the same centroid Quick Match's own bands are measured from
// (lib/markets/catalog.ts), so the drive time and the band describe the same place:
//
//     Medical Center   University Health University Hospital   0.10 mi from the centroid
//     Westover Hills   Westover Sports Complex                 1.19 mi from the centroid
//
// This is the compromise the shipped commute feature already makes: it routes to ONE place_id
// for "Joint Base San Antonio: Fort Sam Houston" — a ~3,000-acre base — and renders it as
// "12 min to Fort Sam". The stored figure records which reference produced it: every minute is
// cached as a property_landmark_metrics row carrying that landmark's id, so the provenance of a
// number is a row in the database and not a comment in a file.
//
// Google's own neighbourhood Place IDs were audited and rejected for both of these areas:
// "Westover Hills" resolves to a street (types: route) and the Medical Center district resolves
// to two different same-named hospitals 0.6 mi apart. Hence a curated reference point.

/** Normalisation IDENTICAL to areaAliases.ts, so the two tables can never disagree about
 *  whether two spellings of an area are the same area. */
const norm = (v: string): string =>
  v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

/**
 * market display name → client area label → the ZIPs that are VERIFIABLY inside that area.
 *
 * Deliberately narrow. A ZIP belongs here only when the whole ZIP is inside the area as a
 * renter would understand it, because the only thing this table is allowed to produce is the
 * membership claim "Located in …". Where a ZIP straddles an edge it is left out and the property
 * falls through to a measured drive time, which is true either way.
 *
 * 78229 is the South Texas Medical Center ZIP. 78251 is Westover Hills.
 */
const AREA_ZIPS: Record<string, Record<string, string[]>> = {
  "San Antonio": {
    "Medical Center": ["78229"],
    "Westover Hills": ["78251"],
  },
}

/** A verified point that represents a requested area well enough to measure a drive to. */
export type AreaReference = {
  /** The curated `location_landmarks.name`, which is how the row is found. */
  landmarkName: string
  /** The verified Google place_id, passed straight to driveTimesToAnchor. */
  placeId: string
  /** What the drive time measures, for the release record and for a locator reading the code. */
  measures: string
}

/**
 * market display name → client area label → the approved reference point.
 *
 * Both entries are landmarks that already exist in `location_landmarks` with a RESOLVED
 * place_id, so a drive time reuses curated, verified data rather than a fresh lookup.
 */
const AREA_REFERENCE: Record<string, Record<string, AreaReference>> = {
  "San Antonio": {
    "Medical Center": {
      landmarkName: "University Hospital",
      placeId: "ChIJVSW2JPldXIYR5YQfQaiWYC0",
      measures: "drive time to University Health University Hospital, 4502 Medical Dr — 0.10 mi from the Medical Center centroid",
    },
    "Westover Hills": {
      landmarkName: "Westover Sports Complex",
      placeId: "ChIJy3zdzKxDXIYR8paHAk340-4",
      measures: "drive time to Westover Sports Complex, 9340 Westover Hills Blvd — 1.19 mi from the Westover Hills centroid",
    },
  },
}

/**
 * Is this property verifiably inside the area the client asked for?
 *
 * FAIL-CLOSED in every uncertain case: an unknown market, an unlisted area, a property with no
 * ZIP on record, or a ZIP that is simply not on the list all return false. False does not mean
 * "outside" — it means "not proven inside", and the caller's answer to that is a measured drive
 * time or an editable slot, never a hedge.
 */
export function isVerifiedInArea(
  market: string | null | undefined,
  areaLabel: string | null | undefined,
  propertyZip: string | null | undefined,
): boolean {
  const zip = String(propertyZip ?? "").trim()
  if (!/^\d{5}$/.test(zip)) return false
  const byArea = AREA_ZIPS[String(market ?? "").trim()]
  if (!byArea) return false
  const wanted = norm(String(areaLabel ?? ""))
  if (!wanted) return false
  for (const [label, zips] of Object.entries(byArea)) {
    if (norm(label) === wanted) return zips.includes(zip)
  }
  return false
}

/**
 * The approved reference point for a requested area, or null when there is no approved one.
 *
 * Null is the honest answer for every area nobody has reviewed, and it is what keeps this
 * feature from inventing a destination: no reference point, no drive time, slot stays editable.
 */
export function referenceForArea(
  market: string | null | undefined,
  areaLabel: string | null | undefined,
): AreaReference | null {
  const byArea = AREA_REFERENCE[String(market ?? "").trim()]
  if (!byArea) return null
  const wanted = norm(String(areaLabel ?? ""))
  if (!wanted) return null
  for (const [label, ref] of Object.entries(byArea)) {
    if (norm(label) === wanted) return ref
  }
  return null
}

/** The editor's per-reason cap (components/crm/ReasonsControl.tsx maxLength). A line longer
 *  than this could be stored but not re-typed, so it is not written at all. */
const MAX_LEN = 40

/**
 * "11 min to Medical Center" — the drive-time location line.
 *
 * THE CLIENT'S OWN AREA LABEL, not the landmark's name, for two reasons. It answers the question
 * she actually asked ("how convenient is this to Medical Center?"), and the landmark names do not
 * fit: "14 min to Methodist Hospital Westover Hills" is 43 characters against a 40-character
 * editor cap, so a locator could not re-type it. The reference point is recorded in the cache
 * row instead, where it cannot be truncated.
 *
 * Returns null for a non-positive or non-finite figure — Routes found no drivable route, and no
 * number is better than "0 min".
 */
export function areaDriveTimeText(
  minutes: number | null | undefined,
  areaLabel: string | null | undefined,
): string | null {
  const area = String(areaLabel ?? "").trim()
  if (!area) return null
  if (area.toUpperCase().startsWith("ZIP ")) return null
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null
  const text = `${Math.round(minutes)} min to ${area}`
  return text.length <= MAX_LEN ? text : null
}
