// THE PERSONAL CHECKBOX — "Personal — Only Me", over the EXISTING available_to_agents column.
//
// There is no new column and no migration. The operator's checkbox and the enforcement column are
// INVERSES of each other, and the inversion is the whole risk: get it backwards once and a video
// the operator just marked Personal becomes the one video that is shared. So the inversion is
// asserted at every place it is written, and the places are counted.
//
// The second thing asserted here is a bug that existed BEFORE this feature and would have been
// armed by it: the bulk route regenerated display_name for every row whose name was not
// customized, whether or not the call changed a name input. A privacy-only bulk call would have
// renamed up to 266 videos as a side effect, with no undo in the UI.
import { readFileSync } from "node:fs"
import { publishHoldDecision } from "@/lib/social/publishHold"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const read = (p: string) => readFileSync(p, "utf8")
/** TS with block and line comments stripped, so prose can never satisfy an assertion. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const BULK = "app/api/admin/social-autopilot/content/bulk/route.ts"
const ONE = "app/api/admin/social-autopilot/content/[id]/route.ts"
const LIST = "app/api/admin/social-autopilot/content/route.ts"
const CLIENT = "components/crm/social/SocialAutopilotClient.tsx"

const bulk = code(read(BULK))
const one = code(read(ONE))
const list = code(read(LIST))
const client = code(read(CLIENT))

// ── 1. CHECKED MEANS NOT AVAILABLE, EVERYWHERE IT IS WRITTEN ──────────────────────────────────
console.log("the checkbox is stored INVERTED, and nowhere stored straight:")

ok("the stripper works (this file's own prose is gone from the sources it reads)",
  !bulk.includes("armed by it") && !client.includes("reaches no agent"))

ok("bulk writes the inverse", /patch\.available_to_agents\s*=\s*!\(body\.personal as boolean\)/.test(bulk))
ok("the single row writes the inverse", /patch\.available_to_agents\s*=\s*!body\.personal/.test(one))

// THE REGRESSION THIS FILE EXISTS FOR. An un-negated assignment shares what the operator hid.
const straight = /available_to_agents\s*=\s*(?!!)\s*(?:\(?\s*)?body\.personal/
ok("bulk never assigns it un-negated", !straight.test(bulk), "a Personal video would be SHARED")
ok("the single row never assigns it un-negated", !straight.test(one), "a Personal video would be SHARED")

// Count the writers, so a third one cannot appear unnoticed.
for (const [label, src] of [["bulk", bulk], ["single", one]] as const) {
  const writes = [...src.matchAll(/available_to_agents\s*=/g)].length
  ok(`${label}: exactly ONE write of the column (${writes})`, writes === 1)
}

// ── 2. ONLY A REAL BOOLEAN IS A DECISION ──────────────────────────────────────────────────────
console.log("\na missing or non-boolean key is not a decision:")

ok("bulk requires a boolean", /"personal" in body && typeof body\.personal === "boolean"/.test(bulk))
ok("the single row requires a boolean", /"personal" in body && typeof body\.personal === "boolean"/.test(one))

// The EDITABLE loop coerces every value with `typeof body[k] === "string"`; a boolean riding that
// loop would be stored as NULL, which reads as "available" — the exact inversion failure above.
const editable = one.match(/const EDITABLE = \[([^\]]*)\]/)?.[1] ?? ""
ok("EDITABLE does NOT contain personal, so the string loop cannot touch it",
  editable.length > 0 && !/personal/i.test(editable), editable.slice(0, 120))

ok("bulk refuses a call that changes nothing", /if \(!changingMarket && !changingProperty && !changingPersonal\)/.test(bulk))

// ── 3. A PRIVACY-ONLY CALL RENAMES NOTHING (the pre-existing bug) ─────────────────────────────
console.log("\na privacy-only bulk call never regenerates a display name:")

ok("the regeneration is gated on a name input actually changing",
  /if \(\(changingMarket \|\| changingProperty\) && row\.name_customized !== true\)/.test(bulk))
ok("…and the old ungated form is gone",
  !/if \(row\.name_customized !== true\) \{/.test(bulk),
  "a visibility change would rewrite display_name on every selected row")
ok("the single-row route was already gated this way (unchanged)",
  /\("propertyName" in body \|\| "market" in body\)/.test(one))

// ── 4. THE INVERSION HAPPENS ONCE, SERVER-SIDE ────────────────────────────────────────────────
console.log("\nthe client is told 'personal', never 'available':")

ok("the library read selects the column", /available_to_agents/.test(list))
ok("…and inverts it for the client", /personal: r\.available_to_agents !== true/.test(list))
ok("the client never names the enforcement column at all",
  !/available_to_agents/.test(client),
  "the client is reasoning about availability; it should only know `personal`")
ok("the card checkbox reads the inverted field", /checked=\{c\.raw\.personal\}/.test(client))
ok("bulk sends a boolean built from an explicit choice",
  /body\.personal = bulkValue === "personal"/.test(client))
ok("Apply stays disabled until a choice is made",
  /bulkKind === "property" \? !bulkValue\.trim\(\) : !bulkValue/.test(client),
  "an untouched control must not mean 'shared'")

// ── 5. NO NEW COLUMN ──────────────────────────────────────────────────────────────────────────
console.log("\nno second source of truth was introduced:")
for (const [label, src] of [["bulk", bulk], ["single", one], ["list", list], ["client", client]] as const) {
  ok(`${label}: no is_personal column anywhere`, !/is_personal/.test(src))
}

// ── 6. MY OWN PUBLISHING IS INDIFFERENT TO THE CHECKBOX ───────────────────────────────────────
// The real function, not a copy of its rules. This is requirement 6: Personal and shared videos
// must both keep publishing on the admin's own connections.
console.log("\nthe admin's own publishing ignores availability, in both states:")

const noFlag = {} as NodeJS.ProcessEnv

ok("admin post, video marked Personal → publishes",
  publishHoldDecision({ isAgentOwned: false, availableToAgents: false }, noFlag).hold === false)
ok("admin post, video shared → publishes",
  publishHoldDecision({ isAgentOwned: false, availableToAgents: true }, noFlag).hold === false)
ok("admin post, Personal AND flagged for review, hold flag off → still publishes",
  publishHoldDecision({ isAgentOwned: false, availableToAgents: false, needsReviewAt: "2026-11-14T00:00:00Z" }, noFlag).hold === false,
  "the admin path must stay exactly as it was")

// And the agent side still refuses, which is what makes the checkbox mean anything.
const withdrawn = publishHoldDecision({ isAgentOwned: true, availableToAgents: false }, noFlag)
ok("agent post, video marked Personal → held", withdrawn.hold === true)
ok("…and says why", withdrawn.hold === true && withdrawn.reason === "withdrawn_from_agents")
ok("agent post, video shared and unflagged → publishes",
  publishHoldDecision({ isAgentOwned: true, availableToAgents: true }, noFlag).hold === false)

console.log(`\nPersonal videos: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
