// Beast Voice V1 — the input-layer grammar, chain splitting, and pure intent →
// action mapping. Parser, chain splitter, and resolveIntent are all pure, so the
// whole command layer is testable without a browser, a microphone, or the CRM.
// Run: npx tsx scripts/tests/beastVoiceV1.test.ts
//
// The executor (BeastVoiceMic) invokes existing handlers and needs the DOM/React,
// so it is verified by the app build + manual QA; here we lock down that each
// utterance PARSES to the right intent and RESOLVES to the exact existing action.

import { parseCommand, parseChain } from "../../lib/beastVoice/parseCommand"
import { resolveIntent } from "../../lib/beastVoice/resolveIntent"

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
const kind = (s: string) => parseCommand(s).kind
const p = (s: string) => parseCommand(s) as any

// ── Navigation (§17) ─────────────────────────────────────────────────────────
console.log("\nnavigation — bare + open/show/pull-up aliases")
for (const [i, target] of [
  ["open profile", "profile"], ["my profile", "profile"],
  ["smart lead form", "smart_lead_form"], ["open smart lead form", "smart_lead_form"],
  ["sales analytics", "analytics"], ["analytics", "analytics"], ["show analytics", "analytics"],
  ["sales goals", "sales_goals"],
  ["integrations", "integrations"], ["open integrations", "integrations"],
  ["import leads", "import_leads"], ["import", "import_leads"],
  ["billing", "billing"],
  ["help", "help"], ["help center", "help"], ["open help center", "help"],
  ["social beast", "social_beast"], ["beast social", "social_beast"],
  ["referral network", "referral_network"], ["beast referral network", "referral_network"],
  ["license verification", "license_verification"], ["agent licenses", "license_verification"],
] as const) check(`"${i}"`, { k: p(i).kind, t: p(i).target }, { k: "navigate", t: target })

console.log("\nnavigation — resolveIntent maps to the exact existing routes")
check("profile route", resolveIntent(p("open profile")), { kind: "navigate", route: "/admin/profile", label: "Profile" })
check("analytics route", resolveIntent(p("analytics")), { kind: "navigate", route: "/admin/analytics", label: "Sales Analytics" })
check("sales goals route", resolveIntent(p("sales goals")), { kind: "navigate", route: "/admin/settings", label: "Sales Goals" })
check("social route", resolveIntent(p("social beast")), { kind: "navigate", route: "/admin/social-autopilot", label: "Social Beast" })

// ── Workspace / Focus / Agenda (§13, §16, §15) ────────────────────────────────
console.log("\nworkspace / focus / agenda")
check("open map", p("open map"), { kind: "workspace", target: "map" })
check("bare map", p("map"), { kind: "workspace", target: "map" })
check("lead board", p("lead board"), { kind: "workspace", target: "board" })
check("show board", p("show board"), { kind: "workspace", target: "board" })
check("focus", p("focus"), { kind: "focus", on: true })
check("exit focus", p("exit focus"), { kind: "focus", on: false })
check("open agenda", p("open agenda"), { kind: "agenda", op: "open" })
check("move agenda right (absolute)", p("move the agenda to the right"), { kind: "agenda", op: "right" })
check("move it left (absolute, pronoun)", p("move it left"), { kind: "agenda", op: "left" })
check("expand agenda", p("expand agenda"), { kind: "agenda", op: "expand" })

// ── Theme (§18) ────────────────────────────────────────────────────────────────
console.log("\ntheme — canonical ids only")
for (const [i, t] of [
  ["set theme to midnight", "midnight"], ["theme obsidian", "obsidian"],
  ["change theme to evergreen", "evergreen"], ["use rose theme", "rose"], ["purple theme", "purple"],
] as const) check(`"${i}"`, p(i), { kind: "theme", theme: t })
check("unknown theme does not parse", kind("set theme to neon"), "unknown")

// ── Add Lead (§14) ──────────────────────────────────────────────────────────────
console.log("\nadd lead — opens modal only")
for (const i of ["add lead", "new lead", "create lead", "add a lead"]) check(`"${i}"`, kind(i), "add_lead")

