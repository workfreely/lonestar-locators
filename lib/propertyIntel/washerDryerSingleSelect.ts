import { asCatalogWasherDryerIncluded, asCatalogWasherDryerConnections } from "./washerDryerCatalog"

/**
 * ONE DROPDOWN OVER TWO COLUMNS.
 *
 * Property Intelligence asked two questions — "W/D Included?" and "W/D Connections?" — and an
 * agent entering a property had to know which was which. This collapses them into one menu
 * without touching either column: property_catalog.washer_dryer_included and
 * .washer_dryer_connections both stay exactly as they are, and this file is only the translation
 * between what is stored and what is shown.
 *
 * ── WHAT THE LIVE DATA LOOKS LIKE ───────────────────────────────────────────────────────────
 * All 4,204 catalog rows, audited before this was written:
 *
 *   3,835 (91.2%)  one option says everything the two columns say
 *     327 (7.8%)   the option is right, but a SECOND fact stops being visible
 *                  — / Yes (225), Select Units / Yes (48), Yes / Yes (25),
 *                    Select Units / Select Units (20), and three smaller shapes
 *      42 (1.0%)   NO single option is honest
 *                  — / Select Units (37), — / No (4), No / Select Units (1)
 *
 * ── NOTHING IS REWRITTEN TO FIT THE MENU ────────────────────────────────────────────────────
 * The 42 ambiguous rows are NOT coerced into the nearest option. They report `ambiguous`, the
 * editor shows both stored values as the current selection, and the row keeps them until a
 * person deliberately picks something. The 327 lossy rows display their correct option and keep
 * the second fact in the column — invisible in this control, intact in the database.
 *
 * The protection that makes all of that safe is the same one the price fields already use:
 * NOTHING IS WRITTEN UNLESS THE CONTROL IS TOUCHED. Opening the editor, changing a rent and
 * saving leaves both washer/dryer columns exactly as they were, whatever this menu is showing.
 */

export type WasherDryerSelectValue =
  | "included"
  | "hookups"
  | "select_units"
  | "specific_floor_plans"
  | "none"
  | "" // Not Verified

/**
 * The menu, in the approved order. "Not Verified" is LAST because it is the state a property is
 * leaving rather than one a person chooses — and it is still what a `<select>` shows for an
 * unverified row, because a select matches its value wherever that option sits in the list.
 */
export const WASHER_DRYER_SELECT_OPTIONS: { value: WasherDryerSelectValue; label: string }[] = [
  { value: "included", label: "Washer & Dryer Included" },
  { value: "hookups", label: "Washer & Dryer Hookups" },
  { value: "select_units", label: "Select Units" },
  { value: "specific_floor_plans", label: "Specific Floor Plans" },
  { value: "none", label: "None" },
  { value: "", label: "Not Verified" },
]

export type WasherDryerSelectState = {
  /** What the dropdown shows. "" is Not Verified. */
  value: WasherDryerSelectValue
  /** True when no option can honestly represent what is stored. */
  ambiguous: boolean
  /** Set when the option is right but a second stored fact is not visible in it. */
  lossy: string | null
  /** The raw pair, for the editor to show when `ambiguous`. */
  stored: { included: string | null; connections: string | null }
}

