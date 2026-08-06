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
