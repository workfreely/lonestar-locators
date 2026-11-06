// Quick Match — WHERE the client wants to live, which is asked before anything else.
//
// ── WHY GEOGRAPHY RUNS FIRST, AND WHAT "FIRST" MEANS ────────────────────────────────────────
// A renter's location requirement is not a preference to be traded against screening data. A
// property on the wrong side of a 500-square-mile metro is not a match however well it screens,
// so geography is a GATE: it chooses the pool, and a curated property beyond the outer band is
// not recommended at all. Before this existed, location contributed a 40-point nudge that no
// client on file could even trigger, and an Alamo Ranch client was shown Universal City.
//
// Within that pool, screening compatibility decides the order — "search the area, then evaluate
// screening compatibility" — and the band orders properties of equal screening standing. The
// note on GEO_WEIGHT records the measurement that settled which way round those two go.
//
// ── EVERY ANCHOR IS MEASURED, NONE IS INVENTED ──────────────────────────────────────────────
// Three kinds of anchor, and each one is either real or absent:
//
//   1. the DESTINATION ZIP from Edit Client Profile. An exact ZIP match is its own band — the
//      strongest geographic statement available, because it is the one the agent typed for
//      exactly this purpose. Failing that, a ZIP found in an UNANCHORED Commute / Destination
//      box, used as a hint and never as a travel time — see commuteHintZip. Neither is the
//      client's residential address, which Quick Match does not read at all.
//   2. the client's NAMED AREAS, resolved by resolveAreaAnchors against the shared market
//      centroid catalogue. A label with no catalogued centroid is DROPPED, never replaced by a
//      downtown or market center, so an unrecognised area produces no anchor rather than a
//      wrong one. Unleash resolves its own search centers from that same catalogue, through its
//      own untouched function.
//   3. a CENTROID FOR THE DESTINATION ZIP, averaged over the curated properties that are
//      actually in that ZIP. This is measured from real addresses in the catalogue, not from a
//      ZIP-boundary table we do not have, and it exists only when at least one member is in the
//      ZIP. It is what lets a destination ZIP rank "nearby" properties and not only exact hits.
//
// There is deliberately NO name→ZIP table and no geocoding here. A named area reaches the
// comparison as a catalogued centroid or it does not reach it at all.
//
// ── WHAT HAPPENS WHEN THERE IS NO ANCHOR AT ALL ─────────────────────────────────────────────
// Geography then simply is not a criterion: `applicable` is false, every property scores the
// same on it, and screening decides the order. A client who named no area has not stated a
// requirement, so inventing one — or recommending nothing — would both be wrong. What does NOT
// happen is a property being credited with a location fit nobody established.
import { metresBetween, type LatLng } from "@/lib/propertyExplorer/commuteMode"
import { composeDesiredAreas, MAX_UNLEASH_AREAS } from "@/lib/propertyExplorer/multiArea"
import { centerForDesiredArea, getMarketByName } from "@/lib/markets/catalog"
import type { QuickMatchProperty } from "./types"

const METRES_PER_MILE = 1609.344

/** A resolved area, WITH the label it resolved from. */
export type AreaAnchor = { label: string; lat: number; lng: number }

/**
 * Resolve the client's comma-joined desired areas to LABELLED centroids, market-aware and
 * capped at the form's 1–3 limit.
 *
 * ── WHY THIS LIVES IN QUICK MATCH ──────────────────────────────────────────────────────────
 * Unleash's resolveDesiredAreaCenters returns coordinates without their labels, and "about two
 * miles from Stone Oak" needs the label that produced the centroid. An earlier draft widened
 * that Unleash function to carry labels; widening it meant editing an Unleash Beast file, so it
 * was reverted and the resolution lives here instead.
 *
 * The rules are deliberately identical to Unleash's, and both read the SAME source of truth —
 * centerForDesiredArea in the shared market catalogue — so the two cannot disagree about which
 * areas exist or where they are:
 *   • resolve each label in order and cap the RESULT at `max`, not the raw label list;
 *   • a label with no catalogued centroid is DROPPED and consumes no slot (which is what makes
 *     the form's own "All of {City}" catch-all cost nothing);
 *   • never fall back to a market or downtown center — an unrecognised area must produce no
 *     anchor rather than a wrong one.
 */
