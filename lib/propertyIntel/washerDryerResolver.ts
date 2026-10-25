import { asCatalogWasherDryerIncluded, asCatalogWasherDryerConnections } from "./washerDryerCatalog"
import type { WasherDryerStatus } from "@/lib/leads/washerDryer"

/**
 * PROPERTY INTELLIGENCE → the client-facing washer/dryer status, where it CONCLUSIVELY applies.
 *
 * A pure function over the two catalog columns. No I/O, no dates, no client context — give it
 * what property_catalog stores and it answers one question: does this property's verified data
 * settle what THIS client's unit has?
 *
 * ── ONLY TWO READINGS ARE CONCLUSIVE ────────────────────────────────────────────────────────
 *
 *   included = "Yes"                     → Washer & Dryer Included     973 properties
 *   included = "No" + connections "Yes"  → Washer & Dryer Hookups        3 properties
 *
 * Everything else returns null, and the three near-misses are the whole point of the rule:
 *
 *   "Select Units" (224) / "Specific Floor Plans" (4)
 *       The property has them in SOME units. Which units is exactly the fact a badge on one
 *       client's card would be asserting, and it is the fact the catalog does not record.
 *
 *   connections = "Yes" with included unknown (266)
 *       Hookups are confirmed; whether the machines come with the unit is not. Showing
 *       "Hookups" would be a guess at the unknown half, not a reading of the known half.
 *
 *   included = "No" with no connections (9)
 *       Conclusively nothing to show — which is already what a null status renders. There is no
 *       "no laundry" badge to derive, so this is null for the same reason silence is the default.
 *
 * ── WHY IT FAILS CLOSED ─────────────────────────────────────────────────────────────────────
 * Telling a renter an apartment has a washer when it has hookups is the one mistake this feature
 * can make. Every uncertain input therefore lands on null, which renders no badge at all, and a
 * person can still confirm the answer the catalog could not.
 *
 * ── IT NEVER OUTRANKS A PERSON ──────────────────────────────────────────────────────────────
 * A derivation is a DEFAULT for an empty value, never a correction of a filled one. Callers must
 * treat a stored lead_property_reasons.washer_dryer_status as final; see resolveWithOverride,
 * which is the only place that decides between the two.
 */

export type WasherDryerDerivation = {
  /** The status to use, or null when the data does not conclusively settle it. */
  status: WasherDryerStatus | null
  /** True only when `status` is non-null AND derived — never for a null. */
  conclusive: boolean
  /** Why, in words, for the editor's provenance line and for a conflict report. */
  basis: string
}

const NOT = (basis: string): WasherDryerDerivation => ({ status: null, conclusive: false, basis })

/** The catalog's two columns → a client-facing status, or null. Pure. */
export function deriveWasherDryer(
  includedRaw: unknown,
  connectionsRaw: unknown,
): WasherDryerDerivation {
  // Through the catalog validators, so an unrecognised string behaves like a blank rather than
  // being compared as text. A value we cannot read is not evidence.
  const included = asCatalogWasherDryerIncluded(includedRaw)
  const connections = asCatalogWasherDryerConnections(connectionsRaw)

  if (included === "Yes") {
    return { status: "included", conclusive: true, basis: "Property Intelligence: W/D Included = Yes" }
  }
  if (included === "No" && connections === "Yes") {
    return { status: "hookups", conclusive: true, basis: "Property Intelligence: W/D Included = No, Connections = Yes" }
  }

  if (included === "Select Units" || included === "Specific Floor Plans") {
    return NOT(`Property Intelligence says "${included}" — which units is not recorded`)
  }
  if (!included && connections) {
    return NOT(`Connections = ${connections}, but whether the unit includes a washer/dryer is not recorded`)
  }
  if (included === "No") {
    return NOT("Property Intelligence: no washer/dryer included and no connections recorded")
  }
  return NOT("Property Intelligence has no washer/dryer data for this property")
}

export type WasherDryerResolution = {
  /** What the client's card should show. */
  status: WasherDryerStatus | null
  /** Where it came from. "manual" always wins when one is stored. */
  source: "manual" | "derived" | "none"
  derivation: WasherDryerDerivation
  /**
   * A stored confirmation and a conclusive derivation that DISAGREE.
   *
   * Neither value is changed when this is set. One of the two is wrong and a person has to look;
   * silently preferring either would destroy the evidence that they differ. The manual value
   * keeps rendering, because a person put it there on purpose.
   */
  conflict: null | { manual: WasherDryerStatus; derived: WasherDryerStatus; basis: string }
}

/**
 * The one place that decides between a person's answer and the catalog's.
 *
 * A stored status wins, always — including over a conclusive derivation, and including when it
 * is the weaker claim. The derivation only fills a hole.
 */
export function resolveWithOverride(
  manual: WasherDryerStatus | null,
  includedRaw: unknown,
  connectionsRaw: unknown,
): WasherDryerResolution {
  const derivation = deriveWasherDryer(includedRaw, connectionsRaw)
  if (manual) {
    const conflict =
      derivation.conclusive && derivation.status !== manual
        ? { manual, derived: derivation.status as WasherDryerStatus, basis: derivation.basis }
        : null
    return { status: manual, source: "manual", derivation, conflict }
  }
  if (derivation.conclusive && derivation.status) {
    return { status: derivation.status, source: "derived", derivation, conflict: null }
  }
  return { status: null, source: "none", derivation, conflict: null }
}

/**
 * Should the share-prepare step WRITE this derivation to lead_property_reasons?
 *
 * Only when there is nothing stored and the catalog is conclusive. A pair that already has the
 * right value is not rewritten — an upsert that changes nothing still bumps updated_at and
 * still counts as a write, and the share's reuse hash reads this column.
 */
export function shouldPersistDerived(
  manual: WasherDryerStatus | null,
  derivation: WasherDryerDerivation,
): boolean {
  return !manual && derivation.conclusive && derivation.status !== null
}
