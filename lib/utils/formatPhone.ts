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
