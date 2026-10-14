// GOOGLE DISCONNECT — and the claims the privacy policy is allowed to make.
//
// Pure and offline. Run: `npx tsx scripts/tests/googleDisconnect.test.ts`
// No account is disconnected, no Google call is made.
//
// Two things are locked down here. First, that disconnecting actually disconnects — and never
// REPORTS a disconnect it did not achieve, which is the one failure an agent cannot detect for
// themselves. Second, that each sentence we are about to publish in the privacy policy matches
// what the code does; a policy is a promise, and the cheapest place to catch a false one is here.

import { readFileSync, existsSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n")

const route = readFileSync("app/api/google/disconnect/route.ts", "utf8")
const routeCode = code(route)
const ui = readFileSync("components/crm/integrations/GoogleDisconnectButton.tsx", "utf8")
const page = readFileSync("components/crm/integrations/IntegrationsClient.tsx", "utf8")
const stage = readFileSync("app/api/admin/leads/update-stage/route.ts", "utf8")

// ── IT IS THE CALLER'S OWN ACCOUNT, ALWAYS ──────────────────────────────────────────────────
console.log("\nOnly ever your own account")
ok("the user comes from the session", /await supabase\.auth\.getUser\(\)/.test(routeCode))
ok("unauthenticated is refused", /if \(!user\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\)/.test(routeCode))
ok("every write is scoped to that user id", (routeCode.match(/\.eq\("user_id", user\.id\)|\.eq\("id", user\.id\)/g) || []).length >= 2)
// NO USER ID FROM THE REQUEST. A body-supplied id is how one agent disconnects another.
ok("the route reads no request body at all", !/req\.json\(\)|request\.json\(\)|searchParams/.test(routeCode))
ok("it takes no parameters", /export async function POST\(\)/.test(routeCode))

// ── REVOKE, THEN DELETE ─────────────────────────────────────────────────────────────────────
console.log("\nRevocation")
ok("it calls Google's revocation endpoint", /https:\/\/oauth2\.googleapis\.com\/revoke/.test(routeCode))
ok("revoking the refresh token, which revokes the grant", /token: cred\.refresh_token/.test(routeCode))
// ORDER MATTERS: deleting first would discard the only token that can revoke the grant.
ok("revocation happens BEFORE our copy is deleted", routeCode.indexOf("oauth2.googleapis.com/revoke") < routeCode.indexOf('.from("google_credentials")\n    .delete()'))
ok("an already-gone grant (400 invalid_token) counts as revoked", /else if \(res\.status === 400\) revoked = "revoked"/.test(routeCode))

console.log("\nNever a success it did not achieve")
ok("a failed revocation is not reported as revoked", /revoked: revoked === "revoked"/.test(routeCode))
ok("the UI distinguishes clean from partial", /kind: "clean"/.test(ui) && /kind: "partial"/.test(ui))
ok("the partial message says what did NOT happen", /could not confirm removal at Google/.test(ui))
ok("and links to the page that finishes it", /myaccount\.google\.com\/permissions/.test(ui))
// A credential we still hold is a connection that still works — that is an error, not a partial.
ok("failing to delete our credential is a hard error", /Nothing was disconnected — please try again/.test(route))
ok("the connected flag is cleared only AFTER the delete succeeds", routeCode.indexOf('.delete()') < routeCode.indexOf("google_connected: false"))

// ── CONFIRMATION ────────────────────────────────────────────────────────────────────────────
console.log("\nConfirmation")
ok("the destructive action is behind a confirm step", /const \[confirming, setConfirming\] = useState\(false\)/.test(ui))
ok("Cancel leaves everything unchanged", /onClick=\{\(\) => setConfirming\(false\)\}/.test(ui) && !/setConfirming\(false\)[\s\S]{0,80}fetch\(/.test(ui))
ok("the confirm text names the consequence, not 'are you sure'", /New leads will stop creating Google contacts and calendar events/.test(ui))
ok("it states what SURVIVES", /already created stay in your Google account/.test(ui))
ok("and that this is not a sign-out", /does not\s*\n?\s*sign you out/.test(ui.replace(/\s+/g, " ")) || /does not sign you out/.test(ui.replace(/\s+/g, " ")))

// ── GOOGLE LOGIN IS A DIFFERENT THING ───────────────────────────────────────────────────────
console.log("\nGoogle Login is untouched")
ok("the route never touches Supabase auth identities", !/auth\.admin|identities|signOut/.test(routeCode))
ok("it deletes only the Calendar/Contacts credential row", (routeCode.match(/\.delete\(\)/g) || []).length === 1)
ok("Google Login still uses its own client", readFileSync("app/(auth)/_components/GoogleButton.tsx", "utf8").includes("NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID"))

// ── NOTHING ELSE IS DELETED ─────────────────────────────────────────────────────────────────
console.log("\nRecords survive")
for (const t of ["leads", "lead_next_actions", "lead_recommendations", "companion_messages"]) {
  ok(`${t} is not touched`, !new RegExp(`from\\("${t}"\\)`).test(routeCode))
}
ok("no stored google_contact_id or google_event_id is cleared", !/google_contact_id|google_event_id/.test(routeCode))

// ── RECONNECT STILL WORKS ───────────────────────────────────────────────────────────────────
console.log("\nReconnect")
ok("the Connect/Reconnect entry point is unchanged", /\/api\/google\/auth\?next=\/admin\/integrations/.test(page))
ok("Disconnect shows only when connected", /\{googleConnected && <GoogleDisconnectButton \/>\}/.test(page))
ok("the page re-reads server state after disconnecting", /router\.refresh\(\)/.test(ui))

// ── THE PRIVACY CLAIMS, CHECKED AGAINST THE CODE ────────────────────────────────────────────
// Each of these decides a sentence we are about to publish. A policy that overstates is worse
// than one that admits an awkward truth.
console.log("\nClaims we may publish")
ok("CLAIM: we search contacts by phone — true", /searchContacts\(\{/.test(code(stage)))
ok("CLAIM: that search reads names and phone numbers — true, so we must say so", /readMask: "names,phoneNumbers,metadata"/.test(code(stage)))
// The draft said we never modify contacts we did not create. Path B does exactly that.
ok("CLAIM 'we never modify contacts we did not create' is FALSE — Path B updates a searched contact",
  /findContactByPhone\(formattedPhone, googleClient\)[\s\S]{0,400}updateGoogleContactNotes\(resourceName/.test(code(stage)))
ok("CLAIM: we only ever modify the notes/biography field — true", /updatePersonFields: "biographies"/.test(readFileSync("lib/google/updateContactNotes.ts", "utf8")))
ok("CLAIM: we delete no contacts — true", !/deleteContact/.test(code(stage) + code(readFileSync("lib/google/createGoogleContact.ts", "utf8"))))
ok("CLAIM: we delete no calendar events — true", !/events\.delete/.test(code(readFileSync("lib/google/createCalendarEvent.ts", "utf8"))))
ok("CLAIM: we only patch events we created — true, by stored id", /existingEventId: action\.google_event_id/.test(readFileSync("lib/google/syncContactLeadEvent.ts", "utf8")))
ok("CLAIM: deleting the account revokes Google — true", /google_credentials/.test(readFileSync("app/api/account/delete/route.ts", "utf8")))
ok("the disconnect route exists, so the policy may describe it", existsSync("app/api/google/disconnect/route.ts"))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
