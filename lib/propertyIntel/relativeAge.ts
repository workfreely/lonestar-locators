// HOW OLD IS THIS FACT — for the agent-facing editor only.
//
// The point is recognition, not enforcement: a locator preparing recommendations should be able
// to see at a glance that a special was last touched two months ago, and decide for themselves
// whether to ring the office. Nothing here hides anything.
//
// ── THE WORD "VERIFIED" IS EARNED, NOT ASSUMED ──────────────────────────────────────────────
// A timestamp only says WHEN a column was written. Whether that write was a VERIFICATION is a
// separate fact, recorded in property_field_provenance.verification_status — 'verified' when the
// owner supplied a supporting source, 'inferred' when they did not. So the label follows the
// provenance, not the date:
//
//   verified   + a date  →  "Verified 12 days ago"
//   not        + a date  →  "Updated 2 months ago"
//   no date at all       →  ""   (nothing is drawn)
//
// Calling an unsourced edit "Verified" would be the same class of error as reading a null
// commission as a confirmed zero: presenting an absence of evidence as evidence.
//
// ── AND WHY NO DATE DRAWS NOTHING ───────────────────────────────────────────────────────────
// It used to say "Date Unknown". That label described the ABSENCE of a timestamp, not the field
// beside it, and on the special and the gift card — where most properties have never been
// touched — it was the only thing most rows ever showed. An empty string lets the row simply not
// draw a line, which is what `updatedLabel` beneath already does. Nothing is hidden: the date is
// still absent either way, and the control itself is untouched.

export type AgeLabelInput = {
  /** The column's own timestamp. Null/absent/unparseable → no label at all. */
  at?: string | Date | null
  /** True only when provenance says this field was VERIFIED, not merely written. */
  verified?: boolean
}

/** "12 days ago", "2 months ago", "today". Calendar-ish and deliberately coarse — the locator is
 *  deciding whether to recheck, not auditing to the hour. */
export function relativeAge(at: string | Date | null | undefined, now: number = Date.now()): string | null {
  if (!at) return null
  const t = at instanceof Date ? at.getTime() : Date.parse(String(at))
  if (!Number.isFinite(t)) return null
  const days = Math.floor((now - t) / 86_400_000)
  // A future timestamp is a clock problem, not a fresher fact — report it as today rather than
  // "in -3 days".
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 31) return `${days} days ago`
  const months = Math.round(days / 30.44)
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`
  const years = Math.floor(days / 365.25)
  const rem = Math.round((days - years * 365.25) / 30.44)
  return rem >= 1 && years === 1 ? `${years} year ${rem} month${rem === 1 ? "" : "s"} ago` : `${years} year${years === 1 ? "" : "s"} ago`
}

/**
 * "Updated: Nov 3, 2026" — an ABSOLUTE date, for fields whose age is read as a fact rather than as
 * staleness. The approval criteria use this; the special and the gift card keep the relative form,
 * where the question really is "how stale is this?".
 *
 * ── WHY IT IS FORMATTED BY HAND ─────────────────────────────────────────────────────────────
 * toLocaleDateString depends on the runtime's locale and time zone, so a server render and a
 * client render can disagree and React reports a hydration mismatch. A fixed month table cannot.
 *
 * ── AND WHY IT RETURNS EMPTY ────────────────────────────────────────────────────────────────
 * No provenance means nobody has saved this field yet. A label about the absence of a date is a
 * label about nothing; an empty string lets the row simply not draw one. `ageLabel` below now
 * answers the same way, so no field in the editor announces a missing timestamp.
 *
 * The word still follows the provenance, never the save: "Verified" only when a supporting source
 * was recorded, "Updated" otherwise. An ordinary save can never produce "Verified".
 */
export function updatedLabel(input: AgeLabelInput): string {
  if (!input.at) return ""
  const t = input.at instanceof Date ? input.at.getTime() : Date.parse(String(input.at))
  if (!Number.isFinite(t)) return ""
  const d = new Date(t)
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${input.verified ? "Verified" : "Updated"}: ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** The full line the editor shows beside a field: "Verified 12 days ago", "Updated 2 months ago",
 *  or EMPTY when there is no timestamp to describe. */
export function ageLabel(input: AgeLabelInput): string {
  const age = relativeAge(input.at)
  if (!age) return ""
  return `${input.verified ? "Verified" : "Updated"} ${age}`
}

/**
 * "Oct 19, 2026" from a stored "YYYY-MM-DD" — the text on a date field that opens the CRM's own
 * calendar rather than the browser's. Anything that is not a plain day is returned verbatim, so a
 * value this function does not understand is shown rather than swallowed.
 *
 * Hand-formatted for the same reason `updatedLabel` is: toLocaleDateString follows the runtime's
 * locale and time zone, so a server render and a client render can disagree and React reports a
 * hydration mismatch. The month table cannot.
 */
export function formatDayLabel(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(y, mo - 1, day)
  // ROUND-TRIP, not just "is it NaN". new Date(2026, 1, 31) is March 3rd, so a date that does not
  // exist would be shown as a different, real one. A value this function cannot represent
  // faithfully is returned verbatim instead.
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return value
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${MONTHS[mo - 1]} ${day}, ${y}`
}
