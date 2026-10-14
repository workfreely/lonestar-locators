// GOOGLE RECONNECT — a successful reconnect must clear the recorded failure.
//
// Pure and offline. Run: `npx tsx scripts/tests/googleReconnect.test.ts`
// No network, no database, no OAuth.
//
// THE DEFECT THIS GUARDS. The health work records `last_error = "invalid_grant"` when a token is
// revoked, and both shouldAttemptGoogle and getGoogleHealth read it. The OAuth callback wrote a
// fresh refresh token but left that column untouched — so reconnecting fixed nothing a caller
// could see: the Integrations page kept saying "Reconnect Google", and the server-side Contact
// Lead calendar sync kept returning "needs_reconnect" and skipping before it ever tried the new,
// perfectly good token. Silent, permanent, and invisible to the agent who just reconnected.

import { readFileSync } from "node:fs"
import { reconnectCredentialRow, isTerminalAuthError } from "@/lib/google/integrationHealthRules"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/calendar.events",
] as const

const now = new Date("2026-10-14T13:00:00.000Z")
const row = reconnectCredentialRow({
  userId: "c567c077-d3f4-4532-8807-a54795f753f5",
  refreshToken: "REFRESH_TOKEN_PLACEHOLDER",
  googleEmail: "agent@example.com",
  scopes: SCOPES,
  now,
})

// ── the fix ─────────────────────────────────────────────────────────────────────────────────
console.log("\nA reconnect clears the recorded failure")
ok("last_error is cleared", row.last_error === null)
ok("last_error_at is cleared", row.last_error_at === null)
// Both, together. Clearing the code but keeping the timestamp would leave getGoogleHealth
// reporting a `since` for a failure that no longer exists.
ok("both are cleared in the SAME write as the token", row.last_error === null && row.last_error_at === null && row.refresh_token.length > 0)

// ── and the health chain then reads healthy ──────────────────────────────────────────────────
console.log("\nThe cleared value is what the health checks read")
const code = (row.last_error ?? "").trim()
ok("shouldAttemptGoogle's predicate now allows an attempt", !(code && isTerminalAuthError(code)))
ok("getGoogleHealth's predicate no longer reports needsReconnect", !(code && isTerminalAuthError(code)))
// NEGATIVE CONTROL: the same predicates must still refuse the pre-reconnect value, or this test
// would pass for a build that simply stopped checking.
ok("a recorded invalid_grant still blocks (the check itself is intact)", isTerminalAuthError("invalid_grant"))
ok("a transient error still does NOT demand a reconnect", !isTerminalAuthError("backenderror"))

// ── nothing else about the row changed ──────────────────────────────────────────────────────
console.log("\nThe credential itself is written as before")
ok("user id carried", row.user_id === "c567c077-d3f4-4532-8807-a54795f753f5")
ok("refresh token carried", row.refresh_token === "REFRESH_TOKEN_PLACEHOLDER")
ok("google email carried", row.google_email === "agent@example.com")
ok("a null email stays null, never a guess", reconnectCredentialRow({ userId: "u", refreshToken: "t", googleEmail: null, scopes: SCOPES, now }).google_email === null)
ok("both scopes stored", row.scopes.length === 2 && row.scopes.includes(SCOPES[0]) && row.scopes.includes(SCOPES[1]))
ok("scopes are copied, not aliased to the caller's array", row.scopes !== (SCOPES as unknown as string[]))
ok("updated_at is the reconnect moment", row.updated_at === now.toISOString())

// ── the callback actually USES it ───────────────────────────────────────────────────────────
// A builder nobody calls fixes nothing. This asserts the wiring, which is the part that was
// missing in the first place.
console.log("\nWired into the OAuth callback")
const route = readFileSync("app/api/google/callback/route.ts", "utf8")
ok("callback imports the builder", /import \{ reconnectCredentialRow \}/.test(route))
ok("callback builds its upsert with it", /\.upsert\(\s*\n\s*reconnectCredentialRow\(/.test(route))
ok("no hand-rolled credential row left behind", !/user_id:\s*user\.id,\s*\n\s*refresh_token:/.test(route))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
