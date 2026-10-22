// SMART LEAD FORM — clean branded source links (/{agent-slug}/{source}).
//
// The public URL carries attribution in the PATH instead of a query string. Two properties matter
// more than the cosmetics:
//   1. a branded link and the legacy ?utm_source link must resolve to the SAME canonical source, or
//      reporting silently splits one channel into two;
//   2. a query-string utm_source must still WIN, or every link already live in a bio, an ad or a
//      printed QR code starts attributing differently than it did yesterday.

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { collectLeadAttribution, normalizeSource } from "@/lib/leads/attribution"
import {
  SHARE_PLATFORMS, SOURCE_SLUG_TO_UTM, utmSourceForSlug,
  buildCleanShareUrl, buildShareUrl, publicPageUrl,
} from "@/app/smart-lead-form/_lib/shareConfig"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** What the lead would be attributed to for a given landing URL + optional path source. */
function attribute(url: string, pathUtmSource?: string) {
  const u = new URL(url)
  return collectLeadAttribution(u.searchParams, url, undefined, pathUtmSource)
}
/** End-to-end: the branded path a visitor taps → the `source` written on the lead. */
function sourceForSlug(slug: string) {
  const utm = utmSourceForSlug(slug)
  if (!utm) return null
  return attribute(`https://locatorbeast.com/jay-morris/${slug}`, utm).source
}

console.log("\n1-5. EACH BRANDED LINK RECORDS THE RIGHT SOURCE:")
const EXPECTED: [string, string][] = [
  ["ig", "instagram"],
  ["tt", "tiktok"],
  ["fb", "facebook"],
  ["yt", "youtube"],
  ["google", "google"],
  ["email", "email"],
  ["direct", "direct"],
  ["qr", "qr"],
]
for (const [slug, expected] of EXPECTED) {
  ok(`/jay-morris/${slug} → source "${expected}"`, sourceForSlug(slug) === expected, String(sourceForSlug(slug)))
}

console.log("\n   …and the utm_source is recorded too (not just the collapsed source):")
for (const [slug, expected] of EXPECTED) {
  const a = attribute(`https://locatorbeast.com/jay-morris/${slug}`, utmSourceForSlug(slug)!)
  ok(`/${slug} carries utm_source="${utmSourceForSlug(slug)}"`, a.utm_source === utmSourceForSlug(slug), String(a.utm_source))
  void expected
}

console.log("\n   …and the landing page is captured verbatim (clean, no query string):")
{
  const a = attribute("https://locatorbeast.com/jay-morris/tt", "tiktok")
  ok("landing_page is the clean branded URL", a.landing_page === "https://locatorbeast.com/jay-morris/tt")
  ok("no utm_medium is invented", a.utm_medium === undefined)
  ok("no utm_campaign is invented", a.utm_campaign === undefined)
}

console.log("\n6. EXISTING LONG UTM URLS STILL WORK, UNCHANGED:")
{
  const legacy = "https://locatorbeast.com/jay-morris?utm_source=tiktok&utm_medium=profile&utm_campaign=organic"
  const a = attribute(legacy)
  ok("legacy ?utm_source=tiktok still → tiktok", a.source === "tiktok")
  ok("…utm_medium preserved", a.utm_medium === "profile")
  ok("…utm_campaign preserved", a.utm_campaign === "organic")
  // Both link styles must collapse to ONE canonical channel, or reporting splits.
  ok("branded /tt and legacy ?utm_source=tiktok agree", sourceForSlug("tt") === a.source)
  const ig = attribute("https://locatorbeast.com/jay-morris?utm_source=instagram")
  ok("branded /ig and legacy ?utm_source=instagram agree", sourceForSlug("ig") === ig.source)
}

console.log("\n   THE QUERY STRING STILL WINS over the path (legacy links are never re-attributed):")
{
  // A visitor on a branded path who ALSO carries utm_source (e.g. an ad link built on top of it).
  const a = attribute("https://locatorbeast.com/jay-morris/tt?utm_source=facebook", "tiktok")
  ok("explicit ?utm_source=facebook beats the /tt path", a.source === "facebook", String(a.source))
  ok("…and utm_source records facebook, not tiktok", a.utm_source === "facebook")
  // Meta ad params on a branded path survive intact.
  const b = attribute("https://locatorbeast.com/jay-morris/ig?utm_source=fb&meta_ad_id=123&meta_publisher_platform=ig", "instagram")
  ok("Meta ad ids still captured on a branded path", b.meta_ad_id === "123" && b.meta_publisher_platform === "ig")
  ok("…and the ad's utm_source wins over the path", b.source === "facebook")
}

