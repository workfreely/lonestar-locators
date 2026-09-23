/**
 * the external site property-email parser — parseCopyEmails reads the authoritative address(es)
 * from a "copy email" affordance's onclick, as DATA (never executed). Pure, no DB/DOM:
 *   npx tsx scripts/tests/external-property-email.test.ts
 *
 * Rules: retain ALL addresses (no ranking/selection/discard), trim, drop empties,
 * de-duplicate EXACT duplicates (order preserved), never rewrite/correct addresses,
 * never use the visible ".email-text" count, and return [] on anything not matching
 * the confirmed copyTextToClipboard('…') shape.
 */
import { parseCopyEmails } from "../../apps/beast-companion/src/content/externalPropertyEmail"

let pass = 0,
  fail = 0
const eqArr = (a: string[], b: string[], name: string) => {
  const ok = a.length === b.length && a.every((v, i) => v === b[i])
  if (ok) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}

// ── Confirmed Alta Center Point example — TWO emails, both retained, in order ──
eqArr(
  parseCopyEmails("copyTextToClipboard('pm.altacenterpoint@avenue5apt.com,altacenterpoint@avenue5apt.com', this)"),
  ["pm.altacenterpoint@avenue5apt.com", "altacenterpoint@avenue5apt.com"],
  "two emails → both retained, order preserved",
)

// ── Single email ──────────────────────────────────────────────────────────────
eqArr(parseCopyEmails("copyTextToClipboard('leasing@property.com', this)"), ["leasing@property.com"], "single email")

// ── Duplicate addresses collapse to one (exact-match dedupe) ──────────────────
eqArr(parseCopyEmails("copyTextToClipboard('a@x.com,a@x.com', this)"), ["a@x.com"], "exact duplicate deduped")

// ── Whitespace trimmed; empty entries dropped; order preserved ────────────────
eqArr(
  parseCopyEmails("copyTextToClipboard('  a@x.com ,, b@y.com  ,', this)"),
  ["a@x.com", "b@y.com"],
  "whitespace trimmed + empties dropped",
)

// ── Missing / malformed onclick → [] (never guess) ────────────────────────────
eqArr(parseCopyEmails(null), [], "null onclick → []")
eqArr(parseCopyEmails(undefined), [], "undefined onclick → []")
eqArr(parseCopyEmails(""), [], "empty onclick → []")
eqArr(parseCopyEmails("doSomethingElse('a@x.com', this)"), [], "wrong function → []")
eqArr(parseCopyEmails("copyTextToClipboard()"), [], "no argument → []")
eqArr(parseCopyEmails("copyTextToClipboard(this)"), [], "unquoted arg → []")

// ── The visible count text is never the value (parser only sees the onclick) ──
{
  const r = parseCopyEmails("copyTextToClipboard('pm.altacenterpoint@avenue5apt.com,altacenterpoint@avenue5apt.com', this)")
  const clean = !r.includes("2 emails") && r.length === 2
  if (clean) pass++
  else {
    fail++
    console.error("✗", `count text must never appear — got ${JSON.stringify(r)}`)
  }
}

// ── Double-quoted first arg also parsed (resilience); no execution ────────────
eqArr(parseCopyEmails('copyTextToClipboard("a@x.com,b@y.com", this)'), ["a@x.com", "b@y.com"], "double-quoted arg parsed")

// ── Addresses are never rewritten/corrected/lowercased ────────────────────────
eqArr(parseCopyEmails("copyTextToClipboard('Leasing@Property.COM', this)"), ["Leasing@Property.COM"], "casing preserved verbatim")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
