// Quick Match — what the client asked for, read off the lead row.
//
// ── EVERY PARSER HERE IS AN EXISTING ONE ────────────────────────────────────────────────────
// Nothing in this file invents a reading of a lead column:
//   • bedrooms  → requestedBedrooms (lib/leads/bedroomPricing), the same function the
//                 Recommended Properties price line uses. It FAILS CLOSED on a range, so
//                 "1-2" yields no bedroom requirement rather than a guessed 1.
//   • budget    → parseMoneyRange (@bc/companion-shared), the same parser the Companion's
//                 budget row uses on `desired_rent`; its `max` is the ceiling.
//   • areas     → composeDesiredAreas (lib/propertyExplorer/multiArea), the same function matching
//                 uses to join neighborhoods and submarkets into one de-duplicated list.
// A second reading of the same column is how two surfaces come to disagree about one client,
// so there is no second reading here.
//
// ── THE COLUMNS THAT DO NOT EXIST ───────────────────────────────────────────────────────────
// An earlier draft of this read `lead.zip_codes` and `lead.budget_max`. NEITHER COLUMN EXISTS:
// `leads` has 119 columns and no ZIP list and no numeric budget. Both reads were silently
// undefined, so area and budget ranking did nothing at all. The real sources are
// `destination_zip` (one ZIP, added for exactly this) and `desired_rent` (text, a range).
//
// Preferred AREAS are names, not ZIPs — "Stone Oak", "La Cantera/The Rim" — and a name cannot be
// compared to property_catalog.zip. It CAN be compared to a property's coordinates, through the
// same market-aware centroid catalogue Unleash resolves its search centers with, and that is
// what ./geography does: every one of the 68 curated members carries latitude and longitude, so
// "within 3 miles of Stone Oak" is a measurement rather than a guess. There is still no
// name→ZIP table here, because that would be a guess about this market dressed as data.
import { requestedBedrooms } from "@/lib/leads/bedroomPricing"
import { parseMoneyRange } from "@bc/companion-shared"
import { composeDesiredAreas } from "@/lib/propertyExplorer/multiArea"
import { resolveClientGeography, fiveDigitZip } from "./geography"
import type { QuickMatchProperty } from "./types"
import type { ClientNeeds } from "./ranking"

/** Re-exported so there is one definition of a destination ZIP. It lives in ./geography, which
 *  owns every comparison a ZIP takes part in. */
export { fiveDigitZip }

export type ResolvedNeeds = ClientNeeds & {
  /** The client's named areas, as typed. The RESOLVED ones are in `geography.anchors`. */
  namedAreas: string[]
}

/**
 * `properties` is passed so the destination ZIP can be given a measured centroid from the
 * curated members in it (see ./geography). Omitting it costs only that one anchor: a destination
 * ZIP then qualifies exact matches and nothing else.
 */
export function resolveClientNeeds(
  lead: Record<string, unknown> | null | undefined,
  properties: QuickMatchProperty[] = [],
): ResolvedNeeds {
  const l = lead ?? {}
  const str = (k: string): string | null => {
    const v = l[k]
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null
  }

  const bedrooms = requestedBedrooms(str("beds"))
  const budget = parseMoneyRange(str("desired_rent"))
  const destinationZip = fiveDigitZip(l["destination_zip"])

  const namedAreas = composeDesiredAreas(str("neighborhoods"), str("submarkets"))
    .split(",").map((a) => a.trim()).filter(Boolean)

  const minutesRaw = l["commute_max_minutes"]
  const minutes = typeof minutesRaw === "number" && Number.isFinite(minutesRaw) && minutesRaw > 0
    ? Math.round(minutesRaw) : null

  return {
    bedrooms,
    budgetMax: budget?.max ?? null,
    // `preferredZips` stays a list because an intake ZIP list is the obvious next thing to add.
    preferredZips: destinationZip ? [destinationZip] : [],
    destinationZip,
    commuteLimitMinutes: minutes,
    commuteDestinationLabel: str("commute_anchor_label"),
    namedAreas,
    geography: resolveClientGeography(l, properties),
  }
}