// ── Select / open client (§19) ───────────────────────────────────────────────
console.log("\nselect client — last-resort opener, never shadows a specific 'open X'")
check("open Maria → select", p("open maria"), { kind: "select_client", clientName: "maria" })
check("pull up Maria → select", p("pull up maria gonzalez"), { kind: "select_client", clientName: "maria gonzalez" })
check("open map is NOT a client", p("open map").kind, "workspace")
check("open profile is NOT a client", p("open profile").kind, "navigate")
check("open agenda is NOT a client", p("open agenda").kind, "agenda")
check("open check application is NOT a client", p("open check application").kind, "crm_open")

// ── Copy (§8) — allow-listed fields only ─────────────────────────────────────
console.log("\ncopy — phone / email / property address")
check("copy Maria's phone number", p("copy maria's phone number"), { kind: "copy", field: "phone", target: "client", clientName: "maria" })
check("copy Maria's phone", p("copy maria's phone"), { kind: "copy", field: "phone", target: "client", clientName: "maria" })
check("copy this client's phone", p("copy this client's phone number"), { kind: "copy", field: "phone", target: "client", clientName: null })
check("copy Maria's email", p("copy maria's email"), { kind: "copy", field: "email", target: "client", clientName: "maria" })
check("copy this property address", p("copy this property address"), { kind: "copy", field: "address", target: "current_property", clientName: null })
check("copy the address", p("copy the address"), { kind: "copy", field: "address", target: "current_property", clientName: null })
check("copy password is NOT supported", kind("copy this client's password"), "unknown")

// ── CRM-owned OPEN flows (§7, §24–§32) — never completed by voice, only opened ─
console.log("\nCRM-owned flows — open verbs")
for (const [i, verb, cn] of [
  ["check application", "open-check-application", null],
  ["check Maria's application", "open-check-application", "maria"],
  ["mark application checked", "open-check-application", null],
  ["apply", "open-apply", null],
  ["open application", "open-apply", null],
  ["confirm lease", "open-confirm-lease", null],
  ["guest card", "open-guest-card", null],
  ["send guest card", "open-guest-card", null],
  ["invoice details", "open-invoice-details", null],
  ["send invoice", "open-send-invoice", null],
  ["mark commission paid", "open-commission-paid", null],
  ["commission paid", "open-commission-paid", null],
  ["send rebate", "open-send-rebate", null],
  ["tour follow-up", "open-tour-follow-up", null],
] as const) check(`"${i}"`, { k: p(i).kind, v: p(i).verb, c: p(i).clientName }, { k: "crm_open", v: verb, c: cn })

// ── Edit client (§23) ──────────────────────────────────────────────────────────
console.log("\nedit client")
check("edit Maria", p("edit maria"), { kind: "edit_client", clientName: "maria" })
check("edit client", p("edit client"), { kind: "edit_client", clientName: null })
check("open client editor", p("open client editor"), { kind: "edit_client", clientName: null })

// ── Property actions on the current property (§20–§22) ────────────────────────
console.log("\nproperty actions — 'this'")
for (const [i, verb] of [
  ["recommend this", "add-recommendation"],
  ["recommend this property", "add-recommendation"],
  ["add this to recommendations", "add-recommendation"],
  ["favorite this", "move-to-favorite"],
  ["move this to favorites", "move-to-favorite"],
  ["add this to favorites", "move-to-favorite"],
  ["move this to recommendations", "move-to-recommendation"],
  ["remove this from recommendations", "remove-recommendation"],
  ["remove this recommendation", "remove-recommendation"],
] as const) check(`"${i}"`, { k: p(i).kind, v: p(i).verb }, { k: "property_action", v: verb })
check("exclude is NOT remove (§22)", kind("exclude this"), "unknown")

// ── Market / Unleash (§1) ────────────────────────────────────────────────────
console.log("\nmarket / unleash")
check("switch to Dallas", p("switch to dallas"), { kind: "market", spoken: "dallas" })
check("set market to Houston", p("set market to houston"), { kind: "market", spoken: "houston" })
check("select Dallas is a CLIENT opener (map falls back to market)", p("select dallas"), { kind: "select_client", clientName: "dallas" })
check("unleash", kind("unleash"), "unleash")
check("unleash the beast", kind("unleash the beast"), "unleash")

