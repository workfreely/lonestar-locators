// Comments — Instagram authorization: THE SCOPE CHANGE, and what it must not break.
//
// Pure and offline. Nothing here contacts Instagram; it asserts the shape of the authorization
// request and what we persist afterwards. Run: `npx tsx scripts/social/instagramCommentScope.test.ts`
//
// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────────────────────
// Adding one scope to our own account's authorization has two ways of going wrong, and both are
// silent:
//
//   1. The CLIENT INVITE flow starts asking for the comments scope too. Meta grants a permission at
//      Standard Access only to app users with a role on the app, and comment access on an account we
//      do not own needs Advanced Access — so a client's authorization would be refused or degraded.
//      Publishing for clients works today; it must keep working untouched.
//   2. The PUBLISHING scope gets dropped. A reconnect that loses
//      instagram_business_content_publish leaves the connection looking healthy and breaks every
//      scheduled post, with the failure appearing much later and far from its cause.
//
// Both are asserted below, and each assertion was verified to fail when its guard is removed.

import {
  INSTAGRAM_SCOPES,
  INSTAGRAM_ADMIN_SCOPES,
  instagramAuthorizeUrl,
  missingScopes,
} from "@/lib/social/instagram"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const COMMENTS = "instagram_business_manage_comments"
const PUBLISH = "instagram_business_content_publish"
const BASIC = "instagram_business_basic"
const MESSAGES = "instagram_business_manage_messages"

// ── the admin scope set ─────────────────────────────────────────────────────────────────────
console.log("\nOur own account's scopes")
ok("asks for exactly three scopes", INSTAGRAM_ADMIN_SCOPES.length === 3)
ok("retains basic", INSTAGRAM_ADMIN_SCOPES.includes(BASIC))
ok("retains content publishing", (INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(PUBLISH))
ok("adds comment management", (INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(COMMENTS))
ok(
  "does NOT ask for the messaging scope — private replies do not require it",
  !(INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(MESSAGES),
)
ok(
  "every currently-granted scope is retained, none dropped",
  INSTAGRAM_SCOPES.every((s) => (INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(s)),
)
ok("no duplicates", new Set(INSTAGRAM_ADMIN_SCOPES).size === INSTAGRAM_ADMIN_SCOPES.length)

// ── the client invite flow must be untouched ────────────────────────────────────────────────
console.log("\nThe client invite flow is unchanged")
ok("invite scopes remain exactly two", INSTAGRAM_SCOPES.length === 2)
ok(
  "invite flow never asks a client for comment access",
  !(INSTAGRAM_SCOPES as readonly string[]).includes(COMMENTS),
)

// ── the authorize URL ───────────────────────────────────────────────────────────────────────
console.log("\nThe authorization URL")
const RU = "https://locatorbeast.com/api/admin/social-autopilot/accounts/instagram/callback"
const adminUrl = new URL(instagramAuthorizeUrl(RU, "nonce-1", INSTAGRAM_ADMIN_SCOPES))
const adminScope = adminUrl.searchParams.get("scope") ?? ""
ok("admin URL carries all three scopes", adminScope.split(",").length === 3)
ok("admin URL carries the comments scope", adminScope.includes(COMMENTS))
ok("admin URL still carries publishing", adminScope.includes(PUBLISH))
ok("scopes are comma-separated, as Meta documents", !adminScope.includes(" "))
ok("state is echoed for CSRF", adminUrl.searchParams.get("state") === "nonce-1")
ok("response_type is code", adminUrl.searchParams.get("response_type") === "code")
ok("redirect_uri is exact", adminUrl.searchParams.get("redirect_uri") === RU)

// THE DEFAULT IS THE INVITE SET. This is what keeps a client's consent screen from changing when we
// add a scope for ourselves — the invite flow calls the builder with no scopes argument.
const defaultUrl = new URL(instagramAuthorizeUrl(RU, "nonce-2"))
const defaultScope = defaultUrl.searchParams.get("scope") ?? ""
ok("the builder's DEFAULT is the invite set, not the admin set", defaultScope === INSTAGRAM_SCOPES.join(","))
ok("the default asks for no comment access", !defaultScope.includes(COMMENTS))

// ── what we persist ─────────────────────────────────────────────────────────────────────────
// What gets PERSISTED is decided by resolveGrantedScopes and asserted in
// instagramScopeGrant.test.ts. Here we only check the reporting helper, which answers the narrower
// question "what did we ask for that was not confirmed?".
console.log("\nReported-vs-requested comparison")
ok(
  "a full grant leaves nothing missing",
  missingScopes(INSTAGRAM_ADMIN_SCOPES, [BASIC, PUBLISH, COMMENTS]).length === 0,
)
ok(
  "a partial grant names what is missing",
  JSON.stringify(missingScopes(INSTAGRAM_ADMIN_SCOPES, [BASIC, PUBLISH])) === JSON.stringify([COMMENTS]),
)
ok(
  "a grant missing PUBLISHING is reported — this is the one that breaks posting",
  missingScopes(INSTAGRAM_ADMIN_SCOPES, [BASIC, COMMENTS]).includes(PUBLISH),
)
// WHAT WE RECORD AS GRANTED NO LONGER LIVES HERE. `grantedScopes` was deleted: it fell back to the
// REQUESTED list when the provider reported nothing, which is an assumed grant. The rules that
// replaced it — never assume, never silently revoke — are asserted in instagramScopeGrant.test.ts.
ok("nothing reported ⇒ we claim nothing is missing, because we do not know", missingScopes(INSTAGRAM_ADMIN_SCOPES, undefined).length === 0)
ok("an empty array also means we know nothing, so nothing is reported missing",
  missingScopes(INSTAGRAM_ADMIN_SCOPES, []).length === 0)
ok("a COMMA-SEPARATED string is understood, so a partial grant is seen as partial",
  JSON.stringify(missingScopes(INSTAGRAM_ADMIN_SCOPES, BASIC + "," + PUBLISH)) === JSON.stringify([COMMENTS]))
ok("whitespace in a reported scope is trimmed",
  missingScopes(INSTAGRAM_ADMIN_SCOPES, [" " + BASIC + " ", PUBLISH, COMMENTS]).length === 0)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
