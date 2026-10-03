import { displayDestinationLabel } from "@/lib/commute/destinationAliases"
import { formatDateDisplay } from "@bc/companion-shared"

/**
 * CLIENT HISTORY — a structured record of meaningful changes to the five criteria
 * that drive matching.
 *
 * WHAT THIS IS NOT. Not AI Client Insights (a conversational summary), and not
 * generic CRM audit logging. Exactly five fields are tracked, listed below, and
 * adding a sixth is a deliberate decision rather than a default.
 *
 * `leads` stays the single source of truth for matching; this is context only. It
 * reuses the existing append-only lead_timeline table under a new `type`, which
 * needs no migration — lead_timeline.type is plain `text` with no check
 * constraint.
 *
 * ONE EVENT PER UPDATE, not per field. "I need to be within 20 minutes of Lackland
 * AFB" changes the destination AND the maximum, and it is ONE thing the client
 * said — so it is one chronological entry carrying both changes. The `changes`
 * array is what makes that possible.
 *
 * VALUES ARE STORED PRE-FORMATTED. `from`/`to` are the display strings as they
 * read at the moment of the change, produced here by the same canonical
 * formatters the live surfaces use. That is deliberate for an audit record: a
 * history entry should keep saying what it said, rather than being re-derived
 * later against formatters or alias banks that have since changed.
 *
 * Pure and dependency-light so both call sites — the server-side form seed and
 * the browser-side Edit Client save — share one definition of "meaningfully
 * changed".
 */

/** The five tracked criteria. Deliberately closed; see the note above. */
export type TrackedCriterion =
  | "desired_areas"
  | "commute_destination"
  | "max_drive"
  | "budget"
  | "move_date"

export type CriteriaSource = "form" | "edit_client" | "conversation"

/** One field's movement inside a single update. */
export type CriteriaChange = {
  field: TrackedCriterion
  /** Display label, stored so a renderer needs no field→label table. */
  label: string
  /** Display string before. "" when the criterion had no value (e.g. the form seed). */
  from: string
  /** Display string after. "" when the criterion was cleared. */
  to: string
}

export type CriteriaChangedMetadata = {
  source: CriteriaSource
  changes: CriteriaChange[]
}

/** A lead row, or an Edit Client form patch — both are loose records of columns. */
type LeadLike = Record<string, unknown>

const LABELS: Record<TrackedCriterion, string> = {
  desired_areas: "Desired Areas",
  commute_destination: "Commute / Destination",
  max_drive: "Max Drive",
  budget: "Budget",
  move_date: "Move Date",
}

export const TRACKED_CRITERIA = Object.keys(LABELS) as TrackedCriterion[]

/** How a history entry names where the change came from. */
export const SOURCE_LABELS: Record<CriteriaSource, string> = {
  form: "Lead Form",
  edit_client: "Manual Edit",
  conversation: "Client Conversation",
}

/** Trimmed, blank-collapsed CSV — "A,  B " and "A, B" are the SAME value. */
function normalizeCsv(v: unknown): string {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ")
}

/**
 * The RAW stored value of one criterion, as the column(s) hold it.
 *
 * Desired Areas reads `neighborhoods` and falls back to `submarkets` — the same
 * precedence the Companion's own `desiredAreas` uses, so history tracks the value
 * the locator actually sees rather than a column they never look at.
 */
function rawValue(lead: LeadLike, field: TrackedCriterion): unknown {
  switch (field) {
    case "desired_areas":
      return normalizeCsv(lead.neighborhoods) || normalizeCsv(lead.submarkets)
    case "commute_destination":
      return lead.commute_anchor_label
    case "max_drive":
      return lead.commute_max_minutes
    case "budget":
      return lead.desired_rent
    case "move_date":
      return lead.move_date
  }
}

/**
 * The comparison key — what "meaningfully changed" means.
 *
 * Whitespace and CSV spacing are normalized away, so a formatting-only save is a
 * no-op and records nothing. Absent is one value: null, undefined, "" and (for the
 * maximum) a non-positive number all collapse to "".
 */
export function normalizedValue(lead: LeadLike, field: TrackedCriterion): string {
  const raw = rawValue(lead, field)
  if (raw == null) return ""
  if (field === "max_drive") {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? String(n) : ""
  }
  if (field === "desired_areas") return normalizeCsv(raw)
  return String(raw).trim()
}

/**
 * The DISPLAY string for one criterion, via the canonical formatters:
 * `displayDestinationLabel` for the anchor (so "Joint Base San Antonio: Fort Sam
 * Houston" reads "Fort Sam" here exactly as it does everywhere else) and
 * `formatDateDisplay` for the move date (a date-only value — never `new Date`).
 */
export function displayValue(lead: LeadLike, field: TrackedCriterion): string {
  const normalized = normalizedValue(lead, field)
  if (!normalized) return ""
  switch (field) {
    case "commute_destination":
      return displayDestinationLabel(normalized)
    case "max_drive":
      return `${normalized} min`
    case "move_date":
      return formatDateDisplay(normalized)
    default:
      return normalized
  }
}

/**
 * The tracked criteria that differ between two states, as ONE update's worth of
 * changes. Empty when nothing meaningful moved — callers record nothing then.
 *
 * `after` may be a partial patch: a field the patch does not mention is read from
 * `before`, so an edit that touches only unrelated columns yields no changes.
 */
export function diffCriteria(before: LeadLike, after: LeadLike): CriteriaChange[] {
  const merged: LeadLike = { ...before, ...after }
  const changes: CriteriaChange[] = []
  for (const field of TRACKED_CRITERIA) {
    const from = normalizedValue(before, field)
    const to = normalizedValue(merged, field)
    if (from === to) continue
    changes.push({ field, label: LABELS[field], from: displayValue(before, field), to: displayValue(merged, field) })
  }
  return changes
}

/**
 * The initial criteria a new lead actually supplied, as first-time changes
 * ("" → value). Fields left blank on the form are OMITTED — a history entry must
 * never imply the client answered something they skipped.
 */
export function initialCriteria(lead: LeadLike): CriteriaChange[] {
  const changes: CriteriaChange[] = []
  for (const field of TRACKED_CRITERIA) {
    if (!normalizedValue(lead, field)) continue
    changes.push({ field, label: LABELS[field], from: "", to: displayValue(lead, field) })
  }
  return changes
}

/** The lead_timeline.metadata payload. Returns null when there is nothing to record. */
export function criteriaChangedMetadata(
  source: CriteriaSource,
  changes: CriteriaChange[],
): CriteriaChangedMetadata | null {
  if (changes.length === 0) return null
  return { source, changes }
}
