// NEW-LEAD TEXT 1 — the approved wording, built from the renter's own saved criteria.
//
// Pure and offline. Run: `npx tsx scripts/tests/newLeadText1.test.ts`
// Renders strings. Sends nothing, enrolls nothing, touches no lead.
//
// ── WHAT THE LIVE TEST SENT, AND WHY ────────────────────────────────────────────────────────
// Lead 91 is a 1 bed High-Rise moving 2026-10-17, and Text 1 went out as:
//     "Hey Testy it's Jay! I got your form for a high-rise move in October."
// The bedroom count is missing because the old bedsPhrase RETURNED EARLY on a high-rise:
//     if (t === "high-rise") return "high-rise"
// — the property type short-circuited the beds branch entirely, so every high-rise lead lost
// its layout. And the hyphen survived into a text message, where it reads like a listing
// rather than a person.
//
// The approved wording is "1 bed high rise": casual, short, and specific to what they asked for.

import {
  renderNewLeadText1,
  bedsLabel,
  propertyTypeLabel,
  searchPhrase,
  NEW_LEAD_TEXT2,
} from "@/lib/followup/copy"
import { PROPERTY_TYPES, BED_OPTIONS } from "@/lib/formOptions"
import { NEW_LEAD_TEXT1_DELAY_MS } from "@/lib/followup/cadence"
import {
  ALLOWED_START_MIN, ALLOWED_END_MIN, DOUBLE_TEXT_MIN_MS, DOUBLE_TEXT_MAX_MS,
} from "@/lib/followup/pacing"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
function eq(label: string, actual: string, expected: string) {
  if (actual === expected) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`) }
}

const lead = (o: Record<string, unknown>) =>
  ({ firstName: "Testy", agentFirstName: "Jay", beds: null, propertyType: null, moveMonthLabel: null, ...o }) as never

// ── THE APPROVED EXAMPLES, BYTE FOR BYTE ────────────────────────────────────────────────────
console.log("\nThe approved examples")
eq("1 bed high rise, October",
  renderNewLeadText1(lead({ beds: "1", propertyType: "High-Rise", moveMonthLabel: "October" })),
  "Hey Testy it's Jay! I got your form for a 1 bed high rise move in October.")
eq("2 bed apartment, November",
  renderNewLeadText1(lead({ firstName: "Sarah", beds: "2", propertyType: "Apartment", moveMonthLabel: "November" })),
  "Hey Sarah it's Jay! I got your form for a 2 bed apartment move in November.")
eq("3 bed townhome, December",
  renderNewLeadText1(lead({ firstName: "Kevin", beds: "3", propertyType: "Townhome", moveMonthLabel: "December" })),
  "Hey Kevin it's Jay! I got your form for a 3 bed townhome move in December.")
eq("studio, October",
  renderNewLeadText1(lead({ firstName: "Alex", beds: "Studio", moveMonthLabel: "October" })),
  "Hey Alex it's Jay! I got your form for a studio move in October.")
eq("1 bed apartment, no move-in date",
  renderNewLeadText1(lead({ firstName: "Taylor", beds: "1", propertyType: "Apartment" })),
  "Hey Taylor it's Jay! I got your form for a 1 bed apartment.")
eq("missing bedroom and property type",
  renderNewLeadText1(lead({ firstName: "Jordan" })),
  "Hey Jordan it's Jay! I got your form!")

// ── THE EXACT LIVE LEAD ─────────────────────────────────────────────────────────────────────
console.log("\nLead 91, as production stores it")
eq("the message it would send now",
  renderNewLeadText1(lead({ firstName: "Testy", beds: "1", propertyType: "High-Rise", moveMonthLabel: "October" })),
  "Hey Testy it's Jay! I got your form for a 1 bed high rise move in October.")
// NEGATIVE CONTROL on the actual defect: what it used to send must now be impossible.
ok("the old high-rise output is gone",
  renderNewLeadText1(lead({ beds: "1", propertyType: "High-Rise", moveMonthLabel: "October" }))
    !== "Hey Testy it's Jay! I got your form for a high-rise move in October.")

// ── FORMATTING RULES ────────────────────────────────────────────────────────────────────────
console.log("\nFormatting")
const all = [
  lead({ beds: "1", propertyType: "High-Rise", moveMonthLabel: "October" }),
  lead({ beds: "Studio", moveMonthLabel: "May" }),
  lead({ beds: "3+", propertyType: "Rental Home" }),
  lead({ firstName: "Jordan" }),
].map((l) => renderNewLeadText1(l))
ok("no comma after the first name", all.every((m) => !/^Hey \S+,/.test(m)))
ok("exactly one space between words — never a double", all.every((m) => !/ {2,}/.test(m)))
ok("no leading or trailing whitespace", all.every((m) => m === m.trim()))
ok("no non-breaking or exotic spaces", all.every((m) => !/[^\S ]/.test(m)))
ok("no hyphen anywhere in the message", all.every((m) => !m.includes("-")))
ok("no emoji", all.every((m) => !/\p{Extended_Pictographic}/u.test(m)))
ok("the exclamation point after the agent name is kept", all.every((m) => m.includes("it's Jay!") || m.includes("Jordan it's Jay!")))
ok("every message ends in a period or that exclamation point", all.every((m) => /[.!]$/.test(m)))
ok("no doubled punctuation", all.every((m) => !/[.!?]{2,}/.test(m)))
ok("never the listing register '1-bedroom apartment'", all.every((m) => !/bedroom/i.test(m)))

// ── NAMES ───────────────────────────────────────────────────────────────────────────────────
console.log("\nNames")
eq("leading and trailing whitespace is stripped",
  renderNewLeadText1(lead({ firstName: "  Testy  ", beds: "1", propertyType: "High-Rise", moveMonthLabel: "October" })),
  "Hey Testy it's Jay! I got your form for a 1 bed high rise move in October.")
eq("a tab or newline in the name collapses to one space",
  renderNewLeadText1(lead({ firstName: "\tTesty\n", beds: "1", propertyType: "Apartment" })),
  "Hey Testy it's Jay! I got your form for a 1 bed apartment.")
eq("an agent name with padding is clean too",
  renderNewLeadText1(lead({ firstName: "Sarah", agentFirstName: "  Jay ", beds: "2", propertyType: "Apartment", moveMonthLabel: "June" })),
  "Hey Sarah it's Jay! I got your form for a 2 bed apartment move in June.")

// ── BEDROOMS ────────────────────────────────────────────────────────────────────────────────
console.log("\nBedrooms")
eq("studio", bedsLabel("Studio"), "studio")
eq("0 is a studio", bedsLabel("0"), "studio")
eq("1", bedsLabel("1"), "1 bed")
eq("2", bedsLabel("2"), "2 bed")
eq("3", bedsLabel("3"), "3 bed")
eq("4", bedsLabel("4"), "4 bed")
eq("3+ keeps its plus", bedsLabel("3+"), "3+ bed")
eq("the stored label form, '3+ Bedrooms'", bedsLabel("3+ Bedrooms"), "3+ bed")
eq("'2 Bedrooms' normalizes", bedsLabel("2 Bedrooms"), "2 bed")
eq("whitespace is tolerated", bedsLabel("  2  "), "2 bed")
for (const [label, v] of [["null", null], ["undefined", undefined], ["empty", ""], ["whitespace", "   "], ["non-numeric", "n/a"]] as const) {
  eq(`${label} invents no count`, bedsLabel(v), "")
}
// EVERY option the form actually offers must render.
console.log("\nEvery BED_OPTIONS value")
for (const o of BED_OPTIONS) ok(`${o.value} → ${JSON.stringify(bedsLabel(o.value))}`, bedsLabel(o.value).length > 0)

// ── PROPERTY TYPES ──────────────────────────────────────────────────────────────────────────
console.log("\nProperty types")
eq("High-Rise loses its hyphen", propertyTypeLabel("High-Rise"), "high rise")
eq("Apartment", propertyTypeLabel("Apartment"), "apartment")
eq("Townhome", propertyTypeLabel("Townhome"), "townhome")
eq("Loft", propertyTypeLabel("Loft"), "loft")
eq("Rental Home", propertyTypeLabel("Rental Home"), "rental home")
eq("Penthouse", propertyTypeLabel("Penthouse"), "penthouse")
eq("Studio is a layout here, not a type", propertyTypeLabel("Studio"), "")
eq("Open to All is the ABSENCE of a choice", propertyTypeLabel("Open to All"), "")
for (const [label, v] of [["null", null], ["empty", ""], ["unknown", "Houseboat"]] as const) {
  eq(`${label} yields nothing`, propertyTypeLabel(v), "")
}
// THE CANONICAL LIST, not a second one: every value the form offers resolves here.
console.log("\nEvery PROPERTY_TYPES value")
for (const t of PROPERTY_TYPES) {
  const out = propertyTypeLabel(t)
  const expectedBlank = t === "Studio" || t === "Open to All"
  ok(`${t} → ${JSON.stringify(out)}`, expectedBlank ? out === "" : out.length > 0 && !out.includes("-"))
}

// ── NO REDUNDANCY, NO BROKEN TEXT ───────────────────────────────────────────────────────────
console.log("\nNothing redundant, nothing broken")
eq("studio never gains a type", searchPhrase(lead({ beds: "Studio", propertyType: "Apartment" })), "studio")
eq("a Studio property type with no beds still reads 'studio'", searchPhrase(lead({ propertyType: "Studio" })), "studio")
eq("Open to All leaves the count alone", searchPhrase(lead({ beds: "2", propertyType: "Open to All" })), "2 bed")
const broken = [
  renderNewLeadText1(lead({ moveMonthLabel: "October" })),
  renderNewLeadText1(lead({ beds: "", propertyType: "", moveMonthLabel: "October" })),
  renderNewLeadText1(lead({ propertyType: "Open to All", moveMonthLabel: "October" })),
]
ok("month alone NEVER produces 'for a move in October'", broken.every((m) => !/for a move in/.test(m)))
ok("it degrades to the clean short form instead", broken.every((m) => m.endsWith("I got your form!")))
ok("never 'undefined' or 'null' in a client's message", broken.every((m) => !/undefined|null|NaN/i.test(m)))
ok("never an empty article phrase 'for a .'", broken.every((m) => !/for an? \./.test(m)))
eq("article agrees with the phrase", renderNewLeadText1(lead({ firstName: "Dana", propertyType: "Apartment", moveMonthLabel: "April" })),
  "Hey Dana it's Jay! I got your form for an apartment move in April.")

// ── MOVE MONTH ──────────────────────────────────────────────────────────────────────────────
// monthLabel pins a date-only value to UTC midnight and formats in UTC, so the month cannot
// slip backwards for a renter in a negative-offset timezone. The first of the month is the
// case that would break: "2026-11-01" must never read "October".
console.log("\nMove month")
function monthOf(moveDate: string): string {
  const d = new Date(moveDate.length <= 10 ? `${moveDate}T00:00:00Z` : moveDate)
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" }).format(d)
}
eq("October 17 → October", monthOf("2026-10-17"), "October")
eq("November 1 does NOT slip to October", monthOf("2026-11-01"), "November")
eq("December 10 → December", monthOf("2026-12-10"), "December")
eq("January 1 does not slip to December", monthOf("2027-01-01"), "January")
ok("no day or year reaches the message",
  !/\b17\b|\b2026\b/.test(renderNewLeadText1(lead({ beds: "1", propertyType: "High-Rise", moveMonthLabel: monthOf("2026-10-17") }))))

// ── EVERYTHING ELSE IS UNTOUCHED ────────────────────────────────────────────────────────────
console.log("\nPreserved")
eq("Text 2 is byte-identical", NEW_LEAD_TEXT2, "Are you trying to stay near a specific address or side of town?")
ok("the five-minute introduction delay", NEW_LEAD_TEXT1_DELAY_MS === 5 * 60 * 1000)
ok("the 30-45 second double-text gap", DOUBLE_TEXT_MIN_MS === 30_000 && DOUBLE_TEXT_MAX_MS === 45_000)
ok("quiet hours still 09:00 to 21:00 client-local", ALLOWED_START_MIN === 9 * 60 && ALLOWED_END_MIN === 21 * 60)
ok("Text 1 stays inside its 180-character limit",
  renderNewLeadText1(lead({ firstName: "Bartholomew", beds: "3+", propertyType: "Rental Home", moveMonthLabel: "September" })).length <= 180)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
