// Meta Ads Phase 1 (Connect) — pure-logic unit tests (no network). Run:
//   npx tsx scripts/meta/connect.test.ts
import { isValidMetaState, metaAuthorizeUrl, META_PHASE1_SCOPES } from "@/lib/meta/config"
import { parseAssets, autoMatch, publicAssets, type MetaAssets } from "@/lib/meta/assets"
import { inMetaAdsBetaAllowlist } from "@/lib/meta/beta"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("OAuth state (CSRF):")
ok("matching non-empty state is valid", isValidMetaState("abc", "abc"))
ok("mismatch is invalid", !isValidMetaState("abc", "xyz"))
ok("empty/missing is invalid", !isValidMetaState("", "x") && !isValidMetaState("x", null) && !isValidMetaState(null, null))

console.log("\nAuthorize URL:")
process.env.META_APP_ID = "123456789012345"
process.env.META_APP_SECRET = "secret"
delete process.env.META_LOGIN_CONFIG_ID
const urlScope = metaAuthorizeUrl("https://locatorbeast.com/api/integrations/meta/callback", "STATE1")
ok("hits the Facebook oauth dialog with client_id + redirect + state", urlScope.startsWith("https://www.facebook.com/") && urlScope.includes("client_id=123456789012345") && urlScope.includes("state=STATE1") && urlScope.includes("redirect_uri="))
ok("falls back to the Phase-1 scope list when no config_id", META_PHASE1_SCOPES.every((s) => decodeURIComponent(urlScope).includes(s)) && !urlScope.includes("config_id"))
ok("Phase-1 scopes are read/connect only (NO ads_management)", !(META_PHASE1_SCOPES as readonly string[]).includes("ads_management") && (META_PHASE1_SCOPES as readonly string[]).includes("ads_read"))
process.env.META_LOGIN_CONFIG_ID = "cfg_987"
const urlCfg = metaAuthorizeUrl("https://locatorbeast.com/api/integrations/meta/callback", "STATE2")
ok("uses config_id (Business Login Configuration) when set, not raw scope", urlCfg.includes("config_id=cfg_987") && !urlCfg.includes("scope="))
delete process.env.META_LOGIN_CONFIG_ID

console.log("\nAsset parsing:")
const raw = {
  businesses: { data: [{ id: "biz1", name: "Real Estate Pro" }] },
  pages: { data: [{ id: "page1", name: "Real Estate Pro TX", access_token: "PAGETOKEN", instagram_business_account: { id: "ig1", username: "realestatepro_tx" } }] },
  adaccounts: { data: [{ id: "act_1234", account_id: "1234", name: "Real Estate Pro Ads" }] },
}
const parsed = parseAssets(raw)
ok("parses page + linked IG (id + username + token)", parsed.pages[0].id === "page1" && parsed.pages[0].instagramId === "ig1" && parsed.pages[0].instagramUsername === "realestatepro_tx" && parsed.pages[0].token === "PAGETOKEN")
ok("parses ad account id/name", parsed.adAccounts[0].id === "act_1234" && parsed.adAccounts[0].name === "Real Estate Pro Ads")
ok("derives act_ prefix from account_id when id missing", parseAssets({ adaccounts: { data: [{ account_id: "9999" }] } }).adAccounts[0].id === "act_9999")

console.log("\nAuto-match (deterministic):")
const single: MetaAssets = { businesses: [{ id: "biz1", name: "B" }], pages: [parsed.pages[0]], adAccounts: [parsed.adAccounts[0]] }
const m1 = autoMatch(single)
ok("exactly one page + one ad account → AUTO connect", m1.status === "auto")
ok("AUTO picks the page, ad account, and the page's IG", m1.status === "auto" && m1.chosen.page?.id === "page1" && m1.chosen.adAccount?.id === "act_1234" && m1.chosen.page?.instagramUsername === "realestatepro_tx")
const multiAd: MetaAssets = { businesses: [], pages: [parsed.pages[0]], adAccounts: [{ id: "act_1", name: "A" }, { id: "act_2", name: "B" }] }
ok("multiple ad accounts → AMBIGUOUS (must ask)", autoMatch(multiAd).status === "ambiguous")
const multiPage: MetaAssets = { businesses: [], pages: [parsed.pages[0], { id: "p2", name: "P2", instagramId: null, instagramUsername: null }], adAccounts: [parsed.adAccounts[0]] }
ok("multiple pages → AMBIGUOUS (must ask)", autoMatch(multiPage).status === "ambiguous")
ok("no ad account → MISSING no_ad_account", (() => { const r = autoMatch({ businesses: [], pages: [parsed.pages[0]], adAccounts: [] }); return r.status === "missing" && r.reason === "no_ad_account" })())
ok("no page → MISSING no_page", (() => { const r = autoMatch({ businesses: [], pages: [], adAccounts: [parsed.adAccounts[0]] }); return r.status === "missing" && r.reason === "no_page" })())
ok("never silently picks among equally-valid assets", autoMatch(multiAd).status !== "auto" && autoMatch(multiPage).status !== "auto")

console.log("\nToken hygiene:")
const pub = publicAssets(single)
ok("publicAssets strips page tokens (never persisted/sent to browser)", pub.pages.every((p) => !("token" in p) || (p as { token?: string }).token === undefined))

console.log("\nBeta allowlist (pure):")
ok("user in env allowlist is allowed", inMetaAdsBetaAllowlist("uid-123", "uid-000, uid-123 ,uid-999"))
ok("user not in allowlist is not (allowlist-only check)", !inMetaAdsBetaAllowlist("uid-abc", "uid-000,uid-999"))
ok("empty allowlist / empty user → not allowed", !inMetaAdsBetaAllowlist("uid-1", "") && !inMetaAdsBetaAllowlist("", "uid-1"))

console.log(`\nMeta connect unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
