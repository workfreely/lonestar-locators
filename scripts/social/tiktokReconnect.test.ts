// RECONNECT IS ALWAYS AVAILABLE — and re-authorizing never costs you the connection.
//
// The button used to render only once the access token had expired, so on a healthy connection the
// only visible control was Disconnect: the one action that throws the connection away. Making
// Reconnect always available is a one-line UI change; what needs pinning is the promise it makes.
//
// THE PROMISE: clicking Reconnect opens the existing OAuth flow WITHOUT disconnecting first, and if
// authorization is cancelled or fails for any reason, the existing row — its id, its account, its
// working tokens — is left exactly as it was. That is not a UI property, so it is asserted where it
// actually lives: in the connect route (which only sets a state cookie and redirects), in the
// callback (which returns on every failure path BEFORE the write), and in the SQL (which upserts
// the same account onto the same row rather than inserting a second one).
//
// This suite reads source and NEVER contacts TikTok or the database.
// Run: npx tsx scripts/social/tiktokReconnect.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { TIKTOK_SCOPES, tiktokAuthorizeUrl, tiktokRedirectUri } from "../../lib/social/tiktok"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
const ui = read("components/crm/social/PublishingDestinations.tsx")
const connect = read("app/api/integrations/tiktok/connect/route.ts")
const callback = read("app/api/integrations/tiktok/callback/route.ts")
const sql = read("supabase/migrations/20260921000000_tiktok_connection.sql")

