// Social Autopilot — human-readable Content Library name builder (pure; server-safe).
//
// Default format when metadata exists:  "Property Name - Market - YYYY-MM-DD - NN"
// Temporary format before metadata:      "<original filename base> - YYYY-MM-DD - NN"
// The name is display-only metadata — it never affects the immutable storage path.
import { normalizeSocialMarket } from "@/lib/social/markets"
import { dateKeyInTz } from "@/lib/social/recurrence"

// Keep letters, numbers, spaces, underscores and hyphens; collapse whitespace.
function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, " ").trim()
}

export function padSeq(n: number | null | undefined): string {
  const v = typeof n === "number" && n > 0 ? n : 1
  return String(v).padStart(2, "0")
}

export function filenameBase(name: string | null | undefined): string {
  const b = (name ?? "").replace(/\.[^.]+$/, "")
  return clean(b) || "Video"
}

// ── DISPLAY-ONLY presentation of a stored name ──────────────────────────────
//
// "Selene Luxury Residences - Dallas - 2026-10-02 - 01"
//   →  "Selene Luxury Residences - Dallas - Oct 2, 2026 - 01"
//
// The STORED value is never touched. social_content.display_name keeps its ISO
// form, which matters for more than tidiness: the library's search box matches
// against the stored string, and post_name snapshots copy it verbatim. This is a
// pure string transform applied at render time only.
//
// It rewrites the date FOUND IN THE NAME rather than substituting the row's
// created_at. Those are the same value for a system-generated name, but a
// locator-customized name (name_customized = true) may carry a different date or
// none at all, and showing a date the title does not contain would be a
// different change from the one asked for. A name with no ISO date passes
// through untouched.
//
// NO Date IS CONSTRUCTED. The month name comes from a fixed table indexed by the
// string's own digits, so there is no instant to shift: `new Date("2026-10-02")`
// parses as UTC midnight and renders "Oct 1" for anyone behind UTC, which is the
// off-by-one-day bug this codebase has already paid for in move_date and
// move-month SMS copy. Deliberately not toLocaleDateString for the same reason.
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const

/** Days in a month, with the full Gregorian leap rule (not just %4). */
function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month1) ? 30 : 31
}

/**
 * Render a stored display name for humans: every `YYYY-MM-DD` becomes
 * `Mon D, YYYY`. Everything else — property, market, sequence, separators,
 * custom text — is returned exactly as stored.
 *
 * An impossible date (2026-02-31) is left in its ISO form rather than rendered
 * as "Feb 31, 2026": showing the raw value is the more honest failure.
 */
export function formatSocialDisplayName(name: string | null | undefined): string {
  if (!name) return ""
  const withDates = name.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (whole, y: string, m: string, d: string) => {
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)
    if (month < 1 || month > 12) return whole
    if (day < 1 || day > daysInMonth(year, month)) return whole
    return `${MONTHS_SHORT[month - 1]} ${day}, ${year}`
  })
  return stripTrailingSeq(withDates)
}

/**
 * Drop the trailing ` - NN` batch sequence from a DISPLAYED name.
 *
 *   "EastEnder - Dallas - Oct 4, 2026 - 01"  →  "EastEnder - Dallas - Oct 4, 2026"
 *
 * The sequence is still stored, still written by buildSocialDisplayName, and
 * still what batch_seq means — this only stops showing it.
 *
 * DELIBERATELY NARROW. It matches only a ` - ` separator followed by one or two
 * digits AT THE VERY END, which is exactly the shape padSeq() emits (01…99). It
 * does not touch numbers anywhere else, so property names keep theirs:
 *
 *   "The M9 - Austin - Sep 10, 2026 - 02"  →  "The M9 - Austin - Sep 10, 2026"
 *   "Knox 1200 - Dallas"                   →  unchanged (not trailing)
 *   "Property 12"                          →  unchanged (no " - " separator)
 *   "Studio - 1200"                        →  unchanged (4 digits, not a seq)
 *
 * A name ending in a 3+ digit number is left alone: padSeq pads to two and only
 * reaches three digits past 99 uploads in one batch, at which point guessing
 * wrong and eating a real number is the worse error.
 */
function stripTrailingSeq(name: string): string {
  return name.replace(/\s-\s\d{1,2}$/, "")
}

/**
 * The calendar day a display name carries, in CENTRAL time.
 *
 * ── THE BUG THIS REPLACES ─────────────────────────────────────────────────────────────────
 * This was `(opts.dateISO ?? "").slice(0, 10)` — the first ten characters of a UTC ISO string,
 * which is the UTC calendar day, not ours. Central is UTC-5 in summer and UTC-6 in winter, so
 * anything uploaded after 7pm (6pm in winter) was named with TOMORROW'S date:
 *
 *     Oct 17 18:30 CDT → 2026-10-17   correct
 *     Oct 17 19:30 CDT → 2026-10-18   WRONG — the Central day is still the 17th
 *     Dec 17 18:30 CST → 2026-12-18   WRONG — the winter window opens an hour earlier
 *
 * dateKeyInTz handles the offset AND the daylight-saving switch, because Intl resolves
 * America/Chicago for the specific instant rather than applying a fixed offset. It is the same
 * helper the recurrence engine already uses to decide which day a scheduled post belongs to, so
 * a name and a schedule can no longer disagree about what day it is.
 *
 * AN UNPARSEABLE DATE YIELDS "", exactly as the old slice did for a malformed string — the name is
 * built without a date rather than with a wrong one or the word "Invalid".
 */
function centralDay(dateISO: string | null | undefined): string {
  const raw = (dateISO ?? "").trim()
  if (!raw) return ""
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  return dateKeyInTz(d)
}

export function buildSocialDisplayName(opts: {
  propertyName?: string | null
  market?: string | null
  dateISO?: string | null
  seq?: number | null
  fallbackFilename?: string | null
}): string {
  const date = centralDay(opts.dateISO)
  const prop = clean(opts.propertyName)
  const market = clean(normalizeSocialMarket(opts.market))
  const parts: string[] = []
  if (prop) parts.push(prop)
  if (market) parts.push(market)
  if (parts.length === 0) parts.push(filenameBase(opts.fallbackFilename)) // temporary name
  if (date) parts.push(date)
  parts.push(padSeq(opts.seq))
  return parts.filter(Boolean).join(" - ")
}
