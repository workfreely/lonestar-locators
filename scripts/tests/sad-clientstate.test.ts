/**
 * SAD NavigationPlaceHolder ClientState → fresh property id parser. Pure, no DB/DOM:
 *   npx tsx scripts/tests/sad-clientstate.test.ts
 *
 * This resolves the CURRENT property id after a SAD internal Previous/Next async
 * postback (when location.href is stale), from the Telerik RadNumericTextBox
 * ClientState hidden input's JSON `value`. Preferred field: valueAsString. Parsed as
 * DATA only; safe [null] fallback on absent/malformed/non-numeric — never fabricated.
 */
import { parseClientStatePropertyId } from "../../apps/beast-companion/src/content/sadUrl"

let pass = 0,
  fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else {
    fail++
    console.error("✗", `${name} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
  }
}

// ── Confirmed live example — valueAsString is authoritative ───────────────────
{
  const clientState =
    '{"enabled":true,"emptyMessage":"#","validationText":"849748","valueAsString":"849748","minValue":-70368744177664,"maxValue":70368744177664,"lastSetTextBoxValue":"849748"}'
  eq(parseClientStatePropertyId(clientState), "849748", "confirmed ClientState → 849748")
}

// ── valueAsString is the field used (not validationText) ──────────────────────
{
  // Contrived divergence: valueAsString wins.
  const cs = '{"validationText":"111","valueAsString":"849748","lastSetTextBoxValue":"111"}'
  eq(parseClientStatePropertyId(cs), "849748", "valueAsString is authoritative")
}

// ── Numeric valueAsString (not a string) still accepted ───────────────────────
eq(parseClientStatePropertyId('{"valueAsString":829397}'), "829397", "numeric valueAsString coerced to string")

// ── Whitespace trimmed ────────────────────────────────────────────────────────
eq(parseClientStatePropertyId('  {"valueAsString":" 849748 "}  '), "849748", "outer + inner whitespace trimmed")

// ── Safe fallback: malformed JSON → null ──────────────────────────────────────
eq(parseClientStatePropertyId('{"valueAsString":"849748"'), null, "malformed JSON → null")
eq(parseClientStatePropertyId("not json at all"), null, "non-JSON → null")

// ── Safe fallback: missing element/value → null ───────────────────────────────
eq(parseClientStatePropertyId(null), null, "null → null")
eq(parseClientStatePropertyId(undefined), null, "undefined → null")
eq(parseClientStatePropertyId(""), null, "empty → null")
eq(parseClientStatePropertyId("{}"), null, "no valueAsString → null")

// ── Safe fallback: invalid / non-numeric id → null (never fabricate) ──────────
eq(parseClientStatePropertyId('{"valueAsString":""}'), null, "empty valueAsString → null")
eq(parseClientStatePropertyId('{"valueAsString":"#"}'), null, "placeholder '#' → null")
eq(parseClientStatePropertyId('{"valueAsString":"84a748"}'), null, "non-numeric → null")
eq(parseClientStatePropertyId('{"valueAsString":"12,345"}'), null, "punctuated → null")
eq(parseClientStatePropertyId('{"valueAsString":null}'), null, "null valueAsString → null")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
