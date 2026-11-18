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
// THE CARD IS NOW A FUNCTION, not a block of JSX inside a platform subsection — the page groups
// accounts by owner and renders each through tiktokCard. The slice follows it; every claim below
// is the one that was here before.
const ttCard = ui.slice(ui.indexOf("── TIKTOK CARD"), ui.indexOf("── A PENDING INVITATION"))
const caps = read("lib/social/accountCapabilities.ts")
ok("the TikTok card was located", ttCard.length > 500)
ok("Reconnect is NOT gated on expiry any more", !/\{tiktok\.expired && <a href=\{TT_CONNECT\}/.test(ttCard))
// ── THE RESTATED CLAIM, AND WHY IT IS THE SAME ONE ──────────────────────────
// The original hazard was that on a healthy connection the only visible control was Disconnect.
// Reconnect is now the PRIMARY action when the sign-in has expired and sits in Advanced otherwise
// — but so does Disconnect, and Reconnect comes first. The thing being prevented is unchanged:
// the destructive action is never easier to reach than the repair.
ok("Reconnect is always reachable, pointing at the connect endpoint",
  /state === "reconnect_needed" && <a href=\{TT_CONNECT\}/.test(ttCard)
    && /state !== "reconnect_needed" && advancedRow\("Re-authorize"/.test(ttCard))
ok("…and is never harder to reach than Disconnect",
  ttCard.indexOf('advancedRow("Re-authorize"') > 0
    && ttCard.indexOf('advancedRow("Re-authorize"') < ttCard.indexOf('advancedRow("Disconnect this account"'))
ok("Disconnect is still offered beside it", /onClick=\{\(\) => tiktokDisconnect\(t\)\}>Disconnect<\/button>/.test(ttCard))
ok("the Connected / Reconnect-needed STATUS is still driven by expiry (unchanged)",
  /connectionStatus\(\{ status: t\.status \?\? "connected", expired: t\.expired \}\)/.test(ttCard)
    && /input\.status === "error" \|\| input\.expired \? "reconnect_needed" : "connected"/.test(caps))
ok("Reconnect does NOT call disconnect first — it is a plain link, not a handler",
  !/tiktokDisconnect[\s\S]{0,120}TT_CONNECT/.test(ttCard)
    && (ttCard.match(/<a href=\{TT_CONNECT\}/g) ?? []).length === (ttCard.match(/TT_CONNECT/g) ?? []).length)
ok("the button explains that nothing is disconnected", /title="Re-authorize this TikTok account\. Nothing is disconnected/.test(ttCard))
// ADDING IS NOT SOMETHING A CARD CAN DO. It used to be a second TT_CONNECT link sitting below the
// list, which is why the old suite counted links to keep the two apart. The add flow is now a
// button that opens the shared sheet, so the separation is structural rather than positional.
ok("no card offers an add control", !/openAdd\(/.test(ttCard))
ok("the add control is no longer gated on having no connections",
  !/\{tiktokConfigured && tiktoks\.length === 0/.test(ui))
ok("…and it states which account to sign in as",
  /Sign in as the account you want to <strong>add<\/strong>/.test(ui))
ok("…and warns that an already-connected account is re-authorized instead",
  /re-authorizes it instead[\s\S]{0,120}access token is\s*\n?\s*replaced/.test(ui))

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
  // THE CONNECTED ROW is now the card function itself — there is no "no account connected yet"
  // branch to slice from, because an owner with no account on a platform gets an empty slot
  // rendered by emptySlot() instead, outside the card entirely.
  //
  // The part that MATTERS is unchanged and is what this asserts: the card holds ONE connect
  // action for THIS account, in two mutually exclusive branches so exactly one ever renders, and
  // every button in it is drawn from the known safe set. Nothing in it connects a DIFFERENT
  // account, publishes, or acts on another row.
  const connectedCard = ttCard
  ok("the connected card was located", connectedCard.includes("Reconnect") && connectedCard.includes("Disconnect"))
  ok("the connect links are mutually exclusive branches, so exactly one renders", (() => {
    const links = connectedCard.match(/<a href=\{TT_CONNECT\}/g) ?? []
    return links.length === 2
      && /state === "reconnect_needed" && <a href=\{TT_CONNECT\}/.test(connectedCard)
      && /state !== "reconnect_needed" && advancedRow\("Re-authorize"/.test(connectedCard)
  })())
  ok("…and its buttons are only the expected per-account controls", (() => {
    const labels = [...connectedCard.matchAll(/>([A-Za-z ]+)<\/button>/g)].map((m) => m[1].trim())
    // Pause/Resume, Change (the relabelled Rename) and Disconnect are the per-account controls.
    // Save/Cancel moved to the shared rename field, rendered outside this card by both platforms.
    const allowed = new Set(["Resume", "Pause", "Change", "Disconnect"])
    return labels.length === 4 && labels.every((l) => allowed.has(l))
  })())
  ok("…exactly one of which is the destructive one",
    (connectedCard.match(/>Disconnect<\/button>/g) ?? []).length === 1)
  // The add flow's own connect link lives in the shared Add Account sheet, outside every card —
  // asserted by where it is, not by counting links in a subsection.
  ok("the add flow's connect link is in the Add sheet, outside every card",
    ui.indexOf('<a href={TT_CONNECT} className={btnPrimary}>Continue to TikTok</a>') > 0
      && !ttCard.includes("Continue to TikTok"))
}

console.log(`\nTikTok reconnect: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