/** What is stored → what the dropdown shows. Pure; never rewrites anything. */
export function toSingleSelect(includedRaw: unknown, connectionsRaw: unknown): WasherDryerSelectState {
  const included = asCatalogWasherDryerIncluded(includedRaw)
  const connections = asCatalogWasherDryerConnections(connectionsRaw)
  const stored = { included, connections }
  const at = (value: WasherDryerSelectValue, lossy: string | null = null): WasherDryerSelectState =>
    ({ value, ambiguous: false, lossy, stored })

  const hidden = (what: string | null) => (what ? `Connections = ${what} is stored but not shown in this menu` : null)

  if (included === "Yes") return at("included", hidden(connections))
  if (included === "No" && connections === "Yes") return at("hookups")
  // Connections verified, included never answered. It IS hookups by definition — connections
  // available, appliances not confirmed — but the unanswered half is worth saying out loud,
  // because the client-facing resolver treats a verified "No" and an unanswered one differently.
  if (!included && connections === "Yes") {
    return at("hookups", "Included has never been answered — confirm it to make this count for a client's card")
  }
  if (included === "Select Units") return at("select_units", hidden(connections))
  if (included === "Specific Floor Plans") return at("specific_floor_plans", hidden(connections))
  if (included === "No" && (!connections || connections === "No")) return at("none")
  if (!included && !connections) return at("")

  // Everything left over: a connections answer with no included answer, or two answers that
  // disagree about scope. Shown as itself, changed by nobody but a person.
  return { value: "", ambiguous: true, lossy: null, stored }
}

/**
 * A chosen option → the columns to write.
 *
 * ONLY WHAT THE OPTION ASSERTS. "Included" says nothing about connections, so it does not touch
 * that column — the same rule the rest of this editor follows, where a blank field means "leave
 * it alone" and never "erase it". Two options assert both halves: Hookups is the pair that makes
 * a client-facing badge conclusive, and None is the only way to record a verified absence.
 *
 * "Not Verified" writes nothing at all. It is the absence of an answer, not an instruction to
 * delete one.
 */
export function fromSingleSelect(value: WasherDryerSelectValue): {
  included?: string
  connections?: string
} {
  switch (value) {
    case "included": return { included: "Yes" }
    case "hookups": return { included: "No", connections: "Yes" }
    case "select_units": return { included: "Select Units" }
    case "specific_floor_plans": return { included: "Specific Floor Plans" }
    case "none": return { included: "No", connections: "No" }
    default: return {}
  }
}

/** The label a value shows, for a read-only line or a test. */
export function washerDryerSelectLabel(value: WasherDryerSelectValue): string {
  return WASHER_DRYER_SELECT_OPTIONS.find((o) => o.value === value)?.label ?? "Not Verified"
}

/** The raw pair, worded for a human, used as the current selection on an ambiguous row. */
export function describeStoredPair(stored: { included: string | null; connections: string | null }): string {
  return `Mixed — Included: ${stored.included ?? "not verified"}, Connections: ${stored.connections ?? "not verified"}`
}

/**
 * WHAT CHOOSING THIS OPTION WOULD REPLACE.
 *
 * The menu writes only what its option asserts, but an option CAN assert something a column
 * already answers differently — picking "None" on a property stored as `Yes / Yes` replaces two
 * verified facts with their opposites, and picking "Hookups" on `Select Units / Yes` overwrites
 * a scope answer with a flat No. Those are legitimate corrections; what is not legitimate is
 * making them silently, out of a menu that only has room to show one of the two columns.
 *
 * So the editor asks this before saving and shows the answer verbatim. Nothing is blocked — the
 * person keeps the decision — but they make it knowing which stored fact goes away.
 *
 * A column the option does not assert is never listed, because it is never written. Neither is
 * a column whose stored value already equals what would be written.
 */
export type WasherDryerConsequence = { column: "Included" | "Connections"; from: string; to: string }

export function changeConsequences(
  stored: { included: string | null; connections: string | null },
  next: WasherDryerSelectValue,
): WasherDryerConsequence[] {
  const w = fromSingleSelect(next)
  const out: WasherDryerConsequence[] = []
  // Only a REPLACEMENT counts. Writing into a column that has never been answered adds
  // information; it does not discard any, so it is not a consequence worth interrupting for.
  if (w.included && stored.included && w.included !== stored.included) {
    out.push({ column: "Included", from: stored.included, to: w.included })
  }
  if (w.connections && stored.connections && w.connections !== stored.connections) {
    out.push({ column: "Connections", from: stored.connections, to: w.connections })
  }
  return out
}