// ── Ask Beast (§36) ──────────────────────────────────────────────────────────
console.log("\nask beast — open/focus only")
check("ask beast", kind("ask beast"), "ask_beast")
check("open ask beast", kind("open ask beast"), "ask_beast")

// ── Completion (§2, §3) — companion-owned, DEFERRED for executable V1 ──────────
// These are recognized so telemetry + the explicit "complete it in Beast
// Companion" response fire, but the executor NEVER mutates or reports success.
console.log("\ncompletion language (recognized → deferred family)")
check("mark first follow-up complete", p("mark first follow-up complete"), { kind: "completion", target: "post_list_follow_up" })
check("complete first follow-up", p("complete first follow-up"), { kind: "completion", target: "post_list_follow_up" })
check("second follow-up done", p("second follow-up done"), { kind: "completion", target: "post_list_follow_up" })
check("done with final follow-up", p("done with final follow-up"), { kind: "completion", target: "post_list_follow_up" })
check("finish final follow-up", p("finish final follow-up"), { kind: "completion", target: "post_list_follow_up" })
check("mark final contact attempt complete", p("mark final contact attempt complete"), { kind: "completion", target: "contact_follow_up" })
check("complete send list", p("complete send list"), { kind: "completion", target: "send_list" })
check("send list (opener → deferred)", p("send list"), { kind: "completion", target: "send_list" })
check("complete build list", p("complete build list"), { kind: "completion", target: "build_list" })
check("build list (opener → deferred)", p("build list"), { kind: "completion", target: "build_list" })
check("schedule tour (opener → deferred)", p("schedule tour"), { kind: "completion", target: "schedule_tour" })
check("mark this complete (generic)", p("mark this complete"), { kind: "completion", target: "generic" })
check("done (generic)", p("done"), { kind: "completion", target: "generic" })

// A completion command must NEVER resolve to an executable/mutating action — it
// is always the deferred `completion` kind, never a crm_open or property verb.
console.log("\ncompletion is NEVER an executable verb (no false success possible)")
for (const i of [
  "mark first follow-up complete", "complete send list", "complete build list",
  "done with final follow-up", "mark final contact attempt complete",
]) check(`"${i}" stays completion`, kind(i), "completion")

console.log("\nSHOW ≠ COMPLETE (§5)")
check("'show first follow-up' is a display/select, not a completion", kind("show first follow-up"), "select_client")
check("'mark first follow-up complete' IS a completion", kind("mark first follow-up complete"), "completion")
check("'open check application' opens (not complete)", kind("open check application"), "crm_open")

// ── Stop (§37) ────────────────────────────────────────────────────────────────
console.log("\nstop")
check("stop", kind("stop"), "stop")
check("stop listening", kind("stop listening"), "stop")

// ── Chains (§38, §39) ─────────────────────────────────────────────────────────
console.log("\nchains — one utterance, ordered segments")
check("open map, select Dallas, unleash beast",
  parseChain("open map, select Dallas, unleash beast").map((c) => c.kind),
  ["workspace", "select_client", "unleash"])
check("open Maria, check application",
  parseChain("open Maria, check application").map((c) => c.kind),
  ["select_client", "crm_open"])
check("open agenda and move it right",
  parseChain("open agenda and move it right").map((c) => c.kind),
  ["agenda", "agenda"])
check("open Maria, text her → 2 segments",
  parseChain("open Maria then text her").map((c) => c.kind),
  ["select_client", "respond_text"])
check("single command is a one-element chain",
  parseChain("open map").map((c) => c.kind), ["workspace"])
check("chain preserves the market segment payload",
  (parseChain("open map, switch to Dallas")[1] as any).spoken, "dallas")

// ── Negative tests (§44, §46) — deferred / unsupported never parse ────────────
console.log("\nnegative — deferred + unsupported produce NO command")
for (const [label, i] of [
  ["archive (deferred §10)", "archive maria"],
  ["add task (deferred §11)", "add task"],
  ["paste (deferred §9)", "paste into the phone field"],
  ["return-to-stage (deferred §46)", "return maria to contacted"],
  ["raw set-stage (deferred §46)", "set maria to closed"],
  ["autofill (deferred §9)", "autofill maria gonzalez"],
  ["chatter", "what's the weather"],
  ["empty", ""],
  ["wake word alone", "beast"],
] as const) check(label, kind(i), "unknown")

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
