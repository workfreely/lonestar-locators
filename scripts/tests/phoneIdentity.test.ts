/**
 * CANONICAL PHONE IDENTITY — the rules Beast Sync attribution depends on.
 *
 * The assertions that earn their place are the ones that fail under the OLD
 * last-10-digit rule:
 *   • "+44 20 7946 0958" must not become a Maine number;
 *   • a Canadian number must be caught even with no "+" prefix;
 *   • every U.S. formatting variant must collapse to ONE identity;
 *   • an ineligible number must have NO identity at all, so it cannot match.
 *
 * Run: npx tsx scripts/tests/phoneIdentity.test.ts
 */
import {
  phoneIdentity,
  toE164,
  sameIdentity,
  ineligibilityMessage,
  BEAST_SYNC_REGIONS,
} from "../../lib/phone/identity"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

/** The rule this module replaced, kept here to prove each fix is a real fix. */
const oldLast10 = (raw: string) => (raw || "").replace(/\D/g, "").slice(-10)

console.log("\nCANONICAL PHONE IDENTITY\n")

console.log("Every U.S. formatting variant is ONE identity (requirement 5)")
const VARIANTS = [
  "(210) 555-1234",
  "2105551234",
  "1-210-555-1234",
  "+1 210-555-1234",
  "+12105551234",
  "210.555.1234",
  "  210 555 1234  ",
  "210-555-1234",
  "(210)555-1234",
  "1 (210) 555-1234",
]
for (const v of VARIANTS) {
  check(`${JSON.stringify(v)} → +12105551234`, toE164(v) === "+12105551234", String(toE164(v)))
}
check(
  "all variants are mutually identical",
  VARIANTS.every((v) => sameIdentity(v, VARIANTS[0])),
)

console.log("\nNon-U.S. numbers cannot match by last-10 coincidence (requirement 6)")
// The measured false positive: 207 is a Maine area code, so the old rule made a
// London number indistinguishable from one.
check(
  "London +44 20 7946 0958 is NOT eligible",
  phoneIdentity("+44 20 7946 0958").eligible === false,
)
check("…and has NO identity to match with", toE164("+44 20 7946 0958") === null)
check("…and is correctly recognised as GB", phoneIdentity("+44 20 7946 0958").region === "GB")
check("…and is still acknowledged as a real number", phoneIdentity("+44 20 7946 0958").valid === true)
check(
  "…whereas the OLD rule collapsed it to a Maine number (proof this is a real fix)",
  oldLast10("+44 20 7946 0958") === oldLast10("(207) 946-0958"),
)
check(
  "the London number never equals the Maine lead under the new rule",
  !sameIdentity("+44 20 7946 0958", "(207) 946-0958"),
)
check("Mexico +52 55 1234 5678 is not eligible", !phoneIdentity("+52 55 1234 5678").eligible)
check("an explicit +44 is respected even though US is the default region", phoneIdentity("+442079460958").region === "GB")

console.log("\n+1 is not 'the United States' (the NANP trap)")
check("Canada +1 416 555 1234 is not eligible", !phoneIdentity("+1 416 555 1234").eligible)
check("Canada is resolved as CA, not US", phoneIdentity("+1 416 555 1234").region === "CA")
// This is the one that would sink a hand-rolled rule: no "+" at all, 10 digits,
// indistinguishable from a US number by shape alone.
check("a BARE Canadian 4165551234 is still caught as CA", phoneIdentity("4165551234").region === "CA")
check("…and is not eligible", !phoneIdentity("4165551234").eligible)
check("Jamaica +1 876 555 1234 is not eligible", !phoneIdentity("+1 876 555 1234").eligible)
check("Dominican Republic +1 809 555 1234 is not eligible", !phoneIdentity("+1 809 555 1234").eligible)
check(
  "no +1 number is eligible merely for being +1",
  ["+14165551234", "+18765551234", "+18095551234", "+12425551234"].every((n) => !phoneIdentity(n).eligible),
)

