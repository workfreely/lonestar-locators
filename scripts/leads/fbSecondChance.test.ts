// THE ADMIN-ONLY SECOND-CHANCE FORM VARIANT.
//
// It is the SAME form with three different lines. Two failures would matter: another workspace
// reaching it (or attributing to it), and the source collapsing into plain "facebook" — a form
// that looks right and reports wrong, which is worse than one that does not work.
import { normalizeSource, collectLeadAttribution } from "@/lib/leads/attribution"
import { resolveChannel, isMarketingLead } from "@/lib/leads/resolveChannel"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import {
  SHARE_PLATFORMS, SOURCE_SLUG_TO_UTM, utmSourceForSlug,
  slugAllowedForWorkspace, ADMIN_WORKSPACE_ID, buildCleanShareUrl,
  SECOND_CHANCE_SLUGS, ADMIN_ONLY_SLUGS,
} from "@/app/smart-lead-form/_lib/shareConfig"
import { DEFAULT_CONFIG } from "@/app/smart-lead-form/_lib/defaultConfig"
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const OTHER_WS = "a9771377-d857-4d0b-b6f2-76c320e5376a"

console.log("\n1. THE PRIMARY SLUG, AND THE LEGACY ALIAS:")
const scEntry = SHARE_PLATFORMS.find((p) => p.id === "facebook_second_chance")
ok("the PRIMARY slug is second-chance-apts", scEntry?.slug === "second-chance-apts", scEntry?.slug)
ok("the Copy button hands out the primary URL",
  buildCleanShareUrl("jay-morris", scEntry!.slug) === "https://locatorbeast.com/jay-morris/second-chance-apts")
ok("it sits directly below Facebook in the panel order", (() => {
  const i = SHARE_PLATFORMS.findIndex((p) => p.slug === "fb")
  return SHARE_PLATFORMS[i + 1]?.id === "facebook_second_chance"
})())
ok('its panel label is "Facebook — Second Chance"', scEntry?.label === "Facebook — Second Chance")
ok("there is exactly ONE second-chance button, not two",
  SHARE_PLATFORMS.filter((p) => p.utmSource === "facebook_second_chance").length === 1)
ok("the legacy alias is NOT a second button",
  !SHARE_PLATFORMS.some((p) => p.slug === "fb-second-chance"))
ok("…but it still routes", utmSourceForSlug("fb-second-chance") === "facebook_second_chance")
ok("both slugs attribute identically",
  SECOND_CHANCE_SLUGS.every((s) => utmSourceForSlug(s) === "facebook_second_chance"))
ok("both are case-insensitive, like every other slug",
  utmSourceForSlug("Second-Chance-Apts") === "facebook_second_chance" &&
  utmSourceForSlug("FB-Second-Chance") === "facebook_second_chance")

console.log("\n2. THE SOURCE DOES NOT COLLAPSE INTO FACEBOOK:")
ok('normalizeSource("facebook_second_chance") stays distinct',
  normalizeSource("facebook_second_chance") === "facebook_second_chance")
ok("…and plain facebook is untouched", normalizeSource("facebook") === "facebook")
ok("…as is the fb shorthand", normalizeSource("fb") === "facebook")
ok("the hyphenated spelling resolves too", normalizeSource("facebook-second-chance") === "facebook_second_chance")
ok("the second-chance rule runs BEFORE the facebook rule", (() => {
  const src = readFileSync("lib/leads/attribution.ts", "utf8")
  return src.indexOf("second_chance") < src.indexOf('if (s === "fb" || s.includes("facebook"))')
})())
ok("no other source changed", normalizeSource("instagram") === "instagram" && normalizeSource("tiktok") === "tiktok")

console.log("\n3. THE CRM LABEL:")
ok('it displays as "FB 2nd Chance"', getSourceStyle("facebook_second_chance").label === "FB 2nd Chance")
ok('Facebook still displays as "Facebook"', getSourceStyle("facebook").label === "Facebook")
ok("they are visually distinguishable", getSourceStyle("facebook_second_chance").color !== getSourceStyle("facebook").color)

console.log("\n4. ADMIN-ONLY, BY WORKSPACE ID — BOTH SLUGS:")
ok("every second-chance slug is restricted — the alias is no weaker than the primary",
  SECOND_CHANCE_SLUGS.every((s) => ADMIN_ONLY_SLUGS.has(s)))
ok("the admin workspace may use both",
  SECOND_CHANCE_SLUGS.every((s) => slugAllowedForWorkspace(s, ADMIN_WORKSPACE_ID)))
ok("another workspace may use NEITHER",
  SECOND_CHANCE_SLUGS.every((s) => !slugAllowedForWorkspace(s, OTHER_WS)))
ok("a null workspace may use NEITHER",
  SECOND_CHANCE_SLUGS.every((s) => !slugAllowedForWorkspace(s, null)))
