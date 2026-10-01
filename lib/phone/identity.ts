/**
 * CANONICAL PHONE IDENTITY — the one rule that decides whether a phone number can
 * identify a lead for Beast Sync, and what its identity is.
 *
 * Beast Sync attributes an incoming iMessage to a lead by phone number, so the
 * phone IS the identity. That makes "which numbers are the same number?" a
 * correctness question, not a formatting one.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * Four separate rules disagreed about the same number:
 *   lib/leads/normalizeLead      → "2105551234"    (bare 10, dedupe)
 *   lib/messages/getTranscript   → "+12105551234"  (prefixed)
 *   /api/companion/messages      → digits.slice(-10) (attribution)
 *   lib/utils/formatPhone        → isValidUsPhone(): 10 or 11 digits, nothing more
 * Each is defensible alone; together they meant a number could be stored under one
 * rule and looked up under another.
 *
 * ── WHY A LIBRARY AND NOT A REGEX ────────────────────────────────────────────
 * The old rule took the last 10 digits and called it identity. Measured against
 * real input, that attributes "+44 20 7946 0958" (London) to area code 207 —
 * MAINE. A UK client's message would land on a Maine lead's timeline. Digit
 * counting cannot tell these apart, because +1 is not "the US": the North American
 * Numbering Plan is shared with Canada and ~20 Caribbean nations, all under +1.
 *
 * libphonenumber-js carries the actual area-code-to-country map, so a BARE
 * "4165551234" resolves to CA (Toronto) even with a US default region, and
 * "+44 20 7946 0958" stays GB even when US is passed as the default. That is the
 * whole reason for the dependency — not formatting, which we already did fine.
 *
 * ── ELIGIBLE ≠ VALID ─────────────────────────────────────────────────────────
 * A number can be perfectly valid and still not be a Beast Sync identity. These
 * are separate questions and callers need both answers:
 *   valid    — the number is real and dialable
 *   eligible — it is also in a U.S. region, so it may identify a lead here
 * A Canadian number is valid and NOT eligible. We keep it as contact information
 * and refuse to let it identify anyone.
 */
// The "/core" entry with metadata passed in explicitly, rather than the default
// entry that bundles its own. The default entry imports metadata.min.json
// internally, and under a plain ESM/TS loader (tsx, which is how every test suite
// here runs) that JSON arrives wrapped in a module namespace — so the library
// reads `metadataJson.countries` as undefined and throws on the first call. Next's
// bundler unwraps it, which means the default entry would work in the app and
// break only in the tests: the worst of both worlds. Normalizing the interop here
// once makes the same code path run everywhere.
import { parsePhoneNumberFromString as parseWithMetadata } from "libphonenumber-js/core"
import rawMetadata from "libphonenumber-js/metadata.min.json"

const METADATA = ((rawMetadata as unknown as { default?: unknown }).default ?? rawMetadata) as never

const parsePhoneNumberFromString = (text: string, defaultRegion: "US") =>
  parseWithMetadata(text, defaultRegion as never, METADATA)

/**
 * U.S. regions, including the territories — approved explicitly, because
 * residents of Puerto Rico, the U.S. Virgin Islands, Guam, the Northern Mariana
 * Islands and American Samoa are in the U.S. and their numbers must work.
 *
 * These are libphonenumber REGION codes, not country-calling-codes: all six sit
 * under +1, which is exactly why "+1" can never be the test. CA and every
 * Caribbean NANP member are absent on purpose.
 */
export const BEAST_SYNC_REGIONS = ["US", "PR", "VI", "GU", "MP", "AS"] as const
export type BeastSyncRegion = (typeof BEAST_SYNC_REGIONS)[number]

const REGION_SET: ReadonlySet<string> = new Set(BEAST_SYNC_REGIONS)

export type PhoneIneligibleReason =
  /** Nothing was supplied. Not an error — most leads start without a phone. */
  | "empty"
  /** Not a phone number at all (an iMessage e-mail handle, a shortcode, junk). */
  | "unparseable"
  /** Parses, but is not a real dialable number (e.g. an unassigned area code). */
  | "invalid"
  /** Real and dialable, but outside the U.S. — valid contact info, never identity. */
  | "non_us_region"

