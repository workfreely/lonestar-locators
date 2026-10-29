// FACEBOOK'S PUBLIC SLUG BECOMES /free-search — FOR EVERY LOCATOR, WITHOUT TOUCHING ATTRIBUTION.
//
// "fb" was a channel abbreviation facing renters who never asked for one. "free-search" says what
// the link gives them. The rename is PUBLIC SPELLING ONLY: utmSource stayed "facebook", so
// normalizeSource, the lead's `source`, Sales Analytics, Marketing Analytics, lead-source
// reporting and funnel conversions all see the identical value they saw yesterday. Nothing is
// migrated and no historical lead changes.
//
// Two properties carry the whole change:
//   1. /{agent}/free-search and /{agent}/fb must BOTH attribute to Facebook — for every agent, not
//      just the one whose Share panel was being looked at;
//   2. the rename must live entirely in the share config. If any UI or analytics file had to learn
//      the word "free-search", the channel would have two spellings to keep in step.
//
// Run: npx tsx scripts/leads/facebookFreeSearch.test.ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { collectLeadAttribution, normalizeSource } from "@/lib/leads/attribution"
import {
  SHARE_PLATFORMS, SOURCE_SLUG_TO_UTM, utmSourceForSlug,
  buildCleanShareUrl, buildShareUrl, ADMIN_ONLY_SLUGS,
} from "@/app/smart-lead-form/_lib/shareConfig"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** End-to-end: the branded path a visitor taps → the `source` written on the lead. */
function sourceForSlug(agent: string, slug: string) {
  const utm = utmSourceForSlug(slug)
  if (!utm) return null
  const url = `https://locatorbeast.com/${agent}/${slug}`
  return collectLeadAttribution(new URL(url).searchParams, url, undefined, utm).source
}

// Every workspace that currently has a public slug, so this is multi-agent in fact and not in name.
const AGENTS = ["jay-morris", "sarah-mitchell", "lone-star"]
const fb = SHARE_PLATFORMS.find((p) => p.id === "facebook")!

console.log("1. BOTH URLS ATTRIBUTE TO FACEBOOK — for every agent:")
for (const agent of AGENTS) {
  for (const slug of ["free-search", "fb"]) {
    ok(`/${agent}/${slug} → source "facebook"`, sourceForSlug(agent, slug) === "facebook",
      String(sourceForSlug(agent, slug)))
  }
}
ok("…and the agent slug is never part of the attribution",
  new Set(AGENTS.map((a) => sourceForSlug(a, "free-search"))).size === 1)
ok("a link typed in caps still attributes", utmSourceForSlug("FREE-SEARCH") === "facebook")

console.log("\n2. THE SOURCE IS FACEBOOK, NEVER 'FREE SEARCH':")
ok("the slug resolves to the facebook utm_source", utmSourceForSlug("free-search") === "facebook")
ok("…which normalizes to the canonical facebook", normalizeSource("facebook") === "facebook")
ok("the raw slug is NEVER what gets normalized — that would invent a source",
  normalizeSource("free-search") === "free_search" && sourceForSlug("jay-morris", "free-search") === "facebook")
ok("no lead can be attributed to a 'free_search' source through this path",
  AGENTS.every((a) => sourceForSlug(a, "free-search") !== "free_search"))
ok("second-chance is still a DIFFERENT channel, not collapsed into facebook",
  sourceForSlug("jay-morris", "second-chance-apts") === "facebook_second_chance")

console.log("\n3. THE SHARE PANEL HANDS OUT THE NEW URL, for every agent:")
ok("free-search is the primary Facebook slug", fb.slug === "free-search", fb.slug)
for (const agent of AGENTS) {
  ok(`Copy gives https://locatorbeast.com/${agent}/free-search`,
    buildCleanShareUrl(agent, fb.slug) === `https://locatorbeast.com/${agent}/free-search`)
}
ok("there is still exactly ONE Facebook button, not two",
  SHARE_PLATFORMS.filter((p) => p.utmSource === "facebook").length === 1)
ok("the legacy /fb is NOT a second button", !SHARE_PLATFORMS.some((p) => p.slug === "fb"))
ok("…but it is still routable", SOURCE_SLUG_TO_UTM["fb"] === "facebook")
ok("free-search is available to EVERY workspace, not gated to one",
  !ADMIN_ONLY_SLUGS.has("free-search"))

console.log("\n4. NOTHING ELSE MOVED:")
for (const [id, slug] of [["instagram","ig"],["tiktok","tt"],["youtube","yt"],["google","google"],["email","email"]] as const) {
  ok(`${id} still copies /${slug}`, SHARE_PLATFORMS.find((p) => p.id === id)?.slug === slug)
}
ok("the second-chance primary slug is untouched",
  SHARE_PLATFORMS.find((p) => p.id === "facebook_second_chance")?.slug === "second-chance-apts")
ok("qr and direct still resolve", utmSourceForSlug("qr") === "qr" && utmSourceForSlug("direct") === "direct")
ok("an unissued slug is still refused, so the URL surface stays bounded",
  utmSourceForSlug("facebook") === null && utmSourceForSlug("free_search") === null)

console.log("\n5. NO NEW ATTRIBUTION VALUE EXISTS — so there is nothing to migrate:")
ok("the set of utm_source values is exactly what it was",
  JSON.stringify([...new Set(Object.values(SOURCE_SLUG_TO_UTM))].sort()) ===
  JSON.stringify(["direct","email","facebook","facebook_second_chance","google","instagram","qr","tiktok","youtube"]))
ok("the legacy query-string link still attributes identically",
  (() => { const u = buildShareUrl("jay-morris", "facebook")
    return collectLeadAttribution(new URL(u).searchParams, u, undefined, undefined).source === "facebook" })())
ok("a query-string utm_source still WINS over the path, as it always did",
  (() => { const u = "https://locatorbeast.com/jay-morris/free-search?utm_source=tiktok"
    return collectLeadAttribution(new URL(u).searchParams, u, undefined, "facebook").source === "tiktok" })())

console.log("\n6. THE RENAME LIVES ONLY IN THE SHARE CONFIG:")
const panel = read("app/smart-lead-form/_components/editor/panels/SharePanel.tsx")
const sourceRoute = read("app/locator-beast/[username]/[source]/page.tsx")
const attribution = read("lib/leads/attribution.ts")
ok("the Share panel still copies whatever the config says — no slug logic of its own",
  /buildCleanShareUrl\(username, platform\.slug\)/.test(panel))
ok("…and it has never heard of 'free-search', so the tab cannot have changed shape",
  !/free-?search/i.test(panel))
ok("the public route still resolves the slug through utmSourceForSlug, unchanged",
  /const pathUtmSource = utmSourceForSlug\(source\)/.test(sourceRoute))
ok("…and still 404s an unrecognised slug rather than inventing a source",
  /if \(!pathUtmSource\) \{\s*\n\s*notFound\(\)/.test(sourceRoute))
ok("the attribution layer has no free-search special case",
  !/free-?search/i.test(attribution))
ok("…and still recognises the fb shorthand for historical rows",
  /s === "fb" \|\| s\.includes\("facebook"\)/.test(attribution))

console.log(`\nFacebook free-search: ${pass} passed, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
