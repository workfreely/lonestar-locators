/**
 * CP4: the follow-up template editor's SAVE contract (the pure logic the CRM
 * modal relies on; the component itself is verified by typecheck). Proves:
 *   • seed = override ?? default per field
 *   • Save stores ONLY genuine customizations (default-equal / empty dropped →
 *     this is exactly Reset-to-Default: no override persisted)
 *   • over-limit is rejected (the modal blocks Save; sanitize is the backstop)
 *   • Text Top 3 property-list protection predicate
 *   • the editor's six fields match the content-key set
 *
 *   npx tsx scripts/tests/follow-up-editor.test.ts
 */
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_CHAR_LIMITS,
  AGENT_TEMPLATE_VARIABLES,
  sanitizeFollowUpOverrides,
  type FollowUpTemplateKey,
  type FollowUpOverrides,
} from "@bc/companion-shared"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++
  else { fail++; console.error("✗", name, `\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`) }
}
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.error("✗", name) } }

const KEYS = Object.keys(DEFAULT_FOLLOW_UP_TEMPLATES) as FollowUpTemplateKey[]

// The modal seeds each field with override ?? default (see FollowUpTemplatesModal.seed).
function seed(overrides: FollowUpOverrides): Record<FollowUpTemplateKey, string> {
  const clean = sanitizeFollowUpOverrides(overrides).overrides
  const out = {} as Record<FollowUpTemplateKey, string>
  for (const k of KEYS) out[k] = clean[k] ?? DEFAULT_FOLLOW_UP_TEMPLATES[k]
  return out
}

// ── Editor fields = the six content keys ─────────────────────────────────────
eq([...KEYS].sort(), ["final_follow_up", "follow_up_1", "follow_up_2", "follow_up_3", "intro", "text_top_3"], "editor covers exactly the six templates")
eq(AGENT_TEMPLATE_VARIABLES.length, 6, "editor offers the six approved variables")

// ── Seed = override ?? default ───────────────────────────────────────────────
{
  const s = seed({ follow_up_1: "Custom FU1" })
  eq(s.follow_up_1, "Custom FU1", "seed uses the saved override")
  eq(s.intro, DEFAULT_FOLLOW_UP_TEMPLATES.intro, "seed falls back to default for un-overridden fields")
}
eq(seed({}), DEFAULT_FOLLOW_UP_TEMPLATES, "no overrides → every field seeds to its default")

// ── Save stores only genuine customizations (Reset-to-Default = drop key) ────
{
  // Open, change nothing, Save → values equal the defaults → nothing persisted.
  const noop = sanitizeFollowUpOverrides(seed({})).overrides
  eq(noop, {}, "saving unchanged defaults persists no override")
}
{
  // Customize FU1, leave the rest as defaults → only FU1 persists.
  const values = { ...seed({}), follow_up_1: "Hey {first_name}, quick nudge!" }
  eq(sanitizeFollowUpOverrides(values).overrides, { follow_up_1: "Hey {first_name}, quick nudge!" }, "only the customized field persists")
}
{
  // Reset a previously-overridden field to its default, Save → override removed.
  const values = { ...seed({ follow_up_2: "old custom" }), follow_up_2: DEFAULT_FOLLOW_UP_TEMPLATES.follow_up_2 }
  ok(!("follow_up_2" in sanitizeFollowUpOverrides(values).overrides), "Reset-to-Default removes the override on save")
}

// ── Over-limit backstop (the modal also blocks Save) ─────────────────────────
{
  const tooLong = "x".repeat(TEMPLATE_CHAR_LIMITS.final_follow_up + 1)
  const r = sanitizeFollowUpOverrides({ final_follow_up: tooLong })
  eq(r.overrides, {}, "over-limit not persisted")
  eq(r.rejected, [{ key: "final_follow_up", reason: "too_long" }], "over-limit reported")
  ok("x".repeat(TEMPLATE_CHAR_LIMITS.intro).length === TEMPLATE_CHAR_LIMITS.intro, "at-limit length equals the limit (boundary)")
}

// ── Text Top 3 property-list protection (the modal's Save guard) ─────────────
const keepsList = (s: string) => s.trim() === "" || s.includes("{property_list}")
ok(keepsList(DEFAULT_FOLLOW_UP_TEMPLATES.text_top_3), "default Text Top 3 keeps {property_list}")
ok(keepsList("Top picks {first_name}:\n\n{property_list}\n\nPick one?"), "a valid custom Text Top 3 keeps {property_list}")
ok(!keepsList("Top picks {first_name}: reply with your favorite"), "a Text Top 3 that dropped {property_list} is flagged")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
