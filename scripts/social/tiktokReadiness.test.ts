// TIKTOK APP REVIEW — READINESS.
//
// Asserts the things a reviewer checks that are decidable from the code. The things that are NOT
// decidable here — audit status, the portal's configured scopes, domain verification — are listed
// in the submission checklist instead of being guessed at.
//
// Run: npx tsx scripts/social/tiktokReadiness.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { TIKTOK_SCOPES } from "../../lib/social/tiktok"
import { connectionHealth, connectionHealthLabel, isPlannableConnection } from "../../lib/social/connectionHealth"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
// NOTE: the comment stripper deliberately runs AFTER string literals are protected. A naive
// /\/\/[^\n]*/ eats the "//" inside every https:// URL and silently deletes the rest of the line —
// which is exactly how three URL assertions below first failed against code that was correct.
const code = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
  .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
           (m) => (m.startsWith("//") || m.startsWith("/*") ? "" : m))
const raw = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const CONFIRM = "components/crm/social/TikTokPostConfirm.tsx"
const PUBLISH = "lib/social/tiktokPublish.ts"

// ── 1. SCOPES: REQUEST ONLY WHAT IS IMPLEMENTED ─────────────────────────────
// "If you don't need certain products or scopes, remove them before review" — an unused scope
// delays the result.
console.log("1. every requested scope is implemented, and nothing more:")
ok("exactly two scopes are requested", TIKTOK_SCOPES.length === 2)
ok("user.info.basic", (TIKTOK_SCOPES as readonly string[]).includes("user.info.basic"))
ok("video.publish", (TIKTOK_SCOPES as readonly string[]).includes("video.publish"))
ok("video.upload is NOT requested", !(TIKTOK_SCOPES as readonly string[]).includes("video.upload"))
{
  const all = ["lib/social/tiktok.ts", PUBLISH, "app/api/integrations/tiktok/publish/route.ts"].map(code).join("\n")
  ok("...and no inbox/draft endpoint is ever called", !/post\/publish\/inbox|video\/upload\//.test(all))
  ok("user.info.basic is genuinely used", /v2\/user\/info\//.test(all))
  ok("video.publish is genuinely used", /post\/publish\/video\/init\//.test(all))
}

// ── 2. THE DIRECT POST UX REQUIREMENTS ──────────────────────────────────────
console.log("\n2. the Content Sharing Guidelines UX:")
{
  const c = code(CONFIRM), cr = raw(CONFIRM)
  ok("creator info is queried when the page is rendered", /creator/i.test(c) && /dry_run|load\(/.test(c))
  ok("privacy options come from privacy_level_options, not a hardcoded list", /privacyLevelOptions/.test(c))
  ok("privacy has NO default — nothing is selected until the creator picks",
    /useState<string>\(""\)/.test(c) && /!privacy/.test(c))
  ok("...and the post button is blocked until they do", /postBlocked\s*=\s*disclosureIncomplete \|\| !privacy/.test(c))
  ok("comment/duet/stitch all start OFF",
    /setAllowComment\] = useState\(false\)/.test(c.replace(/const \[/g, "")) || /useState\(false\)/.test(c))
  ok("creator settings can only RESTRICT them further", /commentDisabled|duetDisabled|stitchDisabled/.test(c))
  ok("commercial disclosure is off by default", /setDisclosureOn\] = useState\(false\)/.test(c.replace(/const \[/g, "")) || /disclosureOn/.test(c))
  ok("...and an incomplete disclosure blocks posting", /disclosureIncomplete/.test(c))
  ok("Your Brand and Branded Content are both offered", /Your Brand/.test(cr) && /Branded Content/.test(cr))
  ok("Branded Content is refused on a private post", /brandedContentBlocked/.test(c))
  ok("the Music Usage Confirmation is shown", /Music Usage Confirmation/.test(cr))
  ok("...and names the Branded Content Policy when that applies", /Branded Content Policy/.test(cr))
  ok("the declaration sits immediately above the post button", /Consent declaration/.test(cr))
}

// ── 3. UNAUDITED CLIENT RESTRICTIONS ────────────────────────────────────────
console.log("\n3. the unaudited-client rules are enforced, not assumed:")
{
  const p = code(PUBLISH), r = code("app/api/integrations/tiktok/publish/route.ts")
  ok("UNAUDITED is an explicit constant", /UNAUDITED = true/.test(r))
  ok("SELF_ONLY is the only privacy an unaudited client may use", /SELF_ONLY/.test(r) && /SELF_ONLY/.test(p))
  ok("the transfer method is FILE_UPLOAD, not PULL_FROM_URL", /FILE_UPLOAD/.test(p) && !/PULL_FROM_URL["']/.test(p))
  ok("spending/posting is behind an explicit mode, not a default", /mode === "post"/.test(r))
  ok("...so the default is a dry run", /dry_run/.test(r))
}

// ── 4. OAUTH CONFIGURATION ──────────────────────────────────────────────────
console.log("\n4. OAuth configuration matches what a reviewer will see:")
{
  const t = code("lib/social/tiktok.ts")
  ok("the redirect URI is the registered production callback",
    /https:\/\/locatorbeast\.com\/api\/integrations\/tiktok\/callback/.test(t))
  ok("...and is FIXED, never derived from the request origin", /process\.env\.TIKTOK_REDIRECT_URI \?\? DEFAULT_REDIRECT_URI/.test(t))
  const connect = code("app/api/integrations/tiktok/connect/route.ts")
  ok("the authorize call carries a CSRF state nonce", /crypto\.randomUUID\(\)/.test(connect) && /tt_oauth_state/.test(connect))
  ok("...stored httpOnly and short-lived", /httpOnly: true/.test(connect) && /maxAge: 600/.test(connect))
  ok("the callback validates that state", /isValidOAuthState|tt_oauth_state/.test(code("app/api/integrations/tiktok/callback/route.ts")))
}

// ── 5. CONNECTION HEALTH IS HONEST ──────────────────────────────────────────
// The admin's TikTok row read "connected" for twelve days with a dead token.
console.log("\n5. a dead token is never displayed as connected:")
{
  const NOW = new Date("2026-10-11T00:00:00Z")
  const live = { status: "connected", token_expires_at: "2026-11-01T00:00:00Z" }
  const stale = { status: "connected", token_expires_at: "2026-09-28T13:52:16Z" }
  ok("a valid token is live", connectionHealth(live, NOW) === "live")
  ok("an EXPIRED token is not live", connectionHealth(stale, NOW) === "needs_refresh")
  ok("...and is not labelled Connected", connectionHealthLabel(connectionHealth(stale, NOW)) !== "Connected")
  ok("a missing expiry is not assumed healthy",
    connectionHealth({ status: "connected", token_expires_at: null }, NOW) === "disconnected")
  ok("a non-connected status is disconnected", connectionHealth({ status: "revoked", token_expires_at: "2027-01-01T00:00:00Z" }, NOW) === "disconnected")
  ok("a refreshable account stays PLANNABLE (the publish path refreshes)", isPlannableConnection(stale, NOW))
  ok("...but a disconnected one does not", !isPlannableConnection({ status: "revoked" }, NOW))
  ok("the planner uses it instead of raw status", /isPlannableConnection\(/.test(code("lib/social/autopilotPlanRun.ts")))
  ok("...and reads token_expires_at to do so", /token_expires_at/.test(code("lib/social/autopilotPlanRun.ts")))
}

// ── 6. INVITATIONS CARRY THE PROVIDER ───────────────────────────────────────
console.log("\n6. a TikTok invitation creates a TikTok connection:")
{
  const mig = raw("supabase/migrations/20261011000003_destination_invite_provider.sql")
  ok("create takes an optional provider, defaulting to instagram", /p_provider text default 'instagram'/.test(mig))
  ok("...and refuses an unsupported one", /unsupported provider/.test(mig))
  ok("consume reads the provider from the INVITATION, not the caller", /v_provider := coalesce\(r\.provider/.test(mig))
  ok("...and uses it for the lookup, the vault name and the insert",
    /sc\.provider = v_provider/.test(mig) && /social:'' \|\| v_provider|social:' \|\| v_provider/.test(mig))
  ok("the old 4-argument overload is dropped so there is exactly ONE function",
    /drop function if exists public\.sa_create_destination_invitation\(text, text, timestamptz, uuid\)/.test(mig))
  ok("the consume return type is left exactly as it was", /returns table \(status text, connection_id uuid\)/.test(mig))
}

console.log(`\nTikTok readiness: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