console.log("\n8. UNKNOWN SOURCE SLUGS NEVER INVENT ATTRIBUTION:")
for (const bad of ["twitter", "xyz", "", "  ", "TT ok", "../admin"]) {
  ok(`utmSourceForSlug(${JSON.stringify(bad)}) === null`, utmSourceForSlug(bad) === null, String(utmSourceForSlug(bad)))
}
ok("null/undefined are null", utmSourceForSlug(null) === null && utmSourceForSlug(undefined) === null)
ok("a slug is case-insensitive (a link typed in caps still attributes)", utmSourceForSlug("TT") === "tiktok")
{
  const route = read("app/locator-beast/[username]/[source]/page.tsx")
  ok("the route 404s on an unknown slug rather than rendering unattributed",
    /if \(!pathUtmSource\)\s*\{\s*notFound\(\)/.test(route))
}

console.log("\n9. THE SHARE PANEL COPIES CLEAN URLS (no utm_* exposed):")
{
  const panel = read("app/smart-lead-form/_components/editor/panels/SharePanel.tsx")
  ok("copy buttons use buildCleanShareUrl", /CopyButton value=\{buildCleanShareUrl\(username, platform\.slug\)\}/.test(panel))
  ok("no copy control builds a UTM URL any more", !/buildShareUrl\(/.test(panel))
  ok("the main Smart Form Link is still the clean base URL", /CopyButton value=\{pageUrl\}/.test(panel))
  ok("the QR encodes the branded /qr link", /QRCode\.toDataURL\(qrUrl,/.test(panel))
  for (const p of SHARE_PLATFORMS) {
    const url = buildCleanShareUrl("jay-morris", p.slug)
    ok(`${p.label} copies ${url}`, url === `https://locatorbeast.com/jay-morris/${p.slug}` && !url.includes("utm_"))
  }
}

console.log("\n   SLUG TABLE IS THE SINGLE SOURCE OF TRUTH:")
ok("every share platform has a slug", SHARE_PLATFORMS.every((p) => !!p.slug))
ok("slugs are unique", new Set(SHARE_PLATFORMS.map((p) => p.slug)).size === SHARE_PLATFORMS.length)
ok("every platform slug is routable", SHARE_PLATFORMS.every((p) => utmSourceForSlug(p.slug) === p.utmSource))
ok("the requested mapping is exactly right",
  SOURCE_SLUG_TO_UTM.ig === "instagram" && SOURCE_SLUG_TO_UTM.tt === "tiktok" &&
  SOURCE_SLUG_TO_UTM.fb === "facebook" && SOURCE_SLUG_TO_UTM.yt === "youtube" &&
  SOURCE_SLUG_TO_UTM.direct === "direct")
// normalizeSource is the pre-existing canonical collapser; the slugs must feed it values it knows,
// not bypass it with a parallel vocabulary.
ok("every slug's utm_source round-trips through the EXISTING normalizeSource",
  Object.values(SOURCE_SLUG_TO_UTM).every((u) => normalizeSource(u) === u),
  Object.values(SOURCE_SLUG_TO_UTM).map((u) => `${u}->${normalizeSource(u)}`).join(" "))

console.log("\n10. SERVED DIRECTLY — NO REDIRECT, NO INTERMEDIATE PAGE:")
{
  const route = read("app/locator-beast/[username]/[source]/page.tsx")
  ok("the source route exists", existsSync(join(process.cwd(), "app/locator-beast/[username]/[source]/page.tsx")))
  // WIDENED when the admin-only second-chance variant added a `sourceSlug` prop. The intent is
  // unchanged and still fully pinned: the route renders PublicFormView itself, carrying BOTH
  // original props, with no redirect or intermediate page. Only additional props are tolerated.
  ok("it renders PublicFormView directly, still passing username and pathUtmSource",
    /<PublicFormView username=\{username\} pathUtmSource=\{pathUtmSource\}[^>]*\/>/.test(route))
  ok("it does NOT redirect", !/\bredirect\(/.test(route) && !/permanentRedirect/.test(route))
  ok("no client-side navigation or timer", !/useEffect|setTimeout|router\.(push|replace)/.test(route))
  ok("it is not a client component", !/"use client"/.test(route))
  // Both routes must render the SAME component, or they can drift apart.
  const base = read("app/locator-beast/[username]/page.tsx")
  ok("the base route renders the same shared view", /<PublicFormView username=\{username\} \/>/.test(base))
  ok("both import it from the shared module", /_lib\/publicForm/.test(base) && /_lib\/publicForm/.test(route))
}

console.log("\n7. UNKNOWN AGENT SLUGS KEEP THE EXISTING 404:")
{
  const shared = read("app/locator-beast/[username]/_lib/publicForm.tsx")
  ok("the shared view still 404s on an unresolved agent", /if \(error \|\| !form\) \{\s*notFound\(\)/.test(shared))
  ok("…via the same lb_resolve_public_form RPC as before", /lb_resolve_public_form/.test(shared))
  ok("published_at is still NOT a gate", !/published_at\s*(===|!==|\?)/.test(shared))
}

console.log("\nUNRELATED BEHAVIOUR UNTOUCHED:")
{
  const fields = read("app/smart-lead-form/_components/form/sections/LeadFormFields.tsx")
  ok("the form still posts to /api/leads/submit", /"\/api\/leads\/submit"/.test(fields))
  ok("attribution still comes from the ONE collector", /collectLeadAttribution\(/.test(fields))
  ok("no second tracking path was introduced", (fields.match(/collectLeadAttribution\(/g) ?? []).length === 1)
  ok("the agent slug format is unchanged", publicPageUrl("jay-morris") === "https://locatorbeast.com/jay-morris")
  ok("the legacy UTM builder still exists for backward compatibility",
    buildShareUrl("jay-morris", "tiktok") === "https://locatorbeast.com/jay-morris?utm_source=tiktok")
}

console.log(`\n${pass} passed, ${failures.length} failed\n`)
if (failures.length) { failures.forEach((f) => console.log(`  FAILED: ${f}`)); process.exit(1) }