export type PhoneIdentity = {
  /**
   * The canonical identity, e.g. "+12105551234" — the ONLY value that may be
   * compared, indexed or stored as identity. null whenever `eligible` is false,
   * so an ineligible number cannot be matched by accident: there is nothing to
   * match it with.
   */
  e164: string | null
  /** True only when this number may identify a lead for Beast Sync. */
  eligible: boolean
  /** Why not, when it isn't. null when it is. */
  reason: PhoneIneligibleReason | null
  /** Resolved region ("US", "PR", "CA", "GB", …), or null if unparseable. */
  region: string | null
  /** Real and dialable, regardless of region — distinct from `eligible`. */
  valid: boolean
}

const INELIGIBLE = (reason: PhoneIneligibleReason, region: string | null, valid: boolean): PhoneIdentity => ({
  e164: null,
  eligible: false,
  reason,
  region,
  valid,
})

/**
 * Resolve any raw phone input to its canonical identity.
 *
 * Accepts whatever the product actually holds: "(210) 555-1234", "2105551234",
 * "1-210-555-1234", "+1 210-555-1234", an iMessage handle, or an e-mail handle.
 *
 * "US" is the default region so bare 10-digit input — what every one of our write
 * paths stores — parses at all. It does NOT force a number to be American: an
 * explicit "+44…" stays GB, and a bare Canadian area code still resolves to CA.
 * Both are verified in the tests, because this is the single assumption the
 * last-10-digit rule got wrong.
 */
export function phoneIdentity(raw: string | null | undefined): PhoneIdentity {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return INELIGIBLE("empty", null, false)

  const parsed = parsePhoneNumberFromString(trimmed, "US")
  if (!parsed) return INELIGIBLE("unparseable", null, false)

  const region = parsed.country ?? null
  if (!parsed.isValid()) return INELIGIBLE("invalid", region, false)
  if (!region || !REGION_SET.has(region)) return INELIGIBLE("non_us_region", region, true)

  return { e164: parsed.number, eligible: true, reason: null, region, valid: true }
}

/**
 * The canonical identity, or null when the number cannot be one.
 *
 * This is the function nearly every caller wants: write it on a lead, derive it
 * from an inbound message handle, compare two numbers. Returning null for
 * everything ineligible is deliberate — a null can be stored and compared safely
 * (SQL never matches it), whereas a best-effort string invites exactly the
 * accidental matches this module exists to prevent.
 */
export function toE164(raw: string | null | undefined): string | null {
  return phoneIdentity(raw).e164
}

/**
 * Derive `phone_e164` for any lead insert/update patch that sets `phone`.
 *
 * Every write path goes through this rather than each one remembering to compute
 * the identity, because a path that forgets does not fail loudly — it silently
 * produces a lead Beast Sync can never attribute a message to.
 *
 * Only adds the column when `phone` is actually part of the patch. A patch that
 * does not touch the phone must not touch its identity either, or an unrelated
 * edit (a move date, a note) would blank a perfectly good identity.
 */
export function withPhoneIdentity<T extends Record<string, unknown>>(patch: T): T {
  if (!("phone" in patch)) return patch
  return { ...patch, phone_e164: toE164(patch.phone as string | null | undefined) }
}

/** Do two raw numbers denote the same lead? False unless BOTH are eligible. */
export function sameIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toE164(a)
  return x !== null && x === toE164(b)
}

/**
 * Human-facing text for why a number cannot be used by Beast Sync — or null when
 * it can, or when none was given (an absent phone needs no explanation).
 *
 * Says what the locator should DO. "non_us_region" is the one a real client can
 * hit, so it names the consequence rather than the rule: the number is kept, the
 * texting features are not available for it.
 */
export function ineligibilityMessage(id: PhoneIdentity): string | null {
  switch (id.reason) {
    case null:
    case "empty":
      return null
    case "non_us_region":
      return "Beast Sync syncs U.S. numbers only. This number is saved as contact information, but texts to and from it won't sync."
    case "invalid":
      return "This doesn't look like a real U.S. phone number, so texts to and from it won't sync."
    case "unparseable":
      return "This isn't a phone number, so texts to and from it won't sync."
  }
}
