// Data-ownership / freshness classification (pure). Determines when a newer
// authoritative value may REFRESH an older one, versus when a conflict must be
// surfaced. This TIGHTENS behavior for owned/malformed data without weakening
// preserve-by-default for stable curated intelligence.

export type OwnershipClass =
  | "stable_curated" // features, classification, style, keywords, most facts — preserve, surface conflicts
  | "refreshable_official" // official-site contact/urls/hours — newer verified official value may refresh
  | "google_owned" // Google owns it (rating, reviews, geo, canonical address) — google_places may refresh
  | "time_sensitive_special" // specials — refresh on re-check
  | "qualification_trusted" // approval policy — trusted verification only, never public web
  | "protected_commission" // never writable this phase
  | "protected_image" // KEEP images never touched

const GOOGLE_OWNED = new Set([
  "google_rating", "google_review_count", "latitude", "longitude",
  "address", "city", "state", "zip",
])
const REFRESHABLE_OFFICIAL = new Set([
  "website_url", "phone", "leasing_email", "amenities_url", "floor_plans_url",
  "tour_scheduling_url", "availability_url", "tour_url", "apply_url",
  "leasing_hours", "tour_hours_notes",
])
const TIME_SENSITIVE = new Set(["current_special", "current_special_checked_at", "current_special_source"])
const COMMISSION = new Set(["send_commission", "escort_commission", "bonus_flat"])

export function fieldOwnership(field: string): OwnershipClass {
  if (COMMISSION.has(field)) return "protected_commission"
  if (field.startsWith("property_image")) return "protected_image"
  if (GOOGLE_OWNED.has(field)) return "google_owned"
  if (REFRESHABLE_OFFICIAL.has(field)) return "refreshable_official"
  if (TIME_SENSITIVE.has(field)) return "time_sensitive_special"
  return "stable_curated"
}

// Junk tokens that mark a keyword/value as malformed (page artifacts, file refs, nav).
const JUNK_TOKENS = new Set([
  "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "css", "js", "html",
  "n/a", "na", "tbd", "null", "none", "undefined", "logo", "menu", "home",
  "nav", "image", "img", "icon", "click", "here", "read", "more", "learn",
])

function looksJunk(tok: string): boolean {
  const t = tok.trim().toLowerCase()
  if (t.length < 3) return true
  if (JUNK_TOKENS.has(t)) return true
  if (/\.(svg|png|jpe?g|gif|webp|css|js)$/i.test(t)) return true
  return false
}

/**
 * Is an EXISTING stored value demonstrably malformed for its field? Only such values
 * are eligible for replacement by a verified authoritative candidate; valid (even if
 * sparse) curated values are never treated as malformed.
 */
export function isMalformedValue(field: string, currentText: string | null): boolean {
  if (currentText === null) return false
  if (field === "location_keywords" || field === "amenity_keywords") {
    let arr: unknown
    try { arr = JSON.parse(currentText) } catch { return false }
    if (!Array.isArray(arr) || arr.length === 0) return true
    // Malformed if ANY element is a junk artifact (e.g. "svg").
    return arr.some((x) => typeof x !== "string" || looksJunk(x))
  }
  if (field === "google_rating") {
    const n = Number(currentText)
    return Number.isNaN(n) || n < 0 || n > 5
  }
  return false
}