// ── 1. THE BUTTON ───────────────────────────────────────────────────────────
console.log("1. Reconnect shows on a connected card, not only an expired one:")
const ttCard = ui.slice(ui.indexOf("TikTok subsection"), ui.indexOf("Pending Invitations"))
ok("the TikTok card was located", ttCard.length > 500)
ok("Reconnect is NOT gated on expiry any more", !/\{tiktok\.expired && <a href=\{TT_CONNECT\}/.test(ttCard))
ok("Reconnect renders unconditionally, pointing at the connect endpoint",
  /<a href=\{TT_CONNECT\}[^>]*>Reconnect<\/a>/.test(ttCard))
ok("Disconnect is still offered beside it", /onClick=\{\(\) => void tiktokDisconnect\(\)\}>Disconnect<\/button>/.test(ttCard))
ok("the Connected / Reconnect-needed STATUS is still driven by expiry (unchanged)",
  /tiktok\.expired \? \([\s\S]{0,400}?Reconnect needed[\s\S]{0,400}?\) : \([\s\S]{0,300}?Connected/.test(ttCard))
ok("Reconnect does NOT call disconnect first — it is a plain link, not a handler",
  !/Reconnect<\/a>/.test(ttCard.replace(/<a href=\{TT_CONNECT\}[^>]*>Reconnect<\/a>/, "")) 
  && !/tiktokDisconnect[\s\S]{0,120}TT_CONNECT/.test(ttCard))
ok("the button explains that nothing is disconnected", /title="Re-authorize this TikTok account\. Nothing is disconnected/.test(ttCard))
ok("the 'Connect TikTok directly' link is still only for the no-connection case",
  /\{tiktokConfigured && !tiktok && \([\s\S]{0,300}?Connect TikTok directly/.test(ui))

// ── 2. STARTING THE FLOW CHANGES NOTHING ────────────────────────────────────
console.log("\n2. the connect route only starts OAuth — it cannot disconnect or write:")
ok("it writes no database row", !/\.rpc\(|\.from\(|insert|update|delete/i.test(connect))
ok("it never calls the disconnect RPC or route", !/disconnect/i.test(connect))
ok("it only sets the single-use state cookie and redirects",
  /jar\.set\("tt_oauth_state", state/.test(connect) && /NextResponse\.redirect\(authorizeUrl\)/.test(connect))
ok("it is platform-admin gated", /requirePlatformAdmin\(\)/.test(connect))

// ── 3. EVERY FAILURE PATH RETURNS BEFORE THE WRITE ──────────────────────────
console.log("\n3. a cancelled or failed authorization leaves the row untouched:")
{
  const writeAt = callback.indexOf('supabase.rpc("sa_connect_tiktok"')
  ok("the callback has exactly one write", writeAt > 0 && callback.split('supabase.rpc("sa_connect_tiktok"').length === 2)
  const before = callback.slice(0, writeAt)
  for (const [what, needle] of [
    ["the admin guard", "if (!guard.ok) return guard.response"],
    ["TikTok's own ?error (user cancelled)", 'if (err) return NextResponse.redirect(`${accounts}?error=denied`)'],
    ["a missing code or bad CSRF state", "if (!code || !isValidOAuthState(state, expectedState))"],
    ["unconfigured credentials", "if (!tiktokConfigured())"],
  ] as const) ok(`${what} returns before the write`, before.includes(needle))
  ok("the token exchange and user-info fetch also precede it, inside try/catch — a throw redirects with ?error=exchange and writes nothing",
    before.includes("exchangeCodeForToken(code") && before.includes("fetchTikTokUserInfo(") && /catch \{[\s\S]{0,200}error=exchange/.test(callback))
  ok("no disconnect/delete of the connection anywhere in the callback",
    !/sa_disconnect_tiktok|\.delete\(/.test(callback))
}

// ── 4. THE SAME ACCOUNT LANDS ON THE SAME ROW ───────────────────────────────
console.log("\n4. re-authorizing the SAME account upserts in place:")
ok("the conflict target is (owner_user_id, provider, external_account_id)",
  /on conflict \(owner_user_id, provider, external_account_id\) do update/.test(sql))
ok("...so it UPDATES rather than inserting a second row", /do update\s*\n\s*set username/.test(sql))
ok("the update keeps the connection live and swaps in the fresh token",
  /status\s*=\s*'connected'/.test(sql) && /token_secret_id\s*=\s*excluded\.token_secret_id/.test(sql))
{
  const setClause = sql.slice(sql.indexOf("on conflict (owner_user_id, provider, external_account_id) do update"))
    .split(";")[0]
  ok("the upsert's SET clause was located", setClause.includes("set username"))
  // Only these columns may be reassigned. `id` and `owner_user_id` must never appear: the row
  // identity is what callers, schedules and the agent beta hold onto.
  const assigned = [...setClause.matchAll(/(?:^|\bset)\s*(\w+)\s*=/gm)].map((m) => m[1]).filter((c) => c !== "set")
  ok(`the upsert assigns only ${assigned.join(", ")}`,
    assigned.length > 0 && !assigned.includes("id") && !assigned.includes("owner_user_id") && !assigned.includes("external_account_id"))
}
ok("the old Vault secret is only dropped once the new one is stored",
  sql.indexOf("vault.create_secret") < sql.indexOf("delete from vault.secrets"))

// ── 5. SCOPES AND PUBLISHING UNTOUCHED ──────────────────────────────────────
console.log("\n5. scopes and publishing behaviour are unchanged:")
ok("scopes are still exactly user.info.basic + video.publish",
  [...TIKTOK_SCOPES].join(",") === "user.info.basic,video.publish")
ok("video.upload is still NOT requested", !(TIKTOK_SCOPES as readonly string[]).includes("video.upload"))
{
  const url = new URL(tiktokAuthorizeUrl("https://example.test/cb", "nonce"))
  ok("the authorize URL still sends comma-separated scopes", url.searchParams.get("scope") === "user.info.basic,video.publish")
  ok("...and response_type=code with our state", url.searchParams.get("response_type") === "code" && url.searchParams.get("state") === "nonce")
  ok("the redirect URI is still the fixed registered callback", tiktokRedirectUri().endsWith("/api/integrations/tiktok/callback"))
}
ok("the card invokes no publishing endpoint or handler (its only 'publish' is the section's own label)",
  !/\/api\/[^"']*publish|publishPost|startPublish|TikTokPostConfirm/.test(ttCard))
{
  // The connected card is the block between the "no account connected yet" branch and the
  // subsection's trailing "Connect TikTok directly" link (the NOT-connected branch).
  const connectedCard = ttCard.slice(ttCard.indexOf("No TikTok account connected yet"), ttCard.indexOf("{tiktokConfigured && !tiktok &&"))
  ok("the connected card was located", connectedCard.includes("Reconnect") && connectedCard.includes("Disconnect"))
  ok("its only controls are ONE Reconnect and ONE Disconnect",
    (connectedCard.match(/<a href=\{TT_CONNECT\}/g) ?? []).length === 1
    && (connectedCard.match(/<button type="button"/g) ?? []).length === 1)
  ok("the second TT_CONNECT link is the NOT-connected branch, outside the card",
    (ttCard.match(/<a href=\{TT_CONNECT\}/g) ?? []).length === 2 && /\{tiktokConfigured && !tiktok &&[\s\S]{0,300}TT_CONNECT/.test(ttCard))
}

console.log(`\nTikTok reconnect: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
