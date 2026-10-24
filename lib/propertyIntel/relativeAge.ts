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
//   no date at all       →  "Date unknown"
//
// Calling an unsourced edit "Verified" would be the same class of error as reading a null
// commission as a confirmed zero: presenting an absence of evidence as evidence.

export type AgeLabelInput = {
  /** The column's own timestamp. Null/absent/unparseable → "Date unknown". */
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

/** The full line the editor shows beside a field. Never empty — "Date unknown" is itself useful. */
export function ageLabel(input: AgeLabelInput): string {
  const age = relativeAge(input.at)
  if (!age) return "Date unknown"
  return `${input.verified ? "Verified" : "Updated"} ${age}`
}
