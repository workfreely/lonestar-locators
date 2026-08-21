// Beast Voice — reading the EXISTING workflow's phase, and gating which spoken
// responses are valid for it. Pure logic, no DOM required.
// Run: npx tsx scripts/tests/beastVoicePrompt.test.ts

import { derivePhase, isValidForPhase, BUTTON_ACTIONS, PHASE_ACTIONS } from "../../lib/beastVoice/activePrompt"
import { parseCommand } from "../../lib/beastVoice/parseCommand"

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

// The labels the existing modal renders. If the workflow ever renames one, this
// fails HERE — a rename becomes a failing test rather than voice silently
// ceasing to work in production.
console.log("\nexisting button labels are still the contract")
for (const [label, action] of [
  ["Call", "call"],
  ["Text", "text"],
  ["Yes, Contacted", "yes"],
  ["No Answer", "no"],
  ["Yes, Sent", "yes"],
  ["Cancel", "cancel"],
] as const) check(`"${label}" → ${action}`, BUTTON_ACTIONS[label], action)

console.log("\nphase derived from the rendered buttons")
check("chooser", derivePhase(["Call", "Text", "Cancel"]), "choose-method")
check("call confirmation", derivePhase(["Yes, Contacted", "No Answer", "Cancel"]), "confirm-call")
check("text confirmation", derivePhase(["Yes, Sent", "Cancel"]), "confirm-text")

console.log("\nno phase = no context = nothing executes")
check("nothing rendered", derivePhase([]), null)
check("a stray Cancel elsewhere", derivePhase(["Cancel"]), null)
check("unrelated buttons", derivePhase(["Save", "Delete", "Close"]), null)
check("partial chooser", derivePhase(["Call"]), null)

console.log("\nvalid responses per phase")
check("chooser accepts", PHASE_ACTIONS["choose-method"], ["call", "text", "cancel"])
check("call confirm accepts", PHASE_ACTIONS["confirm-call"], ["yes", "no", "cancel"])
check("text confirm accepts", PHASE_ACTIONS["confirm-text"], ["yes", "cancel"])

console.log("\nfail closed — the Text confirmation has no No action")
check("'no' is NOT valid on the text confirmation", isValidForPhase("confirm-text", "no"), false)
check("'yes' IS valid on the text confirmation", isValidForPhase("confirm-text", "yes"), true)
check("'cancel' is valid on the text confirmation", isValidForPhase("confirm-text", "cancel"), true)
check("'no' IS valid on the call confirmation", isValidForPhase("confirm-call", "no"), true)
check("'call' is not valid mid-confirmation", isValidForPhase("confirm-call", "call"), false)
check("'yes' is not valid at the chooser", isValidForPhase("choose-method", "yes"), false)

console.log("\ncontextual phrases parse to a response intent")
for (const [said, kind] of [
  ["Call", "respond_call"],
  ["call her", "respond_call"],
  ["Text", "respond_text"],
  ["message her", "respond_text"],
  ["Yes", "confirm_yes"],
  ["Yeah", "confirm_yes"],
  ["Yep", "confirm_yes"],
  ["I sent it", "confirm_yes"],
  ["I texted her", "confirm_yes"],
  ["No", "confirm_no"],
  ["Nope", "confirm_no"],
  ["No answer", "confirm_no"],
  ["She didn't answer", "confirm_no"],
  ["I couldn't reach her", "confirm_no"],
  ["Cancel", "cancel"],
  ["Never mind", "cancel"],
] as const) check(`"${said}" → ${kind}`, parseCommand(said).kind, kind)

console.log("\na bare response never names a client")
check("'Call' alone is not a contact command", parseCommand("Call").kind, "respond_call")
check("'Call Maria' still IS a contact command", parseCommand("Call Maria").kind, "contact_client")
check("'Text' alone is not a contact command", parseCommand("Text").kind, "respond_text")
check("'Text Maria' still IS a contact command", parseCommand("Text Maria").kind, "contact_client")

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
