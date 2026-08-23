/**
 * Formats a phone number string as (XXX) XXX-XXXX.
 * Returns the original string unchanged if it doesn't match a 10-digit pattern.
 */
export function formatPhone(phone: string): string {
  if (!phone) return ""
  const cleaned = phone.replace(/\D/g, "")
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/)
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`
  return phone
}

/**
 * Progressive US phone mask for a controlled <input> — formats WHILE typing:
 *
 *   2 → 2            22 → 22          222 → (222
 *   2222 → (222) 2                    222222 → (222) 222
 *   2222222 → (222) 222-2             2222222222 → (222) 222-2222
 *
 * Caps at 10 significant digits, so neither typing nor pasting can overflow.
 * A pasted US number carrying the country code ("+1 (512) 555-1234",
 * "1-512-555-1234") has the leading 1 stripped rather than truncated — without
 * that, slicing to 10 would silently mangle the last digit.
 *
 * The finished value matches formatPhone()'s "(XXX) XXX-XXXX", so what the
 * locator sees while typing is exactly what gets stored.
 */
export function formatPhoneInput(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "")
  // US country code on a pasted number — drop it, don't truncate the tail. Keyed
  // on "longer than 10 and leading 1", not "exactly 11", so a pasted number that
  // ALSO carries an extension ("+1 512 555 1234 ext 99") still yields the right
  // ten digits instead of shifting everything one place left.
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1)
  digits = digits.slice(0, 10)

  if (digits.length < 3) return digits
  if (digits.length === 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** Significant digits behind a masked value — 10 once the number is complete. */
export function phoneDigitCount(raw: string): number {
  return (raw ?? "").replace(/\D/g, "").length
}
