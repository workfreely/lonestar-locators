// Beast Voice Alpha — parser + resolver. Both are pure, so the whole command
// layer is testable without a browser, a microphone, or the CRM.
// Run: npx tsx scripts/tests/beastVoice.test.ts

import { parseCommand } from "../../lib/beastVoice/parseCommand"
import { resolveClient } from "../../lib/beastVoice/resolveClient"

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

// Every phrasing in the approved Contact phrase library, asserted to land on
// contact_client with the right method. The library is the spec; these are it.
type M = "unspecified" | "call" | "text"
function contact(input: string, name: string, method: M) {
  const p = parseCommand(input) as any
  check(`"${input}"`, { kind: p.kind, clientName: p.clientName, method: p.method }, {
    kind: "contact_client", clientName: name, method,
  })
}

console.log("\ncontact_client — method: unspecified")
for (const i of [
  "Beast, contact Maria", "Contact Maria",
  "Beast, contact Maria Gonzalez", "Contact Maria Gonzalez",
]) contact(i, i.toLowerCase().includes("gonzalez") ? "maria gonzalez" : "maria", "unspecified")
for (const i of [
  "Beast, move Maria to Contacted", "Move Maria to Contacted",
  "Beast, move Maria Gonzalez to Contacted", "Move Maria Gonzalez to Contacted",
]) contact(i, i.toLowerCase().includes("gonzalez") ? "maria gonzalez" : "maria", "unspecified")

console.log("\ncontact_client — method: call")
for (const i of [
  "Beast, call Maria", "Call Maria",
  "Beast, contact Maria by phone", "Contact Maria by phone",
  "Beast, give Maria a call", "Give Maria a call",
  "Beast, call Maria for me", "Call Maria for me",
]) contact(i, "maria", "call")
for (const i of ["Beast, call Maria Gonzalez", "Call Maria Gonzalez"]) contact(i, "maria gonzalez", "call")

console.log("\ncontact_client — method: text")
for (const i of [
  "Beast, text Maria", "Text Maria",
  "Beast, contact Maria by text", "Contact Maria by text",
  "Beast, send Maria a text", "Send Maria a text",
  "Beast, send Maria a message", "Send Maria a message",
]) contact(i, "maria", "text")
for (const i of ["Beast, text Maria Gonzalez", "Text Maria Gonzalez"]) contact(i, "maria gonzalez", "text")

console.log("\nspecific phrasing beats the generic one")
check("'contact X by phone' is not plain contact", (parseCommand("contact maria by phone") as any).method, "call")
check("'contact X by text' is not plain contact", (parseCommand("contact maria by text") as any).method, "text")
check("phrase id recorded for the log", (parseCommand("give maria a call") as any).phrase, "give-a-call")

console.log("\nspeech tolerances")
contact("BEAST!! CONTACT MARIA GONZALEZ.", "maria gonzalez", "unspecified")
contact("least contact maria", "maria", "unspecified")
contact("contact the client Maria please", "maria", "unspecified")
contact("move maria gonzalez to contact", "maria gonzalez", "unspecified")

console.log("\nconfirm_yes")
for (const i of [
  "Yes", "Yeah", "Yep", "I did", "Yes, I did",
  "I reached her", "I reached him", "Yes, I reached her", "Yes, I reached him",
  "I texted her", "I texted him", "Yes, I texted her", "Yes, I texted him",
]) check(`"${i}"`, parseCommand(i).kind, "confirm_yes")

console.log("\nconfirm_no")
for (const i of [
  "No", "Nope", "Not yet", "I didn't", "No, I didn't", "No answer",
  "She didn't answer", "He didn't answer", "I couldn't reach her", "I couldn't reach him",
]) check(`"${i}"`, parseCommand(i).kind, "confirm_no")

console.log("\ncancel")
// "Stop" is NO LONGER a cancel — V1 §37 makes Stop its own intent (end listening
// / the chain, reverse nothing), distinct from Cancel (dismiss). "Stop it/that"
// stays a cancel because it targets a thing to dismiss.
for (const i of ["Cancel", "Never mind", "Nevermind", "Forget it", "Stop it", "Cancel that"])
  check(`"${i}"`, parseCommand(i).kind, "cancel")

console.log("\nstop (§37 — distinct from cancel)")
for (const i of ["Stop", "Stop listening", "That's enough"])
  check(`"${i}"`, parseCommand(i).kind, "stop")

console.log("\nresponses never swallow a command")
check("'no answer' stays an answer", parseCommand("no answer").kind, "confirm_no")
check("'call Maria' is not cancel", (parseCommand("call maria") as any).kind, "contact_client")
check("'stop' alone is a stop, not cancel", parseCommand("stop").kind, "stop")
check("'text Maria' is not a yes", (parseCommand("text maria") as any).kind, "contact_client")
check("a response inside a sentence is not an answer", parseCommand("yes contact maria").kind, "unknown")

console.log("\nmust NOT execute")
for (const [label, input] of [
  ["empty", ""],
  ["wake word alone", "Beast"],
  ["out-of-scope stage", "move maria gonzalez to closed"],
  ["out-of-scope command", "schedule a tour for maria"],
  ["no client named", "contact"],
  ["chatter", "what's the weather"],
] as const) check(label, parseCommand(input).kind, "unknown")

// A bare method word is a CONTEXTUAL response, not a command: it names no
// client, so it can only ever mean "the Call button of the question on screen".
// Execution is gated on an active prompt (see beastVoicePrompt.test.ts).
check("bare 'call' is a response, not a command", parseCommand("call").kind, "respond_call")
check("bare 'text' is a response, not a command", parseCommand("text").kind, "respond_text")

const LEADS = [
  { id: 1, first_name: "Maria", last_name: "Gonzalez", crm_status: "new" },
  { id: 2, first_name: "Maria", last_name: "Hernandez", crm_status: "contacted" },
  { id: 3, first_name: "Sarah", last_name: "Kim", crm_status: "searching" },
  { id: 4, first_name: "José", last_name: "Álvarez", crm_status: "new" },
  { id: 5, first_name: "", last_name: "", crm_status: "new" },
]

console.log("\nresolveClient")
check("exact full name", (resolveClient("maria gonzalez", LEADS) as any).lead?.id, 1)
check("unique first name", (resolveClient("sarah", LEADS) as any).lead?.id, 3)
check("unique last name", (resolveClient("kim", LEADS) as any).lead?.id, 3)
check("clipped full name", (resolveClient("sarah ki", LEADS) as any).lead?.id, 3)
check("accents folded", (resolveClient("jose alvarez", LEADS) as any).lead?.id, 4)
check("case + punctuation", (resolveClient("MARIA GONZALEZ!", LEADS) as any).lead?.id, 1)

console.log("\nresolveClient — never guesses")
const many = resolveClient("maria", LEADS)
check("ambiguous first name asks", many.kind, "many")
check("ambiguous returns both", (many as any).leads?.map((l: any) => l.id), [1, 2])
check("exact beats ambiguous", resolveClient("maria gonzalez", LEADS).kind, "one")
check("no match", resolveClient("bartholomew", LEADS).kind, "none")
check("empty name", resolveClient("", LEADS).kind, "none")
check("empty board", resolveClient("maria", []).kind, "none")
check("unnamed lead never matches", (resolveClient("maria", LEADS) as any).leads?.some((l: any) => l.id === 5), false)

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
