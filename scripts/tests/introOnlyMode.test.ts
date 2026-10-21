// INTRO-ONLY MODE: EXACTLY TWO TEXTS, AND NOTHING ELSE IN THE SYSTEM MAY SEND.
//
// The brief is narrow and absolute: a newly created eligible lead gets Text 1 and Text 2 and no
// further automated message, ever — and that must hold for every sequence in the system, not just
// for the new lead's own. So these assertions sweep EVERY sequence and EVERY step, rather than
// checking the handful that happen to be convenient.
//
// They also pin the two failure directions that matter: sending a third message, and silently
// re-enabling six days of follow-ups because a flag was set to something truthy-looking.
import { introOnlyMode, permittedInIntroOnly, ALL_SEQUENCES_FLAG } from "@/lib/followup/introOnly"
import { SEQUENCES } from "@/lib/followup/sequences"
import type { SequenceKey } from "@/lib/followup/types"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

console.log("\n1. THE RESTRICTION HOLDS BY DEFAULT:")
ok("unset ⇒ intro-only (survives a deploy, a rollback, a fresh environment)", introOnlyMode({} as NodeJS.ProcessEnv))
for (const v of ["", "false", "0", "1", "yes", "on", "TRUE", "True"]) {
  ok(`${JSON.stringify(v)} does NOT lift the restriction`,
    introOnlyMode({ [ALL_SEQUENCES_FLAG]: v } as unknown as NodeJS.ProcessEnv))
}
ok('only the exact string "true" lifts it',
  !introOnlyMode({ [ALL_SEQUENCES_FLAG]: "true" } as unknown as NodeJS.ProcessEnv))
ok('" true" is forgiven, matching every other gate here',
  !introOnlyMode({ [ALL_SEQUENCES_FLAG]: " true" } as unknown as NodeJS.ProcessEnv))

console.log("\n2. EXACTLY TWO STEPS ARE PERMITTED, ACROSS THE WHOLE SYSTEM:")
const permitted: string[] = []
const refused: string[] = []
for (const key of Object.keys(SEQUENCES) as SequenceKey[]) {
  for (const step of SEQUENCES[key].steps) {
    ;(permittedInIntroOnly(key, step.key) ? permitted : refused).push(`${key}.${step.key}`)
  }
}
console.log(`  permitted: ${permitted.join(", ") || "(none)"}`)
console.log(`  refused:   ${refused.length} steps`)
ok("EXACTLY two steps are permitted system-wide", permitted.length === 2, permitted.join(", "))
ok("they are new_lead.t1 and new_lead.t2",
  permitted.includes("new_lead.t1") && permitted.includes("new_lead.t2"))

console.log("\n3. THE FLOWS THAT MUST BE OFF ARE OFF — every step of each, checked explicitly:")
for (const key of ["list_sent", "post_tour", "application_status", "done_selecting", "future_move", "resume_search", "tour"] as SequenceKey[]) {
  const steps = SEQUENCES[key]?.steps ?? []
  const anyPermitted = steps.some((s) => permittedInIntroOnly(key, s.key))
  ok(`${key} (${steps.length} step(s)) cannot send`, !anyPermitted)
}

console.log("\n4. THE CONTACT FOLLOW-UPS ARE REFUSED BUT NOT DELETED:")
const newLeadSteps = SEQUENCES.new_lead.steps.map((s) => s.key)
ok("the sequence definition still holds all five steps", newLeadSteps.length === 5, newLeadSteps.join(","))
ok("contact_fu1/2/3 still EXIST in the definition",
  ["contact_fu1", "contact_fu2", "contact_fu3"].every((k) => newLeadSteps.includes(k)))
for (const k of ["contact_fu1", "contact_fu2", "contact_fu3"]) {
  ok(`…but ${k} cannot send`, !permittedInIntroOnly("new_lead", k))
}

console.log("\n5. THE APPROVED WORDING IS UNTOUCHED:")
{
  const src = require("node:fs").readFileSync("packages/companion-shared/src/format/followUpTemplates.ts", "utf8")
  ok("Text 1 is the approved copy",
    src.includes('new_lead_text1: "Hey {first_name} it\'s {agent_first_name}! I got your form{search_tail}"'))
  ok("Text 2 is the approved copy",
    src.includes('new_lead_text2: "Are you trying to stay near a specific address or side of town?"'))
}

console.log("\n6. THE GATE WIRES IT IN, AND IN THE RIGHT PLACE:")
{
  const g = require("node:fs").readFileSync("lib/followup/gate.ts", "utf8")
  ok("the allowlist is consulted", /introOnlyMode\(env\) && !permittedInIntroOnly\(/.test(g))
  ok("a refusal CANCELS (so it cannot pin the lifecycle slot)", /reason: "intro_only"/.test(g) &&
    /action: "cancel", reason: "intro_only"/.test(g))
  // Order matters: it must sit above the lifecycle/suppression logic, with the hard stops.
  const introAt = g.indexOf('reason: "intro_only"')
  const lifecycleAt = g.indexOf("LIFECYCLE SUPERSESSION")
  const optOutAt = g.indexOf('reason: "opt_out"')
  ok("it is checked BEFORE lifecycle supersession", introAt > 0 && introAt < lifecycleAt)
  ok("…and AFTER the opt-out hard stop, which must always win", optOutAt > 0 && optOutAt < introAt)

  console.log("\n7. TEXT 2 YIELDS TO A REPLY; TEXT 1 DOES NOT:")
  ok("t2 is named in the reply check",
    /replyStops\s*=\s*step\.gate === "full" \|\| \(run\.sequenceKey === "new_lead" && run\.stepKey === "t2"\)/.test(g))
  ok("t1 is NOT named there, so the greeting still sends", !/run\.stepKey === "t1"/.test(g))
  ok("a reply cancels rather than holds", /replyStops && newer\(/.test(g) &&
    g.slice(g.indexOf("replyStops && newer(")).startsWith("replyStops && newer(conv.lastInboundAt, run.baselineInboundAt)) {\n    return { action: \"cancel\", reason: \"client_replied\" }"))

  console.log("\n8. THE SAFEGUARDS ARE STILL THERE:")
  for (const [label, re] of [
    ["opt-out / STOP", /reason: "opt_out"/],
    ["account authorization", /reason: "not_authorized"/],
    ["per-lead enrollment", /reason: "not_enrolled"/],
    ["quiet hours", /reason: "quiet_hours"/],
    ["manual handoff", /reason: "manual_conversation"/],
    ["on hold", /reason: "on_hold"/],
    ["staleness", /reason: "stale_sequence"/],
    ["locator pause", /reason: "paused"/],
  ] as const) {
    ok(`${label} still gates sends`, re.test(g))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
