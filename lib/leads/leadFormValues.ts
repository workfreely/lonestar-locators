// Tolerant coercion of stored lead values into the shapes the Edit Client form
// (LeadFields) renders. An EXISTING lead — real, legacy, imported, or a demo
// client — can carry values the blank Add Lead form never has to render on
// mount: a `move_date` stored as a full ISO timestamp, a CSV column that is
// null or (historically) an array, a number where the form expects a string.
// These helpers make the modal open SAFELY regardless of the incoming shape,
// instead of throwing during render and crashing the whole CRM page.
//
// Pure + dependency-free so the crash path can be regression-tested directly.

/**
 * Parse a stored `move_date` into a Date for the react-datepicker `selected`
 * prop, tolerantly.
 *
 * The form itself always SAVES a bare "YYYY-MM-DD" (see LeadFields' onChange),
 * but existing/demo/legacy leads can hold a full ISO timestamp
 * ("2026-09-15T10:00:00.000Z") or other shapes. The previous inline expression
 * — `new Date(move_date + "T12:00:00")` — turned any such value into an
 * `Invalid Date`, and react-datepicker's formatter throws
 * `RangeError: Invalid time value` on an invalid `selected`, taking down the
 * page.
 *
 * We take the leading calendar date when one is present (covers both the bare
 * date and an ISO timestamp), anchor it to LOCAL noon so the picker shows the
 * intended day regardless of timezone, and return `null` — never an
 * `Invalid Date` — for anything unparseable.
 */
export function parseMoveDate(v: unknown): Date | null {
  if (v == null || v === "") return null
  // A Date instance can arrive from in-memory/demo shapes — accept it directly.
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) // leading YYYY-MM-DD, incl. ISO timestamps
  const d = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`) : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Split a stored CSV column (neighborhoods / submarkets / must-have amenities)
 * into trimmed, non-empty values — tolerant of null/undefined, a number, or a
 * legacy ARRAY value. The old inline `(s || "").split(",")` threw
 * `s.split is not a function` if the column ever held an array; this coerces
 * instead of crashing.
 */
export function csvToArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean)
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Join back with the SAME ", " the public form + submit route use. */
export const arrToCsv = (a: string[]): string => a.join(", ")

/**
 * Editable lead columns that are NOT `text` in Postgres, so a blank value must be
 * written as NULL rather than "".
 *
 * `leads.move_date` is a `date`. The Edit Client form is all-strings and uses ""
 * as its empty value — which is correct AS FORM STATE (the DatePicker writes ""
 * when cleared) but is not valid input for a date column: Postgres rejects it with
 * `22007 invalid input syntax for type date: ""`, so the whole save failed and the
 * modal reported "Could not save changes". The Add Lead path never hit this because
 * it posts to /api/leads/submit, which skips empty values; Edit writes to Supabase
 * directly with no such boundary, which is why the conversion belongs here.
 *
 * Every OTHER editable column is `text`, where "" is accepted — verified against the
 * schema, including ones that merely look numeric (credit_score, income,
 * desired_rent, beds, baths, broken_lease_amount, eviction_balance, felony_age,
 * misdemeanor_age are all text). They are deliberately left alone.
 *
 * ADD TO THIS SET if a date / numeric / boolean column is ever made editable.
 */
export const NON_TEXT_EDITABLE_COLUMNS: ReadonlySet<string> = new Set(["move_date"])

/**
 * Build the Edit Client UPDATE patch from the form. Shape is unchanged — every
 * requested column is present — but a blank value for a NON_TEXT_EDITABLE_COLUMNS
 * member becomes `null` instead of "". Text columns pass through exactly as before.
 */
export function buildEditPatch(
  form: Record<string, unknown>,
  columns: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    columns.map((k) => {
      const v = form[k] ?? ""
      const isBlank = typeof v === "string" && v.trim() === ""
      return [k, NON_TEXT_EDITABLE_COLUMNS.has(k) && isBlank ? null : v]
    }),
  )
}
