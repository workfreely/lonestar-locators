/**
 * Shared date DISPLAY formatting. The stored/API value stays ISO; this only
 * changes how it's shown. Import this ONE formatter instead of formatting dates
 * independently in components.
 */

/**
 * Format a stored date value as `MM/DD/YYYY` for display, WITHOUT timezone
 * shifting. A date-only ISO string ("YYYY-MM-DD") is parsed by its parts — never
 * via `new Date(iso)`, which treats it as UTC midnight and can shift the date a
 * day backward/forward in local time. Month/day are zero-padded to two digits.
 *
 *   "2026-09-01" → "09/01/2026"
 *   "2026-3-5"   → "03/05/2026"   (tolerates unpadded input)
 *
 * Empty/nullish → "—". Unrecognized formats pass through unchanged.
 */
export function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
  if (!m) return value;
  const [, year, month, day] = m;
  return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * The English month NAME of a stored date-only value, without timezone shifting.
 *
 *   "2026-11-01" → "November"
 *
 * Same hazard as formatDateDisplay, and worse where it is used: the caller is
 * composing a sentence a CLIENT reads ("your move in November"). The previous
 * `new Date("2026-11-01").toLocaleString("en-US", { month: "long" })` parses as
 * UTC midnight, which in any timezone behind UTC lands on October 31 — so a
 * first-of-the-month move was described to the client as the WRONG MONTH.
 *
 * The month is taken straight from the string's own digits and indexed into a
 * fixed table: no Date is constructed, so there is no instant to shift and no
 * locale or host timezone can change the answer. The names match what
 * toLocaleString("en-US") produced for every correctly-parsed date, so wording
 * is unchanged wherever the old code was already right.
 *
 * Empty/nullish or unrecognized → "" (callers omit the phrase entirely).
 */
export function formatMonthDisplay(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
  if (!m) return "";
  return MONTH_NAMES[Number(m[2]) - 1] ?? "";
}
