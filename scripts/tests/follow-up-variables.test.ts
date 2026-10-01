/**
 * CP2.5: approved agent-facing variables — value derivation, clean missing-value
 * behavior, in-place (no-space) substitution, the narrow tidy, and the variable
 * catalog. Pure; no DB, no send-site wiring. Parity of the DEFAULT output is
 * covered by follow-up-templates.test.ts (unchanged and still passing).
 *
 *   npx tsx scripts/tests/follow-up-variables.test.ts
 */
import {
  buildFollowUpTemplateVars,
  tidyRenderedMessage,
  renderTemplate,
  AGENT_TEMPLATE_VARIABLES,
  SYSTEM_TEMPLATE_TOKENS,
} from "@bc/companion-shared"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.error("✗", name, `\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`) }
}
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.error("✗", name) } }

// ── The approved variable menu is EXACTLY the six, with the exact tokens ──────
eq(
  AGENT_TEMPLATE_VARIABLES.map((v) => v.token),
  ["first_name", "agent_first_name", "move_month", "beds", "baths", "property_type"],
  "agent variables are exactly the six approved tokens, in order",
)
eq(
  AGENT_TEMPLATE_VARIABLES.map((v) => v.label),
  ["First Name", "Agent Name", "Move Month", "Bedrooms", "Bathrooms", "Property Type"],
  "agent variable labels match the approved mapping",
)
ok(!AGENT_TEMPLATE_VARIABLES.some((v) => v.token === "property_list"), "property_list is NOT in the agent menu")
ok(!AGENT_TEMPLATE_VARIABLES.some((v) => /last_?name/i.test(v.token)), "no last-name variable")
// search_tail is engine-composed (it fills new_lead_text1's " for a 1 bedroom
// move in June" tail) and is correctly absent from the agent menu above — it was
// added to SYSTEM_TEMPLATE_TOKENS without being added here, which is why this
// assertion was red.
eq(
  [...SYSTEM_TEMPLATE_TOKENS].sort(),
  ["beds_phrase", "move_suffix", "property_list", "search_tail"],
  "system-only tokens listed",
)
ok(!AGENT_TEMPLATE_VARIABLES.some((v) => v.token === "search_tail"), "search_tail is NOT in the agent menu")

// ── Populated lead: clean/bare values, no surrounding spaces ──────────────────
{
  const v = buildFollowUpTemplateVars({ firstName: "Sarah", agentFirstName: "Jay", beds: "2", baths: "1", propertyType: "Apartment", moveDate: "2026-09-15" })
  eq(v.first_name, "Sarah", "first_name bare")
  eq(v.agent_first_name, "Jay", "agent_first_name bare")
  eq(v.move_month, "September", "move_month = bare month name (no connective, no leading space)")
  eq(v.beds, "2 bed", "beds = clean bedrooms phrase")
  eq(v.baths, "1 bath", "baths = clean bathrooms phrase")
  eq(v.property_type, "Apartment", "property_type = raw type")
  // System tokens carry the legacy presentation.
  eq(v.beds_phrase, "2 bed", "beds_phrase (system) = legacy beds phrase")
  eq(v.move_suffix, " in September", "move_suffix (system) = legacy connective")
}

// ── Studio / High-Rise: property type wins in the SYSTEM phrase only ──────────
{
  const studio = buildFollowUpTemplateVars({ beds: "1", propertyType: "Studio", moveDate: "2026-09-15" })
  eq(studio.beds_phrase, "studio", "Studio → beds_phrase 'studio' (legacy)")
  eq(studio.beds, "1 bed", "Studio → clean {beds} still reflects the raw bedrooms")
  eq(studio.property_type, "Studio", "Studio → clean {property_type}")
  const hi = buildFollowUpTemplateVars({ beds: "2", propertyType: "High-Rise" })
  eq(hi.beds_phrase, "high-rise", "High-Rise → beds_phrase 'high-rise' (legacy)")
  eq(hi.property_type, "High-Rise", "High-Rise → clean {property_type}")
  const plus = buildFollowUpTemplateVars({ beds: "3+", baths: "3+" })
  eq(plus.beds, "3+ bed", "'3+' beds preserved")
  eq(plus.baths, "3+ bath", "'3+' baths preserved")
}

// ── Missing values → "" (never undefined/null/NaN, never a stray space) ───────
{
  const v = buildFollowUpTemplateVars({})
  eq([v.first_name, v.agent_first_name, v.move_month, v.beds, v.baths, v.property_type, v.beds_phrase, v.move_suffix],
     ["", "", "", "", "", "", "", ""], "all-absent → every token is empty string")
  ok(!Object.values(v).some((s) => /undefined|null|NaN/.test(s)), "no 'undefined'/'null'/'NaN' leaks into any token")
  ok(!Object.values(v).some((s) => s !== s.trim()), "no token has leading/trailing whitespace")
}

// ── Substitution is exactly in place — no injected spaces around a token ──────
eq(renderTemplate("Hey {first_name}, I wanted to check in.", { first_name: "Sarah" }),
   "Hey Sarah, I wanted to check in.", "token substitutes in place — no space before the comma")
eq(renderTemplate("Hey {first_name}, I wanted to check in.", { first_name: "" }),
   "Hey , I wanted to check in.", "empty token leaves a raw gap (tidy is a separate, opt-in step)")

// ── tidyRenderedMessage: removes the artifacts an empty token can leave ───────
eq(tidyRenderedMessage("Hey , I wanted to check in."), "Hey, I wanted to check in.", "drops space before a comma")
eq(tidyRenderedMessage("for a  move in ."), "for a move in.", "collapses a double space AND drops the space before the period")
eq(tidyRenderedMessage("Hi Sarah !"), "Hi Sarah!", "drops space before '!'")
eq(tidyRenderedMessage("  leading and trailing  "), "leading and trailing", "trims ends")
eq(tidyRenderedMessage("line one\n\nline two"), "line one\n\nline two", "preserves blank lines between paragraphs")
eq(tidyRenderedMessage("1. The Millbrook\nhttps://a.com"), "1. The Millbrook\nhttps://a.com", "no-op on a clean property line (URL untouched)")
eq(tidyRenderedMessage("Hey Sarah, I found options!"), "Hey Sarah, I found options!", "no-op on already-clean prose")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
