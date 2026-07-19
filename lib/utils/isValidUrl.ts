// Shared by the Favorite Properties modal (client-side validation/trigger
// gating) and the metadata-detection API route (server-side re-check)
// so the two can never disagree about what counts as a usable URL.

/** Accepts bare domains ("example.com/x") by treating them as https://. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function isValidUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const u = new URL(normalizeUrl(trimmed))
    return u.hostname.includes(".")
  } catch {
    return false
  }
}