export function resolveAreaAnchors(
  desiredAreas: string | null | undefined,
  marketSlug: string | null | undefined,
  max: number = MAX_UNLEASH_AREAS,
): AreaAnchor[] {
  const labels = (desiredAreas ?? "").split(",").map((t) => t.trim()).filter(Boolean)
  const out: AreaAnchor[] = []
  for (const label of labels) {
    if (out.length >= max) break
    const c = centerForDesiredArea(label, marketSlug)
    if (c) out.push({ label, lat: c.lat, lng: c.lng })
  }
  return out
}

/**
 * A ZIP typed into the Commute / Destination box, when that destination is NOT Google-anchored.
 *
 * `commute_anchor_place_id` is the canonical routable destination. When it is set, the box holds
 * a real Google place and this returns null: the anchored destination is left exactly as it is,
 * and the drive to it keeps coming from a Routes estimate, which is the only thing allowed to
 * state a travel time. Nothing in this file produces one — a ZIP is a place, not a drive.
 *
 * Unanchored destinations are what the office typed before anchoring existed: one client on file
 * has "78254" in this box, another has "Alamo Heights". A five-digit ZIP is a geographic
 * statement that can be measured, so it is used as a HINT. A place name is not, because deciding
 * which "Alamo Heights" was meant would be a guess.
 */
export function commuteHintZip(
  anchorPlaceId: string | null | undefined,
  destinationLabel: string | null | undefined,
): string | null {
  if (typeof anchorPlaceId === "string" && anchorPlaceId.trim() !== "") return null
  const text = String(destinationLabel ?? "").trim()
  if (text === "") return null
  const found = [...text.matchAll(/\b\d{5}\b/g)]
  const last = found[found.length - 1]
  if (!last || last.index === undefined) return null
  // A five-digit number at the START with words after it is a street number — "12345 Main St" is
  // an address, not a ZIP. A bare "78254" is also at the start, with nothing after it.
  if (last.index === 0 && text.length > 5) return null
  return last[0]
}

/**
 * The bands, in miles from the nearest anchor.
 *
 * These are San Antonio-scale distances, chosen against the real collection: the audit of the
 * ten eligible clients on file shows 2–11 curated properties within 3 miles of a named area,
 * 3–25 within 6 and 9–51 within 12. So `nearby` is wide enough to fill six slots for a client
 * anywhere in the metro, and still narrow enough that a client who asked for Alamo Ranch is not
 * sent to Universal City 25 miles across town.
 *
 * `nearby` is also the OUTER BOUND of automatic recommendation: a property further than this
 * from everywhere the client named is contrary to a requirement the client stated, and is left
 * out with that reason recorded rather than ranked last.
 */
export const GEO_BAND_MILES = { in_area: 3, adjacent: 6, nearby: 12 } as const

export type GeoBand = "destination_zip" | "in_area" | "adjacent" | "nearby"

/**
 * Ordering weights WITHIN a screening tier.
 *
 * Geography's real force is the GATE, not the sort: a property beyond `nearby` is not
 * recommended at all. Inside the pool the band then orders properties of equal screening
 * standing, and the band range (90,000) is deliberately smaller than the gap between screening
 * tiers (300,000) and far larger than every housing term together (hundreds).
 *
 * That ordering was measured, not assumed. Ranking by band ABOVE screening tier was tried first
 * and rejected on the real data: one credit-challenged client had eight curated properties whose
 * stated credit minimums they meet, and band-first ordering replaced all eight with six
 * properties that have no policy on record at all, because they sat one mile closer. For a
 * credit-challenged renter that is the wrong trade — the agent's problem is approval — and
 * "search the area, THEN evaluate screening compatibility" is a pool followed by an assessment,
 * which is what this is.
 */
export const GEO_WEIGHT: Record<GeoBand, number> = {
  destination_zip: 90_000,
  in_area: 60_000,
  adjacent: 30_000,
  nearby: 10_000,
}

