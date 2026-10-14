// GOOGLE INTEGRATION HEALTH — classification and the reconnect signal.
//
// Pure and offline. Run: `npx tsx scripts/tests/googleIntegrationHealth.test.ts`
//
// The defect: a refresh token revoked in August kept failing into October with nothing surfaced,
// so every new lead silently skipped its contact and its calendar event. These assertions are
// about making that visible WITHOUT leaking anything or crying wolf on a transient error.

import { classifyGoogleError, isTerminalAuthError, TERMINAL_AUTH_ERRORS, AUTO_SYNCED_ACTION_KEY } from "@/lib/google/integrationHealthRules"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("\nClassification")
ok("an invalid_grant response is classified", classifyGoogleError({ response: { data: { error: "invalid_grant" } } }) === "invalid_grant")
ok("a bare code is classified", classifyGoogleError({ code: "unauthorized_client" }) === "unauthorized_client")
ok("an unknown shape collapses safely", classifyGoogleError(new Error("boom")) === "unknown_error")
ok("nothing collapses safely", classifyGoogleError(undefined) === "unknown_error")
// NO LEAKS: a provider message must never become the stored code.
ok(
  "a provider sentence is NOT stored verbatim",
  classifyGoogleError({ response: { data: { error: "Token has been expired or revoked for user@example.com" } } }) === "unknown_error",
)
ok("codes stay short", classifyGoogleError({ code: "x".repeat(200) }).length <= 48)

console.log("\nTerminal vs transient")
for (const t of ["invalid_grant", "unauthorized_client", "invalid_client"]) ok(`${t} is terminal`, isTerminalAuthError(t))
// A blip must NOT send the agent through OAuth to fix something that fixes itself.
for (const t of ["unknown_error", "backend_error", "rate_limit_exceeded", "internal_failure", ""]) {
  ok(`${t || "(empty)"} is NOT terminal`, !isTerminalAuthError(t))
}
ok("the terminal set stays small and explicit", TERMINAL_AUTH_ERRORS.size === 3)

console.log("\nSync policy")
ok("only contact_lead syncs automatically", AUTO_SYNCED_ACTION_KEY === "contact_lead")
for (const k of ["build_list", "send_list", "follow_up_1", "setup_tour", "email_guest_card", "check_application"]) {
  ok(`${k} is NOT auto-synced`, k !== AUTO_SYNCED_ACTION_KEY)
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
