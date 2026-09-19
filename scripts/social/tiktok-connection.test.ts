// Focused automated tests for the TikTok Login Kit connection foundation (lib/social/tiktok).
// External TikTok HTTP calls are MOCKED — this NEVER contacts TikTok. Phase 1 (connect) only.
// Run: `npx tsx scripts/social/tiktok-connection.test.ts`
//
// Covers: env-config gating, CSRF state validation, authorize-URL scope/params (COMMA scopes),
// the FIXED registered redirect URI, the code→token + refresh + user-info exchanges (success +
// error paths) via a mock fetch, the access-token expiry helper, and the Vault token bundle.

import {
  TIKTOK_SCOPES,
  tiktokConfigured,
  tiktokRedirectUri,
  tiktokAuthorizeUrl,
  isValidOAuthState,
  exchangeCodeForToken,
  refreshTikTokToken,
  fetchTikTokUserInfo,
  expiryFromExpiresIn,
  buildTokenBundle,
  type TikTokTokenResponse,
} from "@/lib/social/tiktok"

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
const errRes = (status: number, body: unknown = { error: "x" }): MockRes => ({ ok: false, status, json: async () => body })

async function run() {
  console.log("env-config gating (Not configured when env missing):")
  delete process.env.TIKTOK_CLIENT_KEY
  delete process.env.TIKTOK_CLIENT_SECRET
  delete process.env.TIKTOK_REDIRECT_URI
  ok("unconfigured when both env vars absent", tiktokConfigured() === false)
  process.env.TIKTOK_CLIENT_KEY = "sbawxyzsandboxkey"
  ok("still unconfigured with only client key", tiktokConfigured() === false)
  process.env.TIKTOK_CLIENT_SECRET = "SANDBOX_SECRET"
  ok("configured when key + secret present", tiktokConfigured() === true)
  process.env.TIKTOK_CLIENT_KEY = "  sbawxyzsandboxkey  "
  ok("whitespace-padded key → configured (trimmed)", tiktokConfigured() === true)
  process.env.TIKTOK_CLIENT_KEY = "sbawxyzsandboxkey"

  console.log("CSRF state validation:")
  ok("equal non-empty states valid", isValidOAuthState("abc", "abc") === true)
  ok("mismatch invalid", isValidOAuthState("abc", "def") === false)
  ok("missing received invalid", isValidOAuthState(null, "abc") === false)
  ok("missing expected invalid", isValidOAuthState("abc", undefined) === false)
  ok("both empty invalid", isValidOAuthState("", "") === false)

  console.log("redirect URI (FIXED registered Sandbox callback):")
  ok("defaults to the registered production callback", tiktokRedirectUri() === "https://locatorbeast.com/api/integrations/tiktok/callback")
  process.env.TIKTOK_REDIRECT_URI = "https://staging.example.com/api/integrations/tiktok/callback"
  ok("honors TIKTOK_REDIRECT_URI override", tiktokRedirectUri() === "https://staging.example.com/api/integrations/tiktok/callback")
  delete process.env.TIKTOK_REDIRECT_URI

  console.log("authorize URL params (per TikTok v2 Login Kit docs):")
  const redirect = tiktokRedirectUri()
  const url = new URL(tiktokAuthorizeUrl(redirect, "STATE123"))
  ok("authorizes on tiktok.com v2 endpoint", url.origin + url.pathname === "https://www.tiktok.com/v2/auth/authorize/")
  ok("response_type=code", url.searchParams.get("response_type") === "code")
  ok("uses client_key (NOT client_id)", url.searchParams.get("client_key") === "sbawxyzsandboxkey" && url.searchParams.get("client_id") === null)
  ok("scope is COMMA-separated basic + video.publish", url.searchParams.get("scope") === "user.info.basic,video.publish")
  ok("scope list = basic + video.publish, no video.upload", TIKTOK_SCOPES.length === 2 && TIKTOK_SCOPES.includes("user.info.basic") && TIKTOK_SCOPES.includes("video.publish") && !(TIKTOK_SCOPES as readonly string[]).includes("video.upload"))
  ok("carries state", url.searchParams.get("state") === "STATE123")
  ok("carries the fixed redirect_uri", url.searchParams.get("redirect_uri") === redirect)

  console.log("token exchange + refresh + user info (mocked TikTok responses):")
  const tokenBody: TikTokTokenResponse = { access_token: "ACCESS", refresh_token: "REFRESH", expires_in: 86400, refresh_expires_in: 31536000, open_id: "OPEN123", scope: "user.info.basic,video.publish", token_type: "Bearer" }
  nextResponses = [okRes(tokenBody)]
  const token = await exchangeCodeForToken("CODE", redirect)
  ok("token parsed (access + refresh + open_id)", token.access_token === "ACCESS" && token.refresh_token === "REFRESH" && token.open_id === "OPEN123")
  ok("access expiry is 24h, refresh expiry is 365d", token.expires_in === 86400 && token.refresh_expires_in === 31536000)

  nextResponses = [okRes({ ...tokenBody, access_token: "ACCESS2", refresh_token: "REFRESH2" })]
  const refreshed = await refreshTikTokToken("REFRESH")
  ok("refresh returns a new token pair", refreshed.access_token === "ACCESS2" && refreshed.refresh_token === "REFRESH2")

  nextResponses = [okRes({ data: { user: { open_id: "OPEN123", display_name: "realestatepro_tx", avatar_url: "https://cdn/x.jpg" } } })]
  const user = await fetchTikTokUserInfo("ACCESS")
  ok("user info parsed (display_name/open_id)", user.display_name === "realestatepro_tx" && user.open_id === "OPEN123")

  console.log("error paths (non-2xx or error body throws, no token leak):")
  nextResponses = [errRes(400, { error: "invalid_grant", error_description: "bad code" })]
  await throws("code exchange throws on 400", () => exchangeCodeForToken("BAD", redirect))
  // A 200 that carries an error object (TikTok can do this) must also throw.
  nextResponses = [okRes({ error: "invalid_request", error_description: "nope" })]
  await throws("code exchange throws on 200+error body", () => exchangeCodeForToken("BAD", redirect))
  nextResponses = [errRes(401)]
  await throws("refresh throws on 401", () => refreshTikTokToken("BAD"))
  nextResponses = [errRes(400)]
  await throws("user info throws on 400", () => fetchTikTokUserInfo("BAD"))

  console.log("expiry helper + Vault token bundle:")
  const iso = expiryFromExpiresIn(86400)
  ok("access expiry ~24h out", new Date(iso).getTime() > Date.now() + 23 * 60 * 60 * 1000 && new Date(iso).getTime() < Date.now() + 25 * 60 * 60 * 1000)
  ok("absent expires_in → now (never a bogus far-future expiry)", new Date(expiryFromExpiresIn(undefined)).getTime() <= Date.now() + 1000)
  const bundle = JSON.parse(buildTokenBundle(tokenBody))
  ok("bundle carries access + refresh token", bundle.access_token === "ACCESS" && bundle.refresh_token === "REFRESH")
  ok("bundle carries refresh_expires_at ~365d out", new Date(bundle.refresh_expires_at).getTime() > Date.now() + 364 * 24 * 60 * 60 * 1000)
  ok("bundle does NOT include open_id or scope (identity lives on the row)", !("open_id" in bundle) && !("scope" in bundle))

  globalThis.fetch = origFetch
  console.log(`\nTikTok connection unit: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}
void run()
