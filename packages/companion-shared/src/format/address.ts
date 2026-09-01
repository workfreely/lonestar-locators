/**
 * Shared display-only address formatting, so the CRM property card and the Beast
 * Companion Current Property card strip the trailing country IDENTICALLY.
 *
 * Google's formatted address appends ", USA" (and some sources ", United
 * States"). This drops ONLY that exact trailing country token and returns a NEW
 * string — the stored/API address value is never mutated. Street, city, state
 * and ZIP are untouched.
 *
 *   "21739 Hardy Oak Blvd, San Antonio, TX 78258, USA"
 *     → "21739 Hardy Oak Blvd, San Antonio, TX 78258"
 */
export function displayAddress(address: string | null | undefined): string {
  return (address ?? "").replace(/,\s*(USA|United States)\s*$/i, "")
}
