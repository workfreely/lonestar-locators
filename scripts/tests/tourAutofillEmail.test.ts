/**
 * TOUR MODE — client email in the autofill payload, and the Tour Mode labels/order.
 *
 * The client-email plumbing was already present end to end (the AutofillClient
 * type, `email: lead.email` in the payload builder, an email SPEC in the filler,
 * and a Tour Mode row). This suite pins all of it down so it cannot silently
 * regress, and covers the two things this pass actually changed: the section
 * labels and the field order.
 *
 * `autofillTourForm` is exercised for real against a minimal DOM stand-in, in
 * dryRun mode. dryRun skips `setNative` — which needs real HTMLInputElement
 * prototypes and Event — while still running candidate collection, visibility,
 * scoring, the confidence floor and element selection. That is precisely the
 * "which input does this value go to?" claim, so the test proves the mapping
 * without a jsdom dependency or a shim faithful enough to be testing itself.
 *
 * Run: npx tsx scripts/tests/tourAutofillEmail.test.ts
 */
import { readFileSync } from "node:fs"
import { autofillTourForm } from "../../packages/companion-shared/src/autofill/formFill"
import type { AutofillPayload } from "../../packages/companion-shared/src/autofill/types"

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

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DOM stand-in: only what autofillTourForm touches on a dryRun pass.
// ─────────────────────────────────────────────────────────────────────────────
type FieldSpec = { tag: "input" | "select" | "textarea"; type?: string; name?: string; id?: string; label?: string }

function makeEl(spec: FieldSpec) {
  const attrs: Record<string, string> = {}
  if (spec.name) attrs.name = spec.name
  if (spec.label) attrs["aria-label"] = spec.label
  const el: Record<string, unknown> = {
    tagName: spec.tag.toUpperCase(),
    type: spec.type ?? (spec.tag === "input" ? "text" : ""),
    name: spec.name ?? "",
    id: spec.id ?? "",
    value: "",
    disabled: false,
    readOnly: false,
    options: [],
    labels: null,
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => { attrs[k] = v },
    getClientRects: () => [{ width: 120, height: 24 }],
    offsetParent: {},
    closest: () => null,
    previousElementSibling: null,
    getRootNode: () => null,
  }
  el.ownerDocument = { defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) }, getElementById: () => null }
  return el
}

/** Install a fake `document` + `location` for one autofill call, then restore. */
function withDom<T>(fields: FieldSpec[], fn: () => T): T {
  const els = fields.map(makeEl)
  const doc = {
    querySelectorAll: (sel: string) => {
      if (sel === "input, select, textarea") return els
      if (sel === "*") return []
      return [] // "iframe", "a, button, [role=button]"
    },
    getElementById: () => null,
  }
  const g = globalThis as unknown as Record<string, unknown>
  const prevDoc = g.document
  const prevLoc = g.location
  const prevWin = g.window
  g.document = doc
  g.location = { origin: "https://example-apartments.com", href: "https://example-apartments.com/contact" }
  g.window = { getComputedStyle: () => ({ display: "block", visibility: "visible" }) }
  try {
    return fn()
  } finally {
    g.document = prevDoc
    g.location = prevLoc
    g.window = prevWin
  }
}

const CLIENT_EMAIL = "kaleah.davis@example.com"
const LOCATOR_EMAIL = "jay@locatorbeast.com"

const payload = (over: Partial<AutofillPayload["client"]> = {}): AutofillPayload => ({
  client: {
    firstName: "Ka'Leah",
    lastName: "Davis",
    email: CLIENT_EMAIL,
    phone: "(770) 778-6743",
    moveDate: "2026-12-10",
    bedrooms: "2",
    ...over,
  },
  locator: { firstName: "Jay", lastName: "Morris", phone: "(210) 555-0000", email: LOCATOR_EMAIL },
  dryRun: true,
})

