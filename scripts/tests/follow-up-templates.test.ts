/**
 * CP1 parity: the editable follow-up MESSAGE-TEXT layer must produce output
 * byte-identical to the previous hardcoded builders when NO override is given.
 * The pre-refactor formulas are re-implemented inline here as the reference
 * ("old"), so parity is proven independent of timezone/locale (both paths call
 * the same Date derivation). Also checks the token renderer, the default map,
 * and the char-limit / token metadata.
 *
 *   npx tsx scripts/tests/follow-up-templates.test.ts
 */
import {
  buildIntroSmsBody,
  buildFollowUpSmsBody,
  buildTextTop3Body,
  renderTemplate,
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_TOKENS,
  TEMPLATE_CHAR_LIMITS,
} from "@bc/companion-shared"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else { fail++; console.error("✗", name, `\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`) }
}
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.error("✗", name) } }

// ── Reference implementations = the EXACT pre-refactor code ──────────────────
function oldIntro(opts: { firstName: string; locatorFirstName: string; propertyType?: string | null; beds?: string | null; moveDate?: string | null }): string {
  const bedsText =
    opts.propertyType === "Studio" ? "studio"
    : opts.propertyType === "High-Rise" ? "high-rise"
    : opts.beds ? `${String(opts.beds).replace("-", "").trim()} bed` : ""
  const monthText = opts.moveDate ? ` in ${new Date(opts.moveDate).toLocaleString("en-US", { month: "long" })}` : ""
  return `Hey ${opts.firstName} it's ${opts.locatorFirstName}! I got your form for a ${bedsText} move${monthText}. Are you trying to stay near a specific address or side of town?`
}
function oldFollowUp(titleOrKey: string, name: string): string {
  const k = (titleOrKey || "").trim().toLowerCase()
  if (k === "fu1" || k === "follow_up_1") return "Hey! Did you see any properties on the list that you'd like to tour?"
  if (k === "fu2" || k === "follow_up_2") return "Is there one that stands out or would you like me to narrow the list down a bit more?"
  if (k === "fu3" || k === "follow_up_3") return "I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?"
  return `Hey ${name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!`
}
function oldTextTop3(name: string, topMatches: any[]): string {
  return `Hey ${name}, I found 3 excellent options for you!\n\n${topMatches
    .slice(0, 3)
    .map((p, i) => {
      const url = p.website?.startsWith("http") ? p.website : `https://${p.website || ""}`
      return `${i + 1}. ${p.name}\n${url}`
    })
    .join("\n\n")}\n\nWhich one do you like most?`
}

// ── Intro parity across the input matrix ─────────────────────────────────────
const introCases = [
  { firstName: "Sarah", locatorFirstName: "Jay", propertyType: "Studio", beds: "1", moveDate: "2026-09-15" },
  { firstName: "Carlos", locatorFirstName: "Jay", propertyType: "High-Rise", beds: "2", moveDate: "2026-12-01" },
  { firstName: "Mia", locatorFirstName: "Alex", propertyType: "Apartment", beds: "3+", moveDate: "2026-07-20" },
  { firstName: "Sam", locatorFirstName: "Jay", propertyType: null, beds: null, moveDate: null }, // bedsText "" (double space), no month
  { firstName: "Dev", locatorFirstName: "Jo", propertyType: "Apartment", beds: "2", moveDate: null }, // beds but no month
  { firstName: "Lee", locatorFirstName: "Jay", propertyType: null, beds: "1", moveDate: "2026-01-05" },
]
introCases.forEach((c, i) => eq(buildIntroSmsBody(c), oldIntro(c), `intro parity case ${i + 1}`))

// ── Follow-up parity: every identity form (action_key + legacy title) ────────
const fuIds = ["fu1", "FU1", "follow_up_1", "fu2", "FU2", "follow_up_2", "fu3", "FU3", "follow_up_3", "final", "Final", "final_follow_up", "somethingUnknown"]
fuIds.forEach((id) => eq(buildFollowUpSmsBody(id, "Sarah"), oldFollowUp(id, "Sarah"), `follow-up parity: ${id}`))
// Final is the only name-personalized one — confirm the name lands.
ok(buildFollowUpSmsBody("final_follow_up", "Sarah").includes("Hey Sarah,"), "Final follow-up interpolates client name")
ok(!buildFollowUpSmsBody("follow_up_1", "Sarah").includes("Sarah"), "FU1 has no name token (static)")

// ── Text Top 3 parity (dynamic property block) ───────────────────────────────
const tt3Cases: Array<{ name: string; matches: any[] }> = [
  { name: "Sarah", matches: [{ name: "The Millbrook", website: "https://a.com" }, { name: "Vue 22", website: "b.com" }, { name: "Skyhouse", website: "http://c.com" }] },
  { name: "Carlos", matches: [{ name: "Only One", website: "" }] }, // <3, empty website → https://
  { name: "Mia", matches: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }] }, // >3 → sliced to 3
  { name: "Sam", matches: [] }, // 0 matches
]
tt3Cases.forEach((c, i) =>
  eq(buildTextTop3Body({ firstName: c.name, topMatches: c.matches }), oldTextTop3(c.name, c.matches), `text-top-3 parity case ${i + 1}`),
)

// ── Renderer behavior ────────────────────────────────────────────────────────
eq(renderTemplate("Hi {first_name}!", { first_name: "Sarah" }), "Hi Sarah!", "renderTemplate substitutes a known token")
eq(renderTemplate("Hi {unknown}!", { first_name: "Sarah" }), "Hi {unknown}!", "renderTemplate leaves an unknown token literal")
eq(renderTemplate("A {a} B {a}", { a: "x" }), "A x B x", "renderTemplate replaces all occurrences")
eq(renderTemplate("no tokens here", {}), "no tokens here", "renderTemplate no-op on plain text")
eq(renderTemplate("{a}", { a: "{a}" }), "{a}", "renderTemplate is single-pass (no re-substitution)")

// ── Metadata sanity (content keys, limits, tokens) ───────────────────────────
const KEYS = ["intro", "text_top_3", "follow_up_1", "follow_up_2", "follow_up_3", "final_follow_up", "contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3"] as const
eq(Object.keys(DEFAULT_FOLLOW_UP_TEMPLATES).sort().join(","), [...KEYS].sort().join(","), "default map has exactly the content keys (incl. contact_follow_up_1/2/3)")
eq(TEMPLATE_CHAR_LIMITS.intro, 180, "intro limit 180")
eq(TEMPLATE_CHAR_LIMITS.follow_up_1, 140, "FU1 limit 140")
eq(TEMPLATE_CHAR_LIMITS.follow_up_2, 140, "FU2 limit 140")
eq(TEMPLATE_CHAR_LIMITS.follow_up_3, 140, "FU3 limit 140")
eq(TEMPLATE_CHAR_LIMITS.final_follow_up, 180, "Final limit 180")
eq(TEMPLATE_CHAR_LIMITS.text_top_3, 200, "Text Top 3 static limit 200")
eq(JSON.stringify(TEMPLATE_TOKENS.follow_up_1), "[]", "FU1 declares no tokens")
eq(JSON.stringify(TEMPLATE_TOKENS.final_follow_up), JSON.stringify(["first_name"]), "Final declares first_name token")
// Every token a default actually uses must be declared for that template.
for (const k of KEYS) {
  const used = Array.from(DEFAULT_FOLLOW_UP_TEMPLATES[k].matchAll(/\{(\w+)\}/g)).map((m) => m[1])
  const declared = new Set(TEMPLATE_TOKENS[k])
  ok(used.every((t) => declared.has(t)), `every token used in default '${k}' is declared`)
}
// Each default's editable text is within its own char limit (keeps them short).
for (const k of KEYS) ok(DEFAULT_FOLLOW_UP_TEMPLATES[k].length <= TEMPLATE_CHAR_LIMITS[k], `default '${k}' fits its char limit`)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