export type ClientGeography = {
  /** The five-digit destination ZIP, or null. */
  destinationZip: string | null
  /**
   * WHERE that ZIP came from, which is never the client's own address.
   *   "destination_zip"      — the Edit Client Profile field, added for exactly this.
   *   "commute_destination"  — a ZIP found in an UNANCHORED Commute / Destination box.
   * The band is the same either way, because the measurement is the same: the property is in
   * that ZIP or it is not. The source is carried so the agent-facing sentence can say which
   * field it read, and so neither is ever reported as the other.
   */
  zipSource: "destination_zip" | "commute_destination" | null
  /** Resolved anchors — named-area centroids, plus a derived centroid for the destination ZIP. */
  anchors: AreaAnchor[]
  /** Labels the client named that have no catalogued centroid. Reported, never guessed at. */
  unresolvedAreas: string[]
  /** The market the labels were resolved against, from `leads.city`. */
  marketSlug: string | null
  /** Is there anything to compare a property against? */
  applicable: boolean
}

export type GeoFit = {
  /** The band, or null when the client stated a location and this property is outside all of
   *  them — which is an exclusion, not a low score. Also null when `applicable` is false. */
  band: GeoBand | null
  applicable: boolean
  miles: number | null
  anchorLabel: string | null
  /** Agent-facing, for the recommendation's reasons. */
  reason: string | null
  /** Agent-facing, for the exclusion report. */
  outsideReason: string | null
}

/** A five-digit US ZIP, or null. The same shape `leads_destination_zip_format` enforces. */
export const fiveDigitZip = (v: unknown): string | null => {
  const t = String(v ?? "").trim()
  return /^[0-9]{5}$/.test(t) ? t : null
}

const miles = (m: number): number => m / METRES_PER_MILE
const say = (n: number): string => (n < 1 ? "under a mile" : `about ${n.toFixed(n < 10 ? 1 : 0)} miles`)

const coords = (p: QuickMatchProperty): LatLng | null =>
  p.latitude !== null && p.longitude !== null ? { lat: p.latitude, lng: p.longitude } : null

/**
 * A centroid for one ZIP, averaged over the curated properties in it.
 *
 * Measured, not assumed: it is the mean position of real catalogued addresses carrying that ZIP.
 * With no member in the ZIP there is no anchor, and the destination ZIP then qualifies exact
 * matches only — which is honest about what we can and cannot measure.
 */
export function zipAnchor(properties: QuickMatchProperty[], zip: string | null): AreaAnchor | null {
  if (!zip) return null
  const pts = properties.filter((p) => p.zip === zip).map(coords).filter((c): c is LatLng => c !== null)
  if (pts.length === 0) return null
  return {
    label: `ZIP ${zip}`,
    lat: pts.reduce((s, c) => s + c.lat, 0) / pts.length,
    lng: pts.reduce((s, c) => s + c.lng, 0) / pts.length,
  }
}

/**
 * Read the client's geographic requirement off the lead row.
 *
 * `properties` is passed only so the destination ZIP can be given a measured centroid; no
 * property influences which areas the client asked for.
 */
export function resolveClientGeography(
  lead: Record<string, unknown> | null | undefined,
  properties: QuickMatchProperty[] = [],
): ClientGeography {
  const l = lead ?? {}
  const str = (k: string): string | null => {
    const v = l[k]
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null
  }

  // The destination ZIP the agent typed for this purpose, and only that: `leads` has no
  // residential ZIP column, and the client's own address is not read here or anywhere in Quick
  // Match. "Where they want to BE, not where they live now" is the column's own comment.
  const typedZip = fiveDigitZip(l["destination_zip"])
  // Second best, and only when the first is absent: a ZIP in an unanchored commute destination.
  const hintZip = typedZip
    ? null
    : commuteHintZip(str("commute_anchor_place_id"), str("commute_anchor_label"))
  const destinationZip = typedZip ?? hintZip
  const zipSource: ClientGeography["zipSource"] =
    typedZip ? "destination_zip" : hintZip ? "commute_destination" : null
  // `leads.city` stores the market's DISPLAY NAME, which is how every other surface resolves it.
  const marketSlug = getMarketByName(str("city") ?? "")?.slug ?? null

  const desired = composeDesiredAreas(str("neighborhoods"), str("submarkets"))
  const labels = desired.split(",").map((s) => s.trim()).filter(Boolean)
  const areaAnchors = resolveAreaAnchors(desired, marketSlug, MAX_UNLEASH_AREAS)
  const resolvedLabels = new Set(areaAnchors.map((a) => a.label.toLowerCase()))
  // Only the labels that were REACHED can be called unresolved: beyond MAX_UNLEASH_AREAS the
  // cap stopped the loop, which is not the same as having no centroid.
  const unresolvedAreas = areaAnchors.length < MAX_UNLEASH_AREAS
    ? labels.filter((x) => !resolvedLabels.has(x.toLowerCase()))
    : []

  const zAnchor = zipAnchor(properties, destinationZip)
  const anchors = zAnchor ? [zAnchor, ...areaAnchors] : areaAnchors

  return {
    destinationZip,
    zipSource,
    anchors,
    unresolvedAreas,
    marketSlug,
    // An exact-ZIP comparison needs no centroid, so a destination ZIP on its own is enough to
    // make geography a criterion.
    applicable: anchors.length > 0 || destinationZip !== null,
  }
}

