/**
 * U.S. phone completeness — the ONE rule every lead entry point now enforces. Pure, no DB:
 *   npx tsx scripts/tests/us-phone-validation.test.ts
 *
 * Locator Beast is U.S.-only for phone numbers. After formatting characters are
 * stripped, a valid number is exactly 10 digits, or 11 when the first is the U.S.
 * country code 1. Everything else is REJECTED — never silently truncated.
 *
 * Regression under test: a 9-digit number (a real 10-digit number missing its last
 * digit) was previously accepted by every gate — the mask produced a convincing
 * "(512) 555-123", the client checked nothing, and the server validated only type
 * and max length — and was stored verbatim, which also permanently disabled
 * duplicate detection for that lead (normalizeLead returns null for ≠10 digits).
 */
import { isValidUsPhone, formatPhoneInput } from "../../lib/utils/formatPhone"

let pass = 0,
  fail = 0
const ok = (c: boolean, name: string) => {
  if (c) pass++
  else {
    fail++
    console.error("✗", name)
  }
}
const accepts = (raw: string, name: string) => ok(isValidUsPhone(raw) === true, `ACCEPT ${JSON.stringify(raw)} — ${name}`)
const rejects = (raw: string, name: string) => ok(isValidUsPhone(raw) === false, `REJECT ${JSON.stringify(raw)} — ${name}`)

// ─── The reported defect: incomplete U.S. numbers ────────────────────────────
rejects("(512) 555-123", "9 digits — the exact bug: a 10-digit number missing its last digit")
rejects("5125551234".slice(0, 9), "9 bare digits")
rejects("(832) 490-077", "9 digits, the real lead's number one digit short")
rejects("512555", "6 digits")
rejects("5", "1 digit")
rejects("", "empty string is not a valid FORMAT (presence is the caller's rule)")
rejects("abc", "no digits at all")
rejects("(   )    -    ", "punctuation only, zero digits")

// ─── Valid 10-digit U.S. numbers, in every shape the app produces ────────────
accepts("5125551234", "10 bare digits")
accepts("(512) 555-1234", "the mask's finished output")
accepts("512-555-1234", "dashed")
accepts("512.555.1234", "dotted")
accepts("512 555 1234", "spaced")
accepts(formatPhoneInput("5125551234"), "round-trips the app's own mask")
accepts("(832) 490-0779", "the real lead's stored phone")

// ─── 11 digits, ONLY with a leading 1 ────────────────────────────────────────
accepts("15125551234", "11 digits starting with 1 — U.S. country code")
accepts("+1 (512) 555-1234", "E.164-ish U.S. with punctuation")
accepts("1-512-555-1234", "dashed with country code")
rejects("25125551234", "11 digits NOT starting with 1 — not a U.S. number")
rejects("95125551234", "11 digits starting with 9")

// ─── International is rejected, not mangled ──────────────────────────────────
// The regression this guards: formatPhoneInput strips "+" and slices to 10, so a
// UK number used to be stored as "(442) 079-4609" — a plausible-looking Texas
// number that silently dropped two digits.
rejects("+44 20 7946 0958", "UK — 12 digits, must be rejected not truncated")
rejects("+33 1 42 68 53 00", "France")
rejects("+52 55 1234 5678", "Mexico — 12 digits")
ok(
  formatPhoneInput("+44 20 7946 0958") === "(442) 079-4609" && !isValidUsPhone("+44 20 7946 0958"),
  "the mask still mangles a UK number, but isValidUsPhone now rejects it before it can be stored",
)

// ─── Over-long input is rejected ─────────────────────────────────────────────
rejects("512555123456", "12 digits")
rejects("1512555123456", "13 digits with leading 1")

// ─── Null / undefined tolerance (callers pass possibly-absent values) ────────
ok(isValidUsPhone(undefined as unknown as string) === false, "undefined is rejected, does not throw")
ok(isValidUsPhone(null as unknown as string) === false, "null is rejected, does not throw")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
