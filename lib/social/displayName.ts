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
 * TWO EXPORTS, ONE DATE RULE. The month table, the leap rule and the no-Date-constructed
 * approach below are shared, so every surface spells a date the same way. They differ only in
 * whether the trailing ` - NN` sequence is shown:
 *
 *   formatSocialDisplayDate  the date rewrite ALONE — the sequence survives.
 *                            For surfaces that show the full stored title, e.g. the Queue:
 *                            "The Drakestone Apartments Unit 1905 - Dallas - Nov 1, 2026 - 01"
 *   formatSocialDisplayName  the same rewrite, then the sequence dropped. This is the Content
 *                            Library preview card's format and is unchanged:
 *                            "The Drakestone Apartments Unit 1905 - Dallas - Nov 1, 2026"
 *
 * Render a stored display name for humans: every `YYYY-MM-DD` becomes
 * `Mon D, YYYY`. Everything else — property, market, unit, sequence, separators,
 * custom text — is returned exactly as stored.
 *
 * An impossible date (2026-02-31) is left in its ISO form rather than rendered
 * as "Feb 31, 2026": showing the raw value is the more honest failure.
 */
export function formatSocialDisplayDate(name: string | null | undefined): string {
  if (!name) return ""
  return name.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (whole, y: string, m: string, d: string) => {
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)
    if (month < 1 || month > 12) return whole
    if (day < 1 || day > daysInMonth(year, month)) return whole
    return `${MONTHS_SHORT[month - 1]} ${day}, ${year}`
  })
}

export function formatSocialDisplayName(name: string | null | undefined): string {
  return stripTrailingSeq(formatSocialDisplayDate(name))
}

/**
 * ── THE VIDEO EDITOR'S PAIR: MM-DD-YYYY in, ISO back out ────────────────────────────────────
 *
 * The Post Editor's Video Title field is an INPUT whose value is saved back to
 * social_content.display_name, which is why formatSocialDisplayDate was deliberately kept away
 * from it — rendering "Oct 17, 2026" into an input saves a month name into the column on the
 * next edit. These two do the same job for a writable field, as an exact round trip:
 *
 *   formatSocialEditableDate  stored → shown    "… - 2026-10-17 - 01"  →  "… - 10-17-2026 - 01"
 *   parseSocialEditableDate   shown  → stored   "… - 10-17-2026 - 01"  →  "… - 2026-10-17 - 01"
 *
 * parse(format(x)) === x for every name, and each is a no-op on the other's output: ISO needs
 * `\d{4}-\d{2}-\d{2}` and MM-DD-YYYY needs `\d{2}-\d{2}-\d{4}`, so neither pattern can read the
 * other's result and no date can be converted twice.
 *
 * SEGMENT-ANCHORED, UNLIKE formatSocialDisplayDate. These match only a whole ` - ` separated
 * segment that is ENTIRELY a date — the shape buildSocialDisplayName emits, since it joins its
 * parts with " - ". The deployed display-only formatter can afford a loose \b scan because it
 * only ever writes to the screen; this pair writes to the database, and a loose scan would
 * rewrite a hand-typed "Unit 01-02-2020 Reno" into "Unit 2020-01-02 Reno" on save. Anchoring to
 * a full segment makes corrupting a manually edited title impossible.
 *
 * NO Date IS CONSTRUCTED here either, for the same reason as above: this is digit reordering,
 * validated against the same daysInMonth leap rule, so there is no instant that can shift a day.
 * An unreal date (2026-02-31, or 13-01-2026 typed by hand) is left exactly as it is — showing
 * the raw value is the more honest failure, and it still round-trips untouched.
 */
const SEP = " - "

function mapSegments(name: string | null | undefined, fn: (seg: string) => string): string {
  if (!name) return ""
  return name.split(SEP).map(fn).join(SEP)
}

/** A real calendar day, by the same leap rule the month table above uses. */
function isRealDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

/** Stored ISO → the Video Editor's MM-DD-YYYY. Everything else is returned exactly as stored. */
export function formatSocialEditableDate(name: string | null | undefined): string {
  return mapSegments(name, (seg) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(seg)
    if (!m) return seg
    const [, y, mm, dd] = m
    if (!isRealDay(Number(y), Number(mm), Number(dd))) return seg
    return `${mm}-${dd}-${y}`
  })
}

/** The Video Editor's MM-DD-YYYY → stored ISO. The inverse of the above, and a no-op on ISO. */
export function parseSocialEditableDate(name: string | null | undefined): string {
  return mapSegments(name, (seg) => {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(seg)
    if (!m) return seg
    const [, mm, dd, y] = m
    if (!isRealDay(Number(y), Number(mm), Number(dd))) return seg
    return `${y}-${mm}-${dd}`
  })
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