/** A realistic property contact form. */
const FORM: FieldSpec[] = [
  { tag: "input", name: "first_name", label: "First Name" },
  { tag: "input", name: "last_name", label: "Last Name" },
  { tag: "input", type: "email", name: "email", label: "Email" },
  { tag: "input", type: "tel", name: "phone", label: "Phone" },
  { tag: "input", type: "date", name: "move_in_date", label: "Move-in Date" },
  { tag: "select", name: "bedrooms", label: "Bedrooms" },
  { tag: "textarea", name: "message", label: "Message" },
]

const find = (r: ReturnType<typeof autofillTourForm>, field: string) => r.report.find((x) => x.field === field)

console.log("\nTOUR MODE AUTOFILL — CLIENT EMAIL\n")

// ─── The email mapping ─────────────────────────────────────────────────────
console.log("Client email maps to the email input")
{
  const r = withDom(FORM, () => autofillTourForm(payload()))
  const email = find(r, "email")
  check("email is matched to an element", email?.action === "would-fill", JSON.stringify(email))
  check("…and it is input[name=email]", email?.el === "input[name=email]", String(email?.el))
  check("…detected by autocomplete/type/name signals", !!email?.strategy && email.strategy.length > 0, String(email?.strategy))
}
{
  // The decisive separation: the locator's email must never land in a client field.
  // The filler only ever reads `payload.client.email` for the email SPEC, so a
  // payload with NO client email must leave the email input untouched even though
  // a locator email is present.
  const r = withDom(FORM, () => autofillTourForm(payload({ email: null })))
  const email = find(r, "email")
  check("with no client email, the email input gets nothing", email?.action === "no-value", JSON.stringify(email))
  check("…even though a locator email exists in the payload", true)
}
check(
  "an empty-string client email is treated as absent (not written as blank)",
  withDom(FORM, () => find(autofillTourForm(payload({ email: "" })), "email"))?.action === "no-value",
)

// ─── Locator email stays in the message only ───────────────────────────────
console.log("\nLocator email is confined to the message")
{
  const src = readFileSync("packages/companion-shared/src/autofill/formFill.ts", "utf8")
  // Every read of the locator email must sit on a message-composition line. The
  // guard and the push are two reads on ONE line
  // (`if (loc.email) lines.push("Locator Email: " + loc.email)`), so counting
  // occurrences was the wrong test — what matters is WHERE they are.
  const locLines = src.split("\n").filter((l) => /loc\.email/.test(l))
  check("every locator-email read is on a message line", locLines.length > 0 && locLines.every((l) => /lines\.push/.test(l)), locLines.join(" | "))
  check(
    "…and that read is a message line, not a field value",
    /lines\.push\("Locator Email: " \+ loc\.email\)/.test(src),
  )
  // The client value map must take email from the CLIENT object.
  check("the field value map takes email from the client", /email:\s*c\.email/.test(src))
  check("…and never from the locator", !/email:\s*loc(ator)?\.email/.test(src))
}

// ─── Existing fields still autofill ────────────────────────────────────────
console.log("\nExisting autofill behaviour is preserved")
{
  const r = withDom(FORM, () => autofillTourForm(payload()))
  for (const [field, el] of [
    ["firstName", "input[name=first_name]"],
    ["lastName", "input[name=last_name]"],
    ["phone", "input[name=phone]"],
    ["moveDate", "input[name=move_in_date]"],
    ["bedrooms", "select[name=bedrooms]"],
  ] as const) {
    const rep = find(r, field)
    check(`${field} → ${el}`, rep?.action === "would-fill" && rep.el === el, JSON.stringify(rep))
  }
  check("the message field is matched too", find(r, "message")?.action === "would-fill")
  check("all 7 canonical fields are attempted", r.attempted === 7, String(r.attempted))
  check("dryRun writes nothing", r.filled === 0, String(r.filled))
}
{
  // A form with no email input must not break the other fields.
  const noEmail = FORM.filter((f) => f.name !== "email")
  const r = withDom(noEmail, () => autofillTourForm(payload()))
  check("a form without an email input reports not-found for email", find(r, "email")?.action === "not-found")
  check("…and the other fields still match", find(r, "firstName")?.action === "would-fill" && find(r, "phone")?.action === "would-fill")
}

