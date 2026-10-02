/**
 * BEAST SYNC — message body selection must match getTranscript.ts.
 *
 * AppleMessagesSource.swift is a PORT of lib/messages/getTranscript.ts, and the
 * port diverged on one expression. The original trims first:
 *
 *     row.text?.trim() || extractAttributedBodyText(row.attributedBody)
 *
 * so a whitespace-only `text` is falsy and the real body is read from the
 * attributedBody blob — which is where modern iMessage actually stores it. The
 * Swift port wrote:
 *
 *     text?.isEmpty == false ? text : extractAttributedBody(attributed)
 *
 * `text?.isEmpty == false` is TRUE for " " or "\n", so it committed to the useless
 * whitespace, never consulted attributedBody, and the `guard` on the next line
 * trimmed it to empty and dropped the message entirely.
 *
 * Measured against one real client: the old reader produced 45 messages for
 * Ka'Leah (lead 84) from chat 1583; the Swift port produced 30. Same chat, same 52
 * raw rows, same tapback rule — 15 real client messages lost to this one
 * expression.
 *
 * This guards BOTH halves: the Swift source still has the trim-first form, and the
 * semantics it encodes behave correctly on the four cases that matter.
 *
 * Run: npx tsx scripts/tests/beastSyncBodyFallback.test.ts
 */
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`)
  }
}

const SRC = "companion/Sources/LocatorBeastCompanion/Sources/AppleMessagesSource.swift"
const swift = readFileSync(SRC, "utf8")

/**
 * Faithful port of the Swift body-selection + guard, so the four cases are
 * exercised as behaviour rather than asserted as text.
 *
 *     let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines)
 *     let body = (trimmed?.isEmpty == false ? trimmed : Self.extractAttributedBody(attributed))
 *     guard let body, !body.trimmingCharacters(...).isEmpty else { continue }
 */
function selectBody(text: string | null, attributedBody: string | null): string | null {
  const trimmed = text?.trim()
  const body = trimmed !== undefined && trimmed.length > 0 ? trimmed : attributedBody
  if (body == null || body.trim().length === 0) return null // dropped
  return body
}

/** The BUGGY form, kept so the test proves it would fail these cases. */
function selectBodyBuggy(text: string | null, attributedBody: string | null): string | null {
  const body = text != null && text.length > 0 ? text : attributedBody
  if (body == null || body.trim().length === 0) return null
  return body
}

console.log("\nBEAST SYNC — BODY FALLBACK\n")

console.log("The four required cases")
{
  // 1. normal non-empty text is used directly
  check("1. non-empty text is used directly", selectBody("See you at 3pm", "BLOB BODY") === "See you at 3pm")
  check("   …even when attributedBody also exists", selectBody("Hi", "other") === "Hi")
  check("   …and surrounding whitespace is trimmed", selectBody("  Hi there  ", null) === "Hi there")

  // 2. whitespace-only text falls back to attributedBody  ← the 15 lost messages
  check("2. whitespace-only text falls back to attributedBody", selectBody(" ", "Real message") === "Real message")
  check("   …newline-only too", selectBody("\n", "Real message") === "Real message")
  check("   …tabs/mixed too", selectBody(" \t\n ", "Real message") === "Real message")

  // 3. empty text falls back to attributedBody
  check("3. empty text falls back to attributedBody", selectBody("", "Real message") === "Real message")
  check("   …null text falls back too", selectBody(null, "Real message") === "Real message")

  // 4. whitespace-only text with no attributedBody is still dropped
  check("4. whitespace-only text + no attributedBody is dropped", selectBody(" ", null) === null)
  check("   …empty text + no attributedBody is dropped", selectBody("", null) === null)
  check("   …null + null is dropped", selectBody(null, null) === null)
  check("   …whitespace-only attributedBody is dropped", selectBody(null, "   ") === null)
}

console.log("\nThe bug this replaces (proves the cases are load-bearing)")
{
  check(
    "the buggy form DROPS a whitespace-text message that has a real body",
    selectBodyBuggy(" ", "Real message") === null,
    "if this passes a body, the regression cases above are not actually testing anything",
  )
  check("…and newline-only likewise", selectBodyBuggy("\n", "Real message") === null)
  check("the two forms agree on ordinary text", selectBody("Hi", null) === selectBodyBuggy("Hi", null))
  check("…and on genuinely empty input", selectBody("", null) === selectBodyBuggy("", null))
}

console.log("\nParity with lib/messages/getTranscript.ts (the reference oracle)")
{
  const ts = readFileSync("lib/messages/getTranscript.ts", "utf8")
  // The original: trim FIRST, then `||` falls through on the empty string.
  check(
    "getTranscript still trims before falling back",
    /row\.text\?\.trim\(\)\s*\|\|/.test(ts),
    "the oracle changed — re-derive the Swift port before trusting this test",
  )
  for (const [text, attr] of [[" ", "B"], ["", "B"], ["\n", "B"], ["A", "B"], [" ", null]] as const) {
    const oracle = (text?.trim() || (attr ?? "")) || null
    const port = selectBody(text, attr)
    check(
      `port matches oracle for text=${JSON.stringify(text)} attributedBody=${JSON.stringify(attr)}`,
      (oracle ?? null) === (port ?? null),
      `oracle=${JSON.stringify(oracle)} port=${JSON.stringify(port)}`,
    )
  }
}

console.log("\nThe Swift source still encodes the fixed form")
{
  check(
    "trims text before choosing",
    /let trimmed = text\?\.trimmingCharacters\(in: \.whitespacesAndNewlines\)/.test(swift),
  )
  check(
    "…and falls back to attributedBody on empty",
    /let body = \(trimmed\?\.isEmpty == false \? trimmed : Self\.extractAttributedBody\(attributed\)\)/.test(swift),
  )
  check("the buggy expression is gone", !/text\?\.isEmpty == false \? text :/.test(swift))
  check("the empty-body guard still drops unreadable rows", /guard let body, !body\.trimmingCharacters/.test(swift))
}

console.log("\nNothing else in the reader changed")
{
  check("tapback filtering untouched", /if assocType != 0 \{ continue \}/.test(swift))
  check("1:1 conversation filter untouched", /HAVING COUNT\(DISTINCT h2\.id\) = 1/.test(swift))
  check("chat_message_join path untouched (captures outbound)", /JOIN chat_message_join cmj ON cmj\.message_id = m\.ROWID/.test(swift))
  check("phone normalization untouched", /static func normalizeHandle/.test(swift))
  check("…still rejects email handles", /if raw\.contains\("@"\) \{ return nil \}/.test(swift))
  check("live chat.db path is the only source", /Library\/Messages\/chat\.db/.test(swift))
  check("…with no dev path override committed", !/LB_CHAT_DB/.test(swift))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
