// hasSuccessfulContact — the canonical "has this lead ever been successfully
// contacted?" rule that routes Beast Voice Text/Call between the first-contact
// gate and normal communication. Pure, so every audited edge is asserted here.
// Run: npx tsx scripts/tests/contactState.test.ts

import { hasSuccessfulContact } from "../../lib/leads/contactState"

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.log(`  ✗ ${name}\n      expected ${e}\n      actual   ${a}`)
  }
}

const AT = "2026-09-16T10:00:00.000Z"

console.log("\ncanonical signal — first_text_sent_at (NOT crm_status)")
// A. New, never contacted → gate (false)
check("New, no contact", hasSuccessfulContact({ crm_status: "new", first_text_sent_at: null }), false)
// B. Contacted, first contact recorded → normal (true)
check("Contacted, contacted", hasSuccessfulContact({ crm_status: "contacted", first_text_sent_at: AT }), true)
// C. Searching, contacted → normal (true)
check("Searching, contacted", hasSuccessfulContact({ crm_status: "searching", first_text_sent_at: AT }), true)
// C2. List Sent, contacted → normal (true)
check("List Sent, contacted", hasSuccessfulContact({ crm_status: "list_sent", first_text_sent_at: AT }), true)
// D. Moved back to New but first_text_sent_at persists → normal (true), no replay
check("Re-New'd but historically contacted → true (no replay)", hasSuccessfulContact({ crm_status: "new", first_text_sent_at: AT }), true)
// E. Contacted via No Answer only (first_text_sent_at null) → gate (false)
check("Contacted via No Answer, never reached → false (gate)", hasSuccessfulContact({ crm_status: "contacted", first_text_sent_at: null }), false)
// F. Contacted via Text Sent only (first_text_sent_at null) → gate (false)
check("Contacted via Text Sent, never reached → false (gate)", hasSuccessfulContact({ crm_status: "contacted", first_text_sent_at: undefined }), false)

console.log("\nignores crm_status entirely — only contact history matters")
check("set + stage new → true", hasSuccessfulContact({ crm_status: "new", first_text_sent_at: AT }), true)
check("null + stage contacted → false", hasSuccessfulContact({ crm_status: "contacted", first_text_sent_at: null }), false)

console.log("\nrobustness")
check("empty string → false", hasSuccessfulContact({ first_text_sent_at: "" }), false)
check("whitespace → false", hasSuccessfulContact({ first_text_sent_at: "   " }), false)
check("missing field → false", hasSuccessfulContact({ crm_status: "contacted" }), false)
check("null lead → false", hasSuccessfulContact(null), false)
check("undefined lead → false", hasSuccessfulContact(undefined), false)

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
