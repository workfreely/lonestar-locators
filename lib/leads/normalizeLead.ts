// Pure normalization helpers for duplicate-lead detection.
//
// These are comparison-only transforms — they never change what gets stored
// in `leads.phone` / `leads.email` / `leads.first_name` / `leads.last_name`,
// which stay in their existing display form for SMS, email, and Google
// Contacts sync. Normalization exists solely so two representations of the
// same underlying value (e.g. "(210) 895-5766" and "2108955766") compare
// equal.

/**
 * Normalizes a phone number to a canonical 10-digit form for comparison.
 * Strips all non-digits, then strips a leading US country-code "1" if the
 * result is 11 digits. Returns null if the input doesn't reduce to exactly
 * 10 digits (rather than guessing) — including empty/missing input.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null

  let digits = raw.replace(/\D/g, "")

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1)
  }

  return digits.length === 10 ? digits : null
}

/**
 * Normalizes an email address to a canonical form for comparison:
 * trimmed and lowercased. Returns null for empty/missing input.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalizes a name for comparison: trims outer whitespace and collapses
 * internal runs of whitespace to a single space. Deliberately preserves
 * case — names carry meaningful casing (e.g. "McDonald") that a comparison
 * helper shouldn't destroy. Returns null for empty/missing input.
 */
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/\s+/g, " ")
  return trimmed.length > 0 ? trimmed : null
}
