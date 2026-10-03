import type { LocationFacts } from "./locationFacts"
import { diffCriteria, type CriteriaChange } from "@/lib/leads/criteriaHistory"

/**
 * RECONCILIATION — what, if anything, should actually change.
 *
 * Extraction says what the client stated. THIS decides whether the lead's active
 * criteria move, and it is deliberately conservative: when the right answer is
 * not obvious, V1 changes nothing and says why.
 *
 * Pure: no model, no network, no database. Everything it needs is passed in, so
 * every rule below is directly testable.
 *
 * ── THE RULES, in the order they apply ──────────────────────────────────────
 *  1. AMBIGUOUS NEVER WRITES. Only `explicit` facts are eligible at all.
 *  2. A DESTINATION IS NOT AN AREA. They are separate columns and a destination
 *     never consumes one of the two Desired Area slots.
 *  3. NEVER DELETE ON MENTION. An existing criterion is only removed when the
 *     client's language explicitly replaces it. Stating a destination leaves
 *     existing areas alone.
 *  4. TWO AREAS, HARD. If an additive statement would create a third and the
 *     intended replacement is not clear, V1 does NOT guess which to drop — it
 *     declines and flags the statement for review.
 *  5. NO INVENTED MAXIMUM. A maximum is written only when stated; a destination
 *     with no maximum is valid and leaves commute_max_minutes NULL.
 *  6. A DESTINATION MUST RESOLVE. Commute Mode needs a canonical place id, so an
 *     unresolved or ambiguous destination writes nothing.
 */

/** Current limit on Desired Areas. Mirrors the product rule the forms enforce. */
export const MAX_DESIRED_AREAS = 2

/** A destination the resolver has already turned into a canonical place. */
export type ResolvedDestination = { label: string; placeId: string }

export type ReconcileInput = {
  /** The lead's current row — only the location columns are read. */
  lead: Record<string, unknown>
  facts: LocationFacts
  /**
   * The resolved destination, when the extractor proposed one AND the resolver
   * returned exactly one confident match. Null means "do not write a destination",
   * whatever the client said.
   */
  resolvedDestination?: ResolvedDestination | null
}

export type ReconcileOutcome = {
  /** The columns to write. Empty when nothing should change. */
  patch: Record<string, unknown>
  /** Client History changes for this one statement, grouped as ONE event. */
  changes: CriteriaChange[]
  /** Machine-readable reasons, for logs and tests. Never shown to a client. */
  notes: string[]
  /** True when something was understood but deliberately NOT applied. */
  needsReview: boolean
}

/** Trimmed, blank-collapsed CSV — the representation `neighborhoods` already uses. */
function splitAreas(v: unknown): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const sameArea = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function reconcileLocation({ lead, facts, resolvedDestination }: ReconcileInput): ReconcileOutcome {
  const patch: Record<string, unknown> = {}
  const notes: string[] = []
  let needsReview = false

  // ── Rule 1: only explicit facts are eligible. ────────────────────────────
  const areas = facts.areas.filter((a) => a.confidence === "explicit")
  const destination = facts.destination?.confidence === "explicit" ? facts.destination : null
  const maxDrive = facts.maxDriveMinutes?.confidence === "explicit" ? facts.maxDriveMinutes : null

  if (facts.areas.length > areas.length) notes.push("ambiguous_area_ignored")
  if (facts.destination && !destination) notes.push("ambiguous_destination_ignored")
  if (facts.maxDriveMinutes && !maxDrive) notes.push("ambiguous_max_drive_ignored")

  // A BOUNDARY the schema cannot represent ("inside 1604", "north of 410").
  // Surfaced, never written: it is a region, and the only shaped slot for it would
  // be a point anchor — which would state a different requirement than the client
  // gave. Review is the honest outcome until boundaries are supported properly.
  if (facts.unsupportedConstraint) {
    notes.push("unsupported_geographic_constraint")
    needsReview = true
  }

  // ── DESTINATION (rule 2, 6) ──────────────────────────────────────────────
  // Written to its own columns. It never touches neighborhoods, so a client who
  // names where they work keeps the areas they already gave us (rule 3).
  if (destination) {
    if (resolvedDestination?.placeId) {
      const currentPlaceId = String(lead.commute_anchor_place_id ?? "").trim()
      if (currentPlaceId === resolvedDestination.placeId) {
        notes.push("destination_unchanged")
      } else {
        patch.commute_anchor_label = resolvedDestination.label
        patch.commute_anchor_place_id = resolvedDestination.placeId
        notes.push("destination_set")
      }
    } else {
      // Stated clearly, but we could not turn it into a canonical place. Writing a
      // label with no place id would leave a destination nothing can route from.
      notes.push("destination_unresolved")
      needsReview = true
    }
  }

  // ── MAX DRIVE (rule 5) ───────────────────────────────────────────────────
  // Only when stated. A maximum is meaningless without something to measure to,
  // so it is written only alongside an anchor the lead has or just gained.
  if (maxDrive) {
    const anchorAfter = patch.commute_anchor_place_id ?? lead.commute_anchor_place_id
    if (!String(anchorAfter ?? "").trim()) {
      notes.push("max_drive_without_destination")
      needsReview = true
    } else if (Number(lead.commute_max_minutes) === maxDrive.minutes) {
      notes.push("max_drive_unchanged")
    } else {
      patch.commute_max_minutes = maxDrive.minutes
      notes.push("max_drive_set")
    }
  }

  // ── DESIRED AREAS (rules 3, 4) ───────────────────────────────────────────
  if (areas.length > 0) {
    const current = splitAreas(lead.neighborhoods)
    const named = areas.map((a) => a.name.trim()).filter(Boolean)
    const replacing = areas.some((a) => a.intent === "replacement")

    if (replacing) {
      // Explicit correction: the client told us the previous answer is wrong.
      const next = named.slice(0, MAX_DESIRED_AREAS)
      if (next.length !== current.length || !next.every((n, i) => sameArea(n, current[i] ?? ""))) {
        patch.neighborhoods = next.join(", ")
        notes.push("areas_replaced")
      } else {
        notes.push("areas_unchanged")
      }
    } else {
      // Additive or a plain preference. Add only what is genuinely new.
      const additions = named.filter((n) => !current.some((c) => sameArea(c, n)))
      if (additions.length === 0) {
        notes.push("areas_unchanged")
      } else if (current.length + additions.length <= MAX_DESIRED_AREAS) {
        patch.neighborhoods = [...current, ...additions].join(", ")
        notes.push("areas_added")
      } else {
        // Rule 4. A third area would have to displace one of theirs, and nothing
        // in the message says which. Guessing would silently discard a stated
        // preference, so V1 declines and surfaces it instead.
        notes.push("areas_would_exceed_limit")
        needsReview = true
      }
    }
  }

  // The SAME diff the CRM and the form seed use, so a conversation-driven change
  // renders identically to a manual one — and so "meaningfully changed" has one
  // definition across every source.
  const changes = Object.keys(patch).length > 0 ? diffCriteria(lead, patch) : []
  // A patch that normalizes to no visible change is not a change at all.
  if (Object.keys(patch).length > 0 && changes.length === 0) notes.push("patch_was_noop")

  return { patch: changes.length > 0 ? patch : {}, changes, notes, needsReview }
}
