// MOVE-IN SPECIAL — the dropdown vocabulary, and a LOSSLESS round trip to stored text.
//
// property_catalog.current_special is free text and always has been. Every reader already
// understands it: normalizeShortSpecial turns "Up to 8 Weeks Free on Select Homes" into the
// short badge, and its NO_SPECIAL pattern already treats "No Special" / "None" / "N/A" as no
// offer. So the dropdown does not introduce a new storage format — it writes the same text the
// Recommended Properties editor's Quick Specials have always written.
//
// ── THE RULE THAT MATTERS ───────────────────────────────────────────────────────────────────
// Opening the editor and saving something else must NEVER rewrite current_special.
//
// That is why a stored value is matched to a dropdown option only when the option reproduces it
// EXACTLY. "8 Weeks Free" (no qualifier) looks like the 8-weeks option, but selecting that
// option would write "Up to 8 Weeks Free on Select Homes" — a different claim, and one the
// property may never have made. Mapping it would mean a locator who came to fix a commission
// silently restated the concession. So anything that does not round-trip exactly is presented
// as Custom with its text verbatim, where it is visible and only changes if someone edits it.
//
// ── UNKNOWN IS NOT "NO SPECIAL" ─────────────────────────────────────────────────────────────
// A null current_special means nobody has researched it. It selects the "unknown" option, which
// writes nothing at all. Recording "No Special" is a deliberate, separate choice: it is a
// finding, and it is stored as text the readers recognise as "no offer".

/** The qualifier is part of the offer — see the note in normalizeShortSpecial. Every generated
 *  phrase carries "Up to … on Select Homes" so a hurried save produces the cautious wording and
 *  an unconditional claim has to be typed deliberately. Mirrors QUICK_SPECIALS. */
function freePhrase(amount: number, unit: "Weeks" | "Months" | "Month"): string {
  return `Up to ${amount} ${unit} Free on Select Homes`
}

/** The stored text for "somebody checked, and there is no concession". Matched by the shared
 *  NO_SPECIAL pattern, so every badge reader already renders it as no offer. */
export const NO_SPECIAL_TEXT = "No Special"

/** Separator between the dropdown's phrase and any additional details the locator records. */
export const DETAIL_SEPARATOR = " — "

export type MoveInSpecialOption = { value: string; label: string; phrase: string | null }

export const MOVE_IN_SPECIAL_OPTIONS: readonly MoveInSpecialOption[] = [
  // phrase null ⇒ writes nothing. Selecting it leaves the stored value exactly as it is.
  { value: "", label: "Unknown — not researched", phrase: null },
  { value: "none", label: "No Special", phrase: NO_SPECIAL_TEXT },
  { value: "2_weeks", label: "2 Weeks Free", phrase: freePhrase(2, "Weeks") },
  { value: "4_weeks", label: "4 Weeks Free", phrase: freePhrase(4, "Weeks") },
  { value: "6_weeks", label: "6 Weeks Free", phrase: freePhrase(6, "Weeks") },
  { value: "8_weeks", label: "8 Weeks Free", phrase: freePhrase(8, "Weeks") },
  { value: "10_weeks", label: "10 Weeks Free", phrase: freePhrase(10, "Weeks") },
  { value: "12_weeks", label: "12 Weeks Free", phrase: freePhrase(12, "Weeks") },
  { value: "1_month", label: "1 Month Free", phrase: freePhrase(1, "Month") },
  { value: "2_months", label: "2 Months Free", phrase: freePhrase(2, "Months") },
  // Custom carries the whole text in the details field; there is no phrase of its own.
  { value: "custom", label: "Custom", phrase: null },
] as const

export type SpecialSelection = { choice: string; details: string }

/**
 * Stored text → the dropdown state that reproduces it.
 *
 * Exact match on the phrase, optionally followed by the separator and details. Anything else is
 * Custom, verbatim — see the round-trip rule above.
 */
export function specialToSelection(stored: string | null | undefined): SpecialSelection {
  const text = (stored ?? "").trim()
  if (!text) return { choice: "", details: "" }
  for (const opt of MOVE_IN_SPECIAL_OPTIONS) {
    if (!opt.phrase) continue
    if (text === opt.phrase) return { choice: opt.value, details: "" }
    if (text.startsWith(opt.phrase + DETAIL_SEPARATOR)) {
      return { choice: opt.value, details: text.slice(opt.phrase.length + DETAIL_SEPARATOR.length).trim() }
    }
  }
  return { choice: "custom", details: text }
}

/**
 * Dropdown state → the text to store, or NULL meaning "send nothing, leave it alone".
 *
 * Null is returned for the unknown option, and for Custom with no text — an empty Custom is a
 * locator who has not written anything yet, not an instruction to erase the stored special.
 */
export function selectionToSpecial(choice: string, details: string): string | null {
  const extra = (details ?? "").trim()
  if (choice === "custom") return extra || null
  const opt = MOVE_IN_SPECIAL_OPTIONS.find((o) => o.value === choice)
  if (!opt || !opt.phrase) return null
  return extra ? `${opt.phrase}${DETAIL_SEPARATOR}${extra}` : opt.phrase
}