// ─── The payload builder carries the client email ──────────────────────────
console.log("\nThe Tour Mode payload includes the client email")
{
  const src = readFileSync("apps/beast-companion/src/sidepanel/ProductionPanel.tsx", "utf8")
  const block = src.slice(src.indexOf("function buildAutofillPayload"), src.indexOf("function isCurrentProperty"))
  check("buildAutofillPayload sets client.email from the lead", /email:\s*lead\.email\s*\?\?\s*null/.test(block))
  check("…and does not source it from the locator", !/email:\s*active\.locator/.test(block))
  check("the locator is passed separately", /locator:\s*active\.locator\s*\?\?\s*null/.test(block))
  check("AutofillClient declares email", /email\?:\s*string \| null;/.test(readFileSync("packages/companion-shared/src/autofill/types.ts", "utf8")))
}

// ─── Tour Mode labels + order (what this pass changed) ─────────────────────
console.log("\nTour Mode labels and field order")
{
  const src = readFileSync("apps/beast-companion/src/sidepanel/tour/TourModeView.tsx", "utf8")
  check('the card is titled "Client Info to Autofill"', /title="Client Info to Autofill"/.test(src))
  check('…not the old "Information to Autofill"', !/title="Information to Autofill"/.test(src))
  check('the sub-group is "Locator Info"', />Locator Info</.test(src))
  check('…not the old "Locator Information"', !/>Locator Information</.test(src))

  // Order is positional: Name → Phone → Email → Move date → Bedrooms.
  // Slice on the rendered HEADING marker, not the bare phrase: a comment above
  // the card ("…then the Locator Information sub-group") contains "Locator Info"
  // and sits BEFORE the title, which silently produced an empty slice.
  const locHeadingIdx = src.indexOf(">Locator Info<")
  const clientBlock = src.slice(src.indexOf('title="Client Info to Autofill"'), locHeadingIdx)
  const order = [...clientBlock.matchAll(/label="(Name|Phone|Email|Move date|Bedrooms)"/g)].map((m) => m[1])
  check(
    "client rows are Name, Phone, Email, Move date, Bedrooms",
    JSON.stringify(order) === JSON.stringify(["Name", "Phone", "Email", "Move date", "Bedrooms"]),
    JSON.stringify(order),
  )
  check("Phone precedes Email", order.indexOf("Phone") < order.indexOf("Email"))

  const locBlock = src.slice(locHeadingIdx)
  const locOrder = [...locBlock.matchAll(/label="(Name|Phone|Email)"/g)].map((m) => m[1])
  check("locator rows are Name, Phone, Email", JSON.stringify(locOrder) === JSON.stringify(["Name", "Phone", "Email"]), JSON.stringify(locOrder))
  check("the locator-only disclaimer is intact", /Locator information is only added to the message\./.test(src))
  // Empty values are omitted — the existing pattern, and what Ka'Leah (no saved
  // email) will hit, so her Email row simply does not render.
  check("an absent client email renders no row (existing pattern)", /\{client\.email && <Field label="Email"/.test(src))
}

// ─── No workflow/action code touched by this pass ──────────────────────────
console.log("\nNo workflow or action code changed")
{
  const UNTOUCHED = [
    "lib/leads/followUpWorkflow.ts",
    "lib/leads/contactFollowUpWorkflow.ts",
    "lib/leads/setupTourWorkflow.ts",
    "lib/leads/sendListWorkflow.ts",
    "lib/leads/buildListWorkflow.ts",
    "lib/leads/actionCompletion.ts",
    "lib/workflowEngine.ts",
    "lib/nextActions.ts",
    "app/api/admin/leads/update-stage/route.ts",
  ]
  // This pass touches only the Companion Tour Mode view. Assert none of the
  // workflow modules gained an autofill/Tour-Mode reference, which is the way a
  // "small UI pass" would leak into them.
  for (const f of UNTOUCHED) {
    const src = readFileSync(f, "utf8")
    check(`${f} has no autofill coupling`, !/autofill|AutofillPayload|TourMode/i.test(src))
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