console.log("\nU.S. territories ARE the United States (approved explicitly)")
const TERRITORIES: Array<[string, string, string]> = [
  ["Puerto Rico", "+1 787 555 1234", "PR"],
  ["Puerto Rico (939)", "+1 939 555 1234", "PR"],
  ["U.S. Virgin Islands", "+1 340 755 1234", "VI"],
  ["Guam", "+1 671 555 1234", "GU"],
  ["Northern Mariana Islands", "+1 670 555 1234", "MP"],
  ["American Samoa", "+1 684 555 1234", "AS"],
]
for (const [label, num, region] of TERRITORIES) {
  const id = phoneIdentity(num)
  check(`${label} ${num} → eligible, region ${region}`, id.eligible && id.region === region, `got ${id.region}/${id.reason}`)
}
check("all six approved regions are declared", BEAST_SYNC_REGIONS.length === 6)
check(
  "the declared region list is exactly the approved set",
  ["US", "PR", "VI", "GU", "MP", "AS"].every((r) => (BEAST_SYNC_REGIONS as readonly string[]).includes(r)),
)
check("CA is NOT in the region list", !(BEAST_SYNC_REGIONS as readonly string[]).includes("CA"))

console.log("\nAn ineligible number has no identity, so it cannot match anything")
for (const bad of ["", "   ", "client@example.com", "12345", "abc", "+44 20 7946 0958", "4165551234"]) {
  check(`${JSON.stringify(bad)} → e164 null`, toE164(bad) === null)
}
check("null input → null", toE164(null) === null)
check("undefined input → null", toE164(undefined) === null)
check("two ineligible numbers are never 'the same'", !sameIdentity("", ""))
check("an ineligible number never equals an eligible one", !sameIdentity("+442079460958", "+12105551234"))
check(
  "two IDENTICAL ineligible numbers still do not match (null is not an identity)",
  !sameIdentity("+442079460958", "+442079460958"),
)

console.log("\nReal stored values from production")
// Measured by scripts/companion/auditPhoneIdentity.ts against the live table.
check("(512) 555-0000 is eligible", phoneIdentity("(512) 555-0000").eligible)
check("(832) 456-0452 is eligible", phoneIdentity("(832) 456-0452").eligible)
check("bare 2105550199 is eligible", phoneIdentity("2105550199").eligible)
// Area code 222 is unassigned in the NANP, so neither of these is dialable.
// isValidUsPhone() accepted both on digit count alone.
check("(222) 009-2983 is rejected (exchange 009 is illegal)", !phoneIdentity("(222) 009-2983").eligible)
check("…with reason 'invalid', not 'non_us_region'", phoneIdentity("(222) 009-2983").reason === "invalid")
check("(222) 222-2222 is rejected (unassigned area code)", !phoneIdentity("(222) 222-2222").eligible)

console.log("\nReasons are specific enough to act on")
check("empty → 'empty'", phoneIdentity("").reason === "empty")
check("e-mail handle → 'unparseable'", phoneIdentity("client@example.com").reason === "unparseable")
check("unassigned area code → 'invalid'", phoneIdentity("(222) 222-2222").reason === "invalid")
check("London → 'non_us_region'", phoneIdentity("+442079460958").reason === "non_us_region")
check("eligible → reason null", phoneIdentity("+12105551234").reason === null)
check("an absent phone produces NO error message", ineligibilityMessage(phoneIdentity("")) === null)
check("an eligible phone produces NO error message", ineligibilityMessage(phoneIdentity("2105551234")) === null)
check(
  "a foreign number's message says the number is KEPT",
  (ineligibilityMessage(phoneIdentity("+442079460958")) ?? "").includes("saved as contact information"),
)
check(
  "no message leaks library or region-code jargon",
  ["+442079460958", "(222) 222-2222", "client@example.com"]
    .map((n) => ineligibilityMessage(phoneIdentity(n)) ?? "")
    .every((m) => m.length > 0 && !/e164|E\.164|libphonenumber|NANP|region code/i.test(m)),
)

console.log("\nIdentity is stable and idempotent")
check("re-normalizing an identity is a no-op", toE164(toE164("(210) 555-1234")) === "+12105551234")
check(
  "identity is stable across 100 round-trips",
  (() => {
    let v: string | null = "210.555.1234"
    for (let i = 0; i < 100; i++) v = toE164(v)
    return v === "+12105551234"
  })(),
)
// An extension identifies a desk behind a switchboard, not a texting endpoint: a
// message arrives from the line itself. So "ext 99" must collapse to the SAME
// identity rather than a separate one, or a lead whose number was entered with an
// extension could never be attributed.
check("an extension collapses to the base identity", toE164("+1 210 555 1234 ext 99") === "+12105551234")
check(
  "every extension spelling gives the same identity",
  ["210-555-1234 x99", "2105551234ext99", "(210) 555-1234 ext. 5"].every((n) => toE164(n) === "+12105551234"),
)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
