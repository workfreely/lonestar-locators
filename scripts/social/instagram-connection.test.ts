// Focused automated tests for the Instagram Login connection foundation (lib/social/instagram).
// External Meta HTTP calls are MOCKED — this NEVER contacts Instagram and is completely
// separate from the production smoke test. Run: `npx tsx scripts/social/instagram-connection.test.ts`
//
// Covers: env-config gating, CSRF state validation, authorize-URL scope/params, redirect URI,
// and the code→short→long→profile→refresh exchanges (success + error paths) via a mock fetch.

import {
  INSTAGRAM_SCOPES,
  instagramConfigured,
  instagramRedirectUri,
  instagramAuthorizeUrl,
  isValidOAuthState,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  fetchInstagramProfile,
  expiryFromExpiresIn,
} from "@/lib/social/instagram"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
async function throws(label: string, fn: () => Promise<unknown>) {
  try { await fn(); fail++; console.log(`  ✗ ${label} (expected throw)`) }
  catch { pass++; console.log(`  ✓ ${label}`) }
}

// ── mock fetch ──────────────────────────────────────────────────────────────
type MockRes = { ok: boolean; status: number; json: () => Promise<unknown> }
let nextResponses: MockRes[] = []
const origFetch = globalThis.fetch
globalThis.fetch = (async () => {
  const r = nextResponses.shift()
  if (!r) throw new Error("no mock response queued")
  return r as unknown as Response
}) as typeof fetch
const okRes = (body: unknown): MockRes => ({ ok: true, status: 200, json: async () => body })
const errRes = (status: number): MockRes => ({ ok: false, status, json: async () => ({ error: "x" }) })

async function run() {
  console.log("env-config gating (Not configured when env missing/invalid):")
  delete process.env.INSTAGRAM_APP_ID
  delete process.env.INSTAGRAM_APP_SECRET
  ok("unconfigured when both env vars absent", instagramConfigured() === false)
  process.env.INSTAGRAM_APP_ID = "123456789012345"
  ok("still unconfigured with only APP_ID", instagramConfigured() === false)
  process.env.INSTAGRAM_APP_SECRET = "IG_APP_SECRET"
  ok("configured when numeric App ID + secret", instagramConfigured() === true)
  // Digits-guard: a masked/placeholder value must NOT be treated as configured.
  process.env.INSTAGRAM_APP_ID = "••••••"
  ok("bullet App ID → Not configured (no broken authorize URL)", instagramConfigured() === false)
  process.env.INSTAGRAM_APP_ID = "not-a-number"
  ok("non-numeric App ID → Not configured", instagramConfigured() === false)
  process.env.INSTAGRAM_APP_ID = "  123456789012345  "
  ok("whitespace-padded numeric App ID → configured (trimmed)", instagramConfigured() === true)
  process.env.INSTAGRAM_APP_ID = "123456789012345"

  console.log("CSRF state validation:")
  ok("equal non-empty states valid", isValidOAuthState("abc", "abc") === true)
  ok("mismatch invalid", isValidOAuthState("abc", "def") === false)
  ok("missing received invalid", isValidOAuthState(null, "abc") === false)
  ok("missing expected invalid", isValidOAuthState("abc", undefined) === false)
  ok("both empty invalid", isValidOAuthState("", "") === false)

  console.log("authorize URL + redirect URI:")
  const redirect = instagramRedirectUri("https://locatorbeast.com")
  ok("redirect URI points at the API route handler (not the /admin page path)", redirect === "https://locatorbeast.com/api/admin/social-autopilot/accounts/instagram/callback")
  const url = new URL(instagramAuthorizeUrl(redirect, "STATE123"))
  ok("authorizes on instagram.com", url.origin + url.pathname === "https://www.instagram.com/oauth/authorize")
  ok("response_type=code", url.searchParams.get("response_type") === "code")
  ok("scope requests basic + content publish", url.searchParams.get("scope") === "instagram_business_basic,instagram_business_content_publish")
  ok("scope list = basic + content_publish", INSTAGRAM_SCOPES.length === 2 && INSTAGRAM_SCOPES.includes("instagram_business_basic") && INSTAGRAM_SCOPES.includes("instagram_business_content_publish"))
  ok("carries state", url.searchParams.get("state") === "STATE123")
  ok("carries numeric client_id from env (not bullets)", url.searchParams.get("client_id") === "123456789012345")
  ok("client_id is all digits", /^[0-9]+$/.test(url.searchParams.get("client_id") ?? ""))
  ok("carries redirect_uri", url.searchParams.get("redirect_uri") === redirect)

  console.log("token exchanges (mocked Meta responses):")
  nextResponses = [okRes({ access_token: "SHORT", user_id: 123, permissions: ["instagram_business_basic"] })]
  const short = await exchangeCodeForShortToken("CODE", redirect)
  ok("short token parsed", short.access_token === "SHORT" && String(short.user_id) === "123")

  nextResponses = [okRes({ access_token: "LONG", token_type: "bearer", expires_in: 5184000 })]
  const long = await exchangeForLongLivedToken("SHORT")
  ok("long-lived token parsed", long.access_token === "LONG" && long.expires_in === 5184000)

  nextResponses = [okRes({ access_token: "LONG2", expires_in: 5184000 })]
  const refreshed = await refreshLongLivedToken("LONG")
  ok("refresh returns a new token", refreshed.access_token === "LONG2")

  nextResponses = [okRes({ user_id: "123", username: "realestatepro_tx", account_type: "BUSINESS" })]
  const profile = await fetchInstagramProfile("LONG")
  ok("profile parsed (username/account_type)", profile.username === "realestatepro_tx" && profile.account_type === "BUSINESS")

  console.log("error paths (non-2xx throws, no token leak):")
  nextResponses = [errRes(400)]
  await throws("short-token exchange throws on 400", () => exchangeCodeForShortToken("BAD", redirect))
  nextResponses = [errRes(401)]
  await throws("long-lived exchange throws on 401", () => exchangeForLongLivedToken("BAD"))
  nextResponses = [errRes(400)]
  await throws("refresh throws on 400", () => refreshLongLivedToken("BAD"))
  nextResponses = [errRes(400)]
  await throws("profile fetch throws on 400", () => fetchInstagramProfile("BAD"))

  console.log("expiry helper:")
  const iso = expiryFromExpiresIn(5184000)
  ok("expiry ~60 days out from expires_in", new Date(iso).getTime() > Date.now() + 59 * 24 * 60 * 60 * 1000)
  const isoDefault = expiryFromExpiresIn(undefined)
  ok("defaults to ~60 days when absent", new Date(isoDefault).getTime() > Date.now() + 59 * 24 * 60 * 60 * 1000)

  globalThis.fetch = origFetch
  console.log(`\nInstagram connection unit: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
void run()
