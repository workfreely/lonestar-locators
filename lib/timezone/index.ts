import { fromZonedTime } from "date-fns-tz"

/**
 * Account-level timezone support.
 *
 * The locator's saved IANA timezone (profiles.timezone → workspaces.timezone →
 * this default, via the resolve_timezone DB function) is the ONE source of truth
 * for workflow scheduling and display. Timestamps are stored as UTC instants; the
 * "9:00 AM tomorrow" calculation happens in the saved zone FIRST (DST-safe via
 * date-fns-tz — never manual offset math).
 */
export const DEFAULT_TIMEZONE = "America/Chicago"

/** The device's IANA timezone. Used ONLY to seed the first-login confirmation —
 *  never to silently overwrite a saved account timezone. */
export function detectBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

// Canonical IANA zone identifiers, e.g. "America/Chicago". Intl.supportedValuesOf
// returns exactly the canonical set — 418 zones — and deliberately excludes both
// abbreviations ("CST", "EST", "PST") and backward-compatibility links
// ("US/Central", "EST5EDT"). That exclusion is the whole point of using it.
//
// Built once: the list is static for the life of the process.
const CANONICAL_TIME_ZONES: ReadonlySet<string> = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
)

// "UTC" is allowed explicitly. It is a genuine tz-database identifier that every
// runtime resolves, and it is unambiguous — unlike "CST", it names no region and
// carries no DST rules. It is missing from supportedValuesOf only because that
// list reports zones in Region/City form. "Etc/UTC" and the rest of "Etc/*" stay
// rejected: the Etc/GMT±N zones invert the sign of the offset and are a
// well-known foot-gun, and nothing in this app emits them.
const EXTRA_ALLOWED_ZONES: ReadonlySet<string> = new Set(["UTC"])

/**
 * Whether a string is a CANONICAL IANA zone identifier.
 *
 * Previously this only asked whether Intl could construct a formatter for the
 * value, which V8 answers "yes" to for legacy aliases — so "CST" passed and was
 * stored, despite the API documenting IANA ids only. An abbreviation is
 * genuinely ambiguous (CST is both US Central and China Standard Time), so
 * accepting one meant storing a timezone we could not reliably schedule against.
 */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false
  if (EXTRA_ALLOWED_ZONES.has(tz)) return true
  if (CANONICAL_TIME_ZONES.size > 0) return CANONICAL_TIME_ZONES.has(tz)

  // Fallback for a runtime without supportedValuesOf (pre-2022 browsers). Require
  // the Region/City shape, which alone rejects every bare abbreviation, and still
  // require that the runtime can resolve it.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z0-9_+\/-]+$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** "Central Time — America/Chicago" style label for the confirmation + settings. */
export function formatTimeZoneLabel(tz: string): string {
  try {
    const long =
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? tz
    return `${long} — ${tz}`
  } catch {
    return tz
  }
}

/**
 * The UTC instant for `hour:00` wall-clock in `timeZone`, on the calendar day that
 * is `dayOffset` days after `base`'s day IN THAT ZONE. DST-safe: the wall-clock →
 * UTC conversion is done by date-fns-tz using the IANA zone, so it applies the
 * correct offset on either side of a transition. No manual offset arithmetic.
 */
export function atHourInZone(base: Date, dayOffset: number, hour: number, timeZone: string): Date {
  // Calendar Y-M-D of `base` as seen in the target zone (en-CA → "YYYY-MM-DD").
  const [y, m, d] = base
    .toLocaleDateString("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .split("-")
    .map(Number)
  // Advance calendar days on the date-only key (UTC math here is offset-independent).
  const target = new Date(Date.UTC(y, m - 1, d + dayOffset))
  const iso =
    `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(target.getUTCDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00`
  // Interpret that naive wall-clock AS local time in the zone → the UTC instant.
  return fromZonedTime(iso, timeZone)
}

/** Curated common US zones for the Account Profile picker (fallback when the
 *  detected zone needs changing). Value is the IANA id; label is human-friendly. */
export const COMMON_TIMEZONES: { tz: string; label: string }[] = [
  { tz: "America/New_York", label: "Eastern Time" },
  { tz: "America/Chicago", label: "Central Time" },
  { tz: "America/Denver", label: "Mountain Time" },
  { tz: "America/Phoenix", label: "Mountain Time — Arizona (no DST)" },
  { tz: "America/Los_Angeles", label: "Pacific Time" },
  { tz: "America/Anchorage", label: "Alaska Time" },
  { tz: "Pacific/Honolulu", label: "Hawaii Time" },
]