/** Where does this property sit relative to what the client asked for? */
export function assessGeography(property: QuickMatchProperty, geo: ClientGeography): GeoFit {
  const none: GeoFit = {
    band: null, applicable: false, miles: null, anchorLabel: null, reason: null, outsideReason: null,
  }
  if (!geo.applicable) return none

  // 1. The destination ZIP, exactly. The strongest statement we hold.
  if (geo.destinationZip && property.zip === geo.destinationZip) {
    return {
      band: "destination_zip", applicable: true, miles: null, anchorLabel: `ZIP ${geo.destinationZip}`,
      reason: geo.zipSource === "commute_destination"
        ? `In ZIP ${geo.destinationZip}, the ZIP in the client's commute destination`
        : `In the requested destination ZIP ${geo.destinationZip}`,
      outsideReason: null,
    }
  }

  const here = coords(property)
  if (!here) {
    // 0 of the 68 current members, and still not treated as a fit: an unmeasurable distance is
    // not a near one. Recorded with its own reason so a gap in the catalogue reads as a gap.
    return {
      band: null, applicable: true, miles: null, anchorLabel: null, reason: null,
      outsideReason: "No coordinates on record, so its distance from the client's areas could not be measured",
    }
  }
  if (geo.anchors.length === 0) {
    return {
      band: null, applicable: true, miles: null, anchorLabel: null, reason: null,
      outsideReason: `Not in ZIP ${geo.destinationZip}, and no curated property is in that ZIP to measure distance from`,
    }
  }

  // 2. The nearest anchor wins. A client who named three areas is served by whichever of them
  //    this property is closest to; the others are not held against it.
  let best: { a: AreaAnchor; mi: number } | null = null
  for (const a of geo.anchors) {
    const mi = miles(metresBetween({ lat: a.lat, lng: a.lng }, here))
    if (!best || mi < best.mi) best = { a, mi }
  }
  if (!best) return none

  const { a, mi } = best
  const band: GeoBand | null =
    mi <= GEO_BAND_MILES.in_area ? "in_area"
      : mi <= GEO_BAND_MILES.adjacent ? "adjacent"
        : mi <= GEO_BAND_MILES.nearby ? "nearby"
          : null

  if (band === null) {
    return {
      band: null, applicable: true, miles: mi, anchorLabel: a.label, reason: null,
      outsideReason: `${say(mi)} from ${a.label}, the nearest area the client named — beyond the ${GEO_BAND_MILES.nearby}-mile limit for an automatic recommendation`,
    }
  }

  const where = band === "in_area" ? `In ${a.label}` : band === "adjacent" ? `Next to ${a.label}` : `Near ${a.label}`
  return {
    band, applicable: true, miles: mi, anchorLabel: a.label,
    reason: `${where} — ${say(mi)} from it${geo.anchors.length > 1 ? ", the closest of the areas the client named" : ""}`,
    outsideReason: null,
  }
}

/** A one-line summary of what the client asked for, for the agent-facing report. */
export function geographySummary(geo: ClientGeography): string {
  if (!geo.applicable) return "no area or destination ZIP on record, so location was not used to rank"
  const parts: string[] = []
  if (geo.destinationZip) {
    parts.push(geo.zipSource === "commute_destination"
      ? `ZIP ${geo.destinationZip} (from the commute destination)`
      : `destination ZIP ${geo.destinationZip}`)
  }
  const areas = geo.anchors.filter((a) => !a.label.startsWith("ZIP ")).map((a) => a.label)
  if (areas.length) parts.push(areas.join(", "))
  if (geo.unresolvedAreas.length) parts.push(`(${geo.unresolvedAreas.join(", ")}: no centroid on record)`)
  return parts.join(" + ")
}