ok("ordinary slugs stay open to everyone",
  slugAllowedForWorkspace("fb", OTHER_WS) && slugAllowedForWorkspace("ig", null))
ok("the gate is an ID, not a username", (() => {
  const src = readFileSync("app/smart-lead-form/_lib/shareConfig.ts", "utf8")
  return /ADMIN_WORKSPACE_ID = "[0-9a-f-]{36}"/.test(src)
})())

console.log("\n5. UNAUTHORIZED REQUESTS 404 — never a silent ordinary form:")
{
  const pf = readFileSync("app/locator-beast/[username]/_lib/publicForm.tsx", "utf8")
  ok("the public page checks the slug against the RESOLVED workspace",
    /slugAllowedForWorkspace\(sourceSlug, form\.workspace_id\)/.test(pf))
  ok("…and calls notFound(), not a fallback render",
    /slugAllowedForWorkspace\(sourceSlug, form\.workspace_id\)\)\s*\{\s*notFound\(\)/.test(pf))
  const submit = readFileSync("app/api/leads/submit/route.ts", "utf8")
  ok("the submit endpoint refuses the source for another workspace",
    /claimsSecondChance && row\.workspace_id !== ADMIN_WORKSPACE_ID/.test(submit))
  ok("…with a refusal, not a silent downgrade",
    /if \(claimsSecondChance && row\.workspace_id !== ADMIN_WORKSPACE_ID\) \{\s*return NextResponse\.json\([\s\S]{0,160}status: 404/.test(submit))
  ok("…and it compares the RESOLVED workspace row, never the body",
    /ADMIN_WORKSPACE_ID/.test(submit) && !/body\?\.workspace_id|body\.workspaceId/.test(submit))
}

console.log("\n5b. THE GUARD COVERS EVERY FIELD THAT REACHES THE BADGE:")
{
  const submit = readFileSync("app/api/leads/submit/route.ts", "utf8")
  ok("both utm_source AND source are checked — either one alone sets the badge",
    /\["utm_source", "source"\]\.some\(/.test(submit))
  // The derived `source` is what LeadSourceBadge actually renders, so it is the field that
  // matters most; a guard on utm_source alone would be decorative.
  const attr = collectLeadAttribution(
    new URLSearchParams(""), "https://locatorbeast.com/jay-morris/fb-second-chance", "",
    "facebook_second_chance")
  ok("the branded path derives source=facebook_second_chance (what the badge reads)",
    attr.source === "facebook_second_chance", JSON.stringify(attr.source))
  ok("…and carries it as utm_source too", attr.utm_source === "facebook_second_chance")
  ok("an explicit ?utm_source still wins, as it does for every other slug", (() => {
    const a = collectLeadAttribution(new URLSearchParams("utm_source=google"), "https://x/y", "", "facebook_second_chance")
    return a.source === "google"
  })())
}

console.log("\n5c. CHANNEL REPORTING STILL COUNTS IT AS FACEBOOK:")
// SOURCE and CHANNEL are different axes. The badge must distinguish the two Facebook groups;
// channel reporting must NOT, or a real Facebook lead goes missing from Facebook's totals.
ok("a second-chance lead resolves to the facebook CHANNEL, not unknown",
  resolveChannel({ utm_source: "facebook_second_chance", source: "facebook_second_chance" }) === "facebook",
  resolveChannel({ utm_source: "facebook_second_chance", source: "facebook_second_chance" }))
ok("…from the source column alone", resolveChannel({ source: "facebook_second_chance" }) === "facebook")
ok("…and from a landing URL carrying it", resolveChannel({
  landing_page: "https://locatorbeast.com/jay-morris?utm_source=facebook_second_chance" }) === "facebook")
ok("it counts as marketing acquisition", isMarketingLead({ utm_source: "facebook_second_chance" }))
ok("plain Facebook is unaffected", resolveChannel({ utm_source: "facebook" }) === "facebook")
ok("no other channel shifted", (() => {
  const cases: Array<[Record<string, string>, string]> = [
    [{ utm_source: "instagram" }, "instagram"], [{ utm_source: "tiktok" }, "tiktok"],
    [{ source: "Lone Star Website" }, "website"], [{ source: "Manual Test" }, "manual"],
    [{ source: "smart_lead_form" }, "unknown"], [{}, "unknown"],
  ]
  return cases.every(([lead, want]) => resolveChannel(lead) === want)
})())
ok("a genuinely unknown value is still unknown — the alias is one entry, not a catch-all",
  resolveChannel({ utm_source: "pinterest_whatever" }) === "unknown")

console.log("\n6. ONLY THREE LINES DIFFER; THE REGULAR FORM IS UNTOUCHED:")
{
  const pf = readFileSync("app/locator-beast/[username]/_lib/publicForm.tsx", "utf8")
  ok("headline", /headline: "Stop Wasting Time Searching for Apartments"/.test(pf))
  ok("subheadline", /subheadline: "Find 2nd Chance Apartments That Work for You"/.test(pf))
  ok("supporting line", /supportingLine: "Bad Credit \\u2022 No Credit \\u2022 Broken Lease"/.test(pf))
  ok("the override is spread over the agent's saved copy, not instead of it",
    /\.\.\.saved\.copy,[\s\S]{0,600}SECOND_CHANCE_COPY\[sourceSlug\]/.test(pf))
  ok("nothing else is overridden", (() => {
    const m = /const SECOND_CHANCE_LINES = \{[\s\S]*?\n\}/.exec(pf)?.[0] ?? ""
    const keys = [...m.matchAll(/^\s{2}(\w+):/gm)].map((x) => x[1])
    return keys.length === 3 && keys.every((k) => ["headline", "subheadline", "supportingLine"].includes(k))
  })())
  ok("the copy table is BUILT from the slug list, so the alias cannot drift from the primary",
    /SECOND_CHANCE_SLUGS\.map\(\(slug\) => \[slug, SECOND_CHANCE_LINES\]\)/.test(pf))
}
ok("the default supportingLine is empty, so every other form renders identically",
  DEFAULT_CONFIG.copy.supportingLine === "")
ok("highlights are untouched in the default",
  JSON.stringify(DEFAULT_CONFIG.copy.highlights) === JSON.stringify(["Free Service", "Cash Rebate", "Free Movers"]))

console.log("\n7. THE HERO RENDERS IT ONLY WHEN PRESENT:")
{
  const hero = readFileSync("app/smart-lead-form/_components/form/sections/Hero.tsx", "utf8")
  ok("an empty supporting line emits NO element", /\(supportingLine \?\? ""\)\.trim\(\) \? \(/.test(hero))
  ok("…so a form without one keeps its exact spacing", /: null/.test(hero))
  ok("it sits between the subheadline and the highlights",
    hero.indexOf("{subheadlineNode}") < hero.indexOf("{supportingNode}") &&
    hero.indexOf("{supportingNode}") < hero.indexOf("{highlightsNode}"))
  ok("it renders in BOTH photo-position modes", (hero.match(/\{supportingNode\}/g) ?? []).length === 2)
  ok("it is visually smaller than the subheadline", (() => {
    const sub = /subheadlineNode = \([\s\S]{0,200}?text-\[(\d+(?:\.\d+)?)px\]/.exec(hero)?.[1]
    const sup = /supportingNode = \([\s\S]{0,300}?text-\[(\d+(?:\.\d+)?)px\]/.exec(hero)?.[1]
    return !!sub && !!sup && parseFloat(sup) < parseFloat(sub)
  })())
}

console.log("\n7b. THE SHARE BUTTON ACTUALLY REACHES THE ADMIN — the bug that hid it:")
{
  const edRaw = readFileSync("app/smart-lead-form/_components/editor/SmartLeadFormEditor.tsx", "utf8")
  // Comments stripped: the fix is DESCRIBED in a comment that names the old expression, and an
  // assertion that cannot tell code from prose would pass on a file that still has the bug.
  const ed = edRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  // get_current_workspace() returns (slug, service_areas, primary_market) — NO id. Reading the
  // id off that row left workspaceId null, so SharePanel filtered the entry out for EVERY account.
  ok("the editor does NOT read an id off get_current_workspace()'s row",
    !/wsRow\?\.id/.test(ed))
  ok("(and the stripper works — the comment that names it is still in the raw file)",
    /wsRow\?\.id/.test(edRaw) && !/wsRow\?\.id/.test(ed))
  ok("it resolves the id from the workspaces table instead",
    /from\("workspaces"\)[\s\S]{0,80}\.select\("id"\)/.test(ed))
  ok("…keyed on the SAME slug the share links are built from",
    /\.eq\("slug", wsRow\.slug\)/.test(ed))
  ok("…and it still fails closed when there is no slug", /if \(wsRow\?\.slug\)/.test(ed))
  const rpc = readFileSync("supabase/migrations/20260828000000_primary_market.sql", "utf8")
  ok("PROOF the RPC really has no id column (the root cause, pinned)",
    /returns table \(slug text, service_areas text\[\], primary_market text\)/.test(rpc))
  const sp = readFileSync("app/smart-lead-form/_components/editor/panels/SharePanel.tsx", "utf8")
  ok("SharePanel still filters by workspace — the affordance stays gated",
    /slugAllowedForWorkspace\(p\.slug, workspaceId\)/.test(sp))
}

console.log("\n8. EXISTING SHARE LINKS ARE UNCHANGED:")
for (const [slug, utm] of [["fb", "facebook"], ["ig", "instagram"], ["tt", "tiktok"], ["yt", "youtube"], ["google", "google"], ["email", "email"], ["qr", "qr"], ["direct", "direct"]] as const) {
  ok(`/${slug} still → ${utm}`, SOURCE_SLUG_TO_UTM[slug] === utm)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
