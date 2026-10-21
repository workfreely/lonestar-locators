// A MANUAL TEMPLATE — registered everywhere, and dispatchable by nothing.
//
// The whole value of this key is that it is wording the locator can reach and the engine cannot.
// Two failures would destroy that: half-registering it (so a saved edit is silently rejected as
// unknown_key), or letting it into SEQUENCES (so the Follow-Up Agent starts sending it).
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_TOKENS,
  TEMPLATE_CHAR_LIMITS,
  isFollowUpTemplateKey,
  sanitizeFollowUpOverrides,
} from "@bc/companion-shared"
import { SEQUENCES } from "@/lib/followup/sequences"
import { permittedInIntroOnly } from "@/lib/followup/introOnly"
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const KEY = "tour_confirmed_reminder"
const body = DEFAULT_FOLLOW_UP_TEMPLATES[KEY]

console.log("\n1. FULLY REGISTERED — a half-registered key silently drops the locator's edits:")
ok("it has default wording", typeof body === "string" && body.length > 0)
ok("isFollowUpTemplateKey accepts it", isFollowUpTemplateKey(KEY))
ok("it has a TEMPLATE_TOKENS entry", Object.prototype.hasOwnProperty.call(TEMPLATE_TOKENS, KEY))
ok("it has a TEMPLATE_CHAR_LIMITS entry", Object.prototype.hasOwnProperty.call(TEMPLATE_CHAR_LIMITS, KEY))
ok("an override on it SURVIVES sanitisation", (() => {
  const r = sanitizeFollowUpOverrides({ [KEY]: "Edited by the locator." })
  return r.overrides[KEY] === "Edited by the locator." && r.rejected.length === 0
})())
ok("…whereas a genuinely unknown key is still rejected",
  sanitizeFollowUpOverrides({ not_a_real_key: "x" }).rejected.some((r) => r.reason === "unknown_key"))

console.log("\n2. THE APPROVED WORDING, EXACTLY:")
ok('it opens "You’re all set!" with the emoji', body.startsWith("You’re all set! 😊"))
ok("it tells the client to select Realtor/Locator", body.includes("select Realtor/Locator"))
ok("it names the brokerage attribution as approved", body.includes("‘Jay Morris with AptAmigo’"))
ok("it offers the incentives as a MENU, not a promise",
  body.includes("cash rebate, free movers, or other incentives"))
ok("it promises no single specific incentive",
  !/qualify for your (cash rebate|free movers)!/.test(body))
ok("the two paragraphs are preserved", body.includes("\n\n"))

console.log("\n3. EDITABLE WITHOUT HITTING THE CAP:")
ok(`the default (${body.length}) fits its limit (${TEMPLATE_CHAR_LIMITS[KEY]})`, body.length <= TEMPLATE_CHAR_LIMITS[KEY])
ok("there is real headroom to name one incentive", TEMPLATE_CHAR_LIMITS[KEY] - body.length >= 40)
ok("a trimmed single-incentive edit is accepted", (() => {
  const edited = body.replace("cash rebate, free movers, or other incentives", "cash rebate")
  return edited.length <= TEMPLATE_CHAR_LIMITS[KEY] && sanitizeFollowUpOverrides({ [KEY]: edited }).rejected.length === 0
})())

console.log("\n4. NOTHING CAN SEND IT:")
const everyStep = Object.values(SEQUENCES).flatMap((s) => s.steps.map((st) => st.templateKey))
ok("no sequence step references this template", !everyStep.includes(KEY), everyStep.filter((k) => k === KEY).join(","))
ok("no sequence has a step named after it",
  !Object.values(SEQUENCES).some((s) => s.steps.some((st) => st.key === KEY)))
ok("intro-only would refuse it anyway", !permittedInIntroOnly("new_lead", KEY))
{
  const seq = readFileSync("lib/followup/sequences.ts", "utf8")
  ok("the key appears nowhere in the sequence registry", !seq.includes(KEY))
}

console.log("\n5. IT IS OFFERED IN THE EDITOR, AND LABELLED AS MANUAL:")
{
  const modal = readFileSync("components/crm/FollowUpTemplatesModal.tsx", "utf8")
  ok("the editor exposes the key", modal.includes(`key: "${KEY}"`))
  ok("…with a name the locator will recognise", /Tour Confirmed — Realtor\/Locator reminder/.test(modal))
  ok("…and a note saying nothing sends it automatically", /Nothing sends this automatically/.test(modal))
}

console.log("\n6. NO EXISTING TEMPLATE CHANGED:")
for (const k of ["new_lead_text1", "new_lead_text2", "post_tour", "application_status"] as const) {
  ok(`${k} still has its wording`, typeof DEFAULT_FOLLOW_UP_TEMPLATES[k] === "string" && DEFAULT_FOLLOW_UP_TEMPLATES[k].length > 0)
}
ok("new_lead_text2 is still the approved location question",
  DEFAULT_FOLLOW_UP_TEMPLATES.new_lead_text2 === "Are you trying to stay near a specific address or side of town?")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
