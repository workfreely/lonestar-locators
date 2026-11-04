// MOVE-IN DATE BOUNDS — one definition, used by every form and by the server.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// A lead arrived with a move-in date of 2972-11-15. It was not a display bug and nothing
// transformed it: the year came in that way and every layer accepted it. The public form's
// picker had a `minDate` and no `maxDate`; /api/leads/submit kept `move_date` among the plain
// string fields, where the only checks are "is a string" and "is under 500 characters"; and
// Postgres `date` happily stores years to 5874897 AD. Four separate date controls in this
// codebase, and `maxDate` appeared in none of them.
//
// ── WHY THE COMPARISON IS ON STRINGS ────────────────────────────────────────────────────────
// "YYYY-MM-DD" sorts lexicographically in calendar order, so `a <= b` on two of them is a pure
// calendar comparison with no Date, no timezone and no hour. That matters here: the same value
// is judged in a browser in San Antonio and on a server running UTC, and they must agree. A
// Date-based comparison would make the boundary turn over at a different instant in each, which
// is exactly the class of bug that `toISOString().split("T")[0]` already causes elsewhere.
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────
// It does not correct anything. A date outside the window is REFUSED with a message, never
// clamped or rewritten: a renter who meant something else must be asked, and a stored date that
// is wrong is still evidence of what was submitted.

/** How far ahead a move-in date may be. Two years is generous for a rental and still excludes
 *  every unrealistic year a slip of the keyboard can produce. */
export const MOVE_DATE_MAX_YEARS_AHEAD = 2

/** A Date → "YYYY-MM-DD" from LOCAL parts. Never toISOString, which converts to UTC first and
 *  can move the day for anyone east of it. */
export function toLocalYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** "YYYY-MM-DD" → a LOCAL midnight Date, or null when it is not a real calendar day.
 *  Round-tripped, so 2026-02-31 is rejected rather than silently becoming 3 March. */
export function parseLocalYMD(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date
}

/** Local midnight today — the earliest acceptable move-in date. */
export function moveDateMin(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Local midnight on the same calendar day N years ahead.
 *
 *  29 February is the one day that has no counterpart: JS normalises 2028-02-29 + 2 years to
 *  2030-03-01, one day past the nominal ceiling. That is left as it is — this is a ceiling years
 *  away, and a day of slack at the top of it costs nothing and keeps the rule simple. */
export function moveDateMax(now: Date = new Date()): Date {
  return new Date(now.getFullYear() + MOVE_DATE_MAX_YEARS_AHEAD, now.getMonth(), now.getDate())
}

export type MoveDateCheck = { ok: true } | { ok: false; message: string }

/**
 * Is this an acceptable move-in date?
 *
 * Blank is ACCEPTED — "not answered" is not "invalid", and whether the field is required is a
 * decision each form makes for itself. Only a value that is present and wrong is refused.
 */
export function validateMoveDate(value: unknown, now: Date = new Date()): MoveDateCheck {
  if (value === null || value === undefined) return { ok: true }
  const raw = String(value).trim()
  if (raw === "") return { ok: true }

  // The leading calendar day, so an ISO timestamp from an older client is judged on its date.
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? ""
  if (!ymd || parseLocalYMD(ymd) === null) {
    return { ok: false, message: "Enter a move-in date as MM/DD/YYYY." }
  }

  const min = toLocalYMD(moveDateMin(now))
  const max = toLocalYMD(moveDateMax(now))
  // Pure calendar comparison — see the header.
  if (ymd < min) return { ok: false, message: "Move-in date cannot be in the past." }
  if (ymd > max) {
    return {
      ok: false,
      message: `Move-in date must be within the next ${MOVE_DATE_MAX_YEARS_AHEAD} years (on or before ${max}).`,
    }
  }
  return { ok: true }
}
