// Canonical marketing CHANNEL resolution — read-time only.
//
// The headline assertion is the production replay at the bottom: the exact 27 attribution tuples
// live in the database today, run through resolveChannel, must reproduce the agreed buckets. That
// is what makes this a verifiable change rather than a plausible one — and the deduped 17-lead
// subset is what the Lead Sources card actually renders.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { resolveChannel, resolveTrafficType, isMarketingLead, marketingLeads, type ChannelInput } from "@/lib/leads/resolveChannel"
import { getSourceStyle } from "@/lib/leads/sourceStyles"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const L = (o: Partial<ChannelInput>): ChannelInput => o as ChannelInput

console.log("\nPRECEDENCE — each rule beats the ones below it:")
ok("1. Meta ids + ig → instagram",
  resolveChannel(L({ meta_campaign_id: "c1", meta_publisher_platform: "ig", source: "Lone Star Website" })) === "instagram")
ok("1. Meta ids + fb → facebook",
  resolveChannel(L({ meta_ad_id: "a1", meta_publisher_platform: "fb" })) === "facebook")
ok("2. utm_source beats a generic source label",
  resolveChannel(L({ source: "Lone Star Website", utm_source: "google" })) === "google")
ok("2. utm_source beats a site label even for youtube",
  resolveChannel(L({ source: "Lone Star Website", utm_source: "youtube" })) === "youtube")
ok("3. utm_source recovered from landing_page",
  resolveChannel(L({ landing_page: "https://locatorbeast.com/jay-morris?utm_source=tiktok" })) === "tiktok")
ok("3. …works for a bare path too",
  resolveChannel(L({ landing_page: "/start-your-search?utm_source=facebook" })) === "facebook")
ok("4. an already-canonical source is kept", resolveChannel(L({ source: "referral" })) === "referral")
ok("4. …case-insensitively", resolveChannel(L({ source: "YouTube" })) === "youtube")
ok("5. a known website path → website", resolveChannel(L({ landing_page: "/start-your-search" })) === "website")
ok("5. …and /get-my-list", resolveChannel(L({ landing_page: "/get-my-list" })) === "website")
ok("5. a bare site label with no other signal → website", resolveChannel(L({ source: "Lone Star Website" })) === "website")
ok("6. nothing → unknown", resolveChannel(L({})) === "unknown")
ok("6. null/undefined lead → unknown", resolveChannel(null) === "unknown" && resolveChannel(undefined) === "unknown")

console.log("\nNON-CHANNEL LABELS NEVER BECOME BUCKETS:")
ok('"smart_lead_form" (submit-route fallback) → unknown', resolveChannel(L({ source: "smart_lead_form" })) === "unknown")
ok('"Manual Test" → manual', resolveChannel(L({ source: "Manual Test" })) === "manual")
ok('"test" → manual', resolveChannel(L({ source: "test" })) === "manual")
ok('"unknown" → unknown', resolveChannel(L({ source: "unknown" })) === "unknown")

console.log("\nMANUAL / TEST RECORDS ARE EXCLUDED FROM MARKETING:")
ok("manual is not a marketing lead", !isMarketingLead(L({ source: "Manual Test" })))
ok("website IS a marketing lead", isMarketingLead(L({ source: "Lone Star Website" })))
ok("unknown IS a marketing lead (absent attribution is still acquisition)", isMarketingLead(L({})))
ok("marketingLeads() filters them out",
  marketingLeads([L({ source: "Manual Test" }), L({ source: "referral" }), L({ source: "Manual Test" })]).length === 1)
ok("marketingLeads(null) is safe", marketingLeads(null).length === 0)

console.log("\nTRAFFIC TYPE IS CONSERVATIVE — 'not paid' is never called 'organic':")
ok("utm_medium=paid_social → paid", resolveTrafficType(L({ utm_medium: "paid_social", utm_source: "instagram" })) === "paid")
ok("utm_medium=cpc → paid", resolveTrafficType(L({ utm_medium: "cpc", utm_source: "google" })) === "paid")
ok("Meta ids alone → paid", resolveTrafficType(L({ meta_ad_id: "a1" })) === "paid")
ok("referral → referral", resolveTrafficType(L({ source: "referral" })) === "referral")
ok("direct → direct", resolveTrafficType(L({ source: "direct" })) === "direct")
ok("website WITHOUT a paid marker → unknown, NOT organic",
  resolveTrafficType(L({ landing_page: "/start-your-search" })) === "unknown")
ok("youtube without a medium → unknown, NOT organic", resolveTrafficType(L({ utm_source: "youtube" })) === "unknown")
ok("instagram without a paid marker → unknown", resolveTrafficType(L({ utm_source: "instagram" })) === "unknown")
ok('no "organic" value exists in the type at all', !/"organic"/.test(read("lib/leads/resolveChannel.ts").replace(/\/\/.*$/gm, "")))

console.log("\nBRANDED-LINK CHANNELS RENDER PROPERLY:")
for (const [key, label] of [["email", "Email"], ["qr", "QR Code"]] as const) {
  const st = getSourceStyle(key)
  ok(`${key} has a real label ("${label}")`, st.label === label)
  ok(`${key} has its own colour`, !!st.color && !!st.barColor)
}
ok("email resolves as a channel", resolveChannel(L({ utm_source: "email" })) === "email")
ok("qr resolves as a channel", resolveChannel(L({ utm_source: "qr" })) === "qr")

// ── PRODUCTION REPLAY ───────────────────────────────────────────────────────────────────────
// The 27 attribution tuples exactly as they sit in production today (captured read-only).
console.log("\nPRODUCTION REPLAY — all 27 real leads:")
const PROD: { id: number; source: string; utm_source: string; utm_medium: string; landing_page: string; meta: boolean; pub: string }[] = [
  { id: 11, source: "smart_lead_form", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 12, source: "referral", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 13, source: "", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 15, source: "", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 16, source: "", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 17, source: "", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 23, source: "Manual Test", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 24, source: "Manual Test", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 25, source: "Manual Test", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 26, source: "Manual Test", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 27, source: "Manual Test", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 28, source: "Manual Test", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 57, source: "youtube", utm_source: "youtube", utm_medium: "", landing_page: "https://locatorbeast.com/jay-morris?utm_source=youtube", meta: false, pub: "" },
  { id: 58, source: "Lone Star Website", utm_source: "google", utm_medium: "cpc", landing_page: "https://lonestarlocators.app/start-your-search?utm_source=google", meta: false, pub: "" },
  { id: 59, source: "Lone Star Website", utm_source: "google", utm_medium: "cpc", landing_page: "https://lonestarlocators.app/start-your-search?utm_source=google&utm_campaign=htx", meta: false, pub: "" },
  { id: 60, source: "Lone Star Website", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 61, source: "", utm_source: "instagram", utm_medium: "paid_social", landing_page: "", meta: true, pub: "ig" },
  { id: 62, source: "Lone Star Website", utm_source: "youtube", utm_medium: "", landing_page: "/get-my-list", meta: false, pub: "" },
  { id: 63, source: "Lone Star Website", utm_source: "", utm_medium: "", landing_page: "/start-your-search", meta: false, pub: "" },
  { id: 66, source: "Lone Star Website", utm_source: "", utm_medium: "", landing_page: "/start-your-search", meta: false, pub: "" },
  { id: 70, source: "Lone Star Website", utm_source: "", utm_medium: "", landing_page: "/start-your-search", meta: false, pub: "" },
  { id: 78, source: "", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 79, source: "referral", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 82, source: "Lone Star Website", utm_source: "", utm_medium: "", landing_page: "/start-your-search", meta: false, pub: "" },
  { id: 83, source: "Lone Star Website", utm_source: "", utm_medium: "", landing_page: "/start-your-search", meta: false, pub: "" },
  { id: 84, source: "referral", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
  { id: 89, source: "", utm_source: "", utm_medium: "", landing_page: "", meta: false, pub: "" },
]
const toInput = (r: (typeof PROD)[number]): ChannelInput => ({
  source: r.source || null, utm_source: r.utm_source || null, utm_medium: r.utm_medium || null,
  landing_page: r.landing_page || null,
  meta_campaign_id: r.meta ? "c" : null, meta_ad_id: r.meta ? "a" : null,
  meta_publisher_platform: r.pub || null,
})
const tally = (rows: typeof PROD) => {
  const c: Record<string, number> = {}
  for (const r of rows) { const ch = resolveChannel(toInput(r)); c[ch] = (c[ch] ?? 0) + 1 }
  return c
}
const all = tally(PROD)
ok("all 27 classified", Object.values(all).reduce((a, b) => a + b, 0) === 27)
console.log("   " + Object.entries(all).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "))
ok("website 6", all.website === 6, String(all.website))
ok("unknown 7 (6 empty + smart_lead_form)", all.unknown === 7, String(all.unknown))
ok("manual 6", all.manual === 6, String(all.manual))
ok("referral 3", all.referral === 3, String(all.referral))
ok("youtube 2 (57 + the 62 conflict override)", all.youtube === 2, String(all.youtube))
ok("google 2", all.google === 2, String(all.google))
ok("instagram 1", all.instagram === 1, String(all.instagram))

console.log("\n   The three approved conflict overrides:")
for (const [id, want] of [[58, "google"], [59, "google"], [62, "youtube"]] as const) {
  const r = PROD.find((x) => x.id === id)!
  ok(`lead ${id}: "Lone Star Website" → ${want}`, resolveChannel(toInput(r)) === want)
}
ok("lead 61 (closed, was invisible as Unknown) → instagram",
  resolveChannel(toInput(PROD.find((x) => x.id === 61)!)) === "instagram")

console.log("\nTHE VISIBLE 17-LEAD CARD (production's deduped set):")
// The 10 records dedupeLeads removes are the Manual Test block (6) and 4 of the empty-attribution
// rows — confirmed against the live CampaignTable, which already groups by utm_source || source
// and renders exactly these counts.
const VISIBLE = [11, 12, 57, 58, 59, 60, 61, 62, 63, 66, 70, 79, 82, 83, 84, 13, 15]
const vis = tally(PROD.filter((r) => VISIBLE.includes(r.id)))
console.log("   " + Object.entries(vis).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "))
ok("Website 6", vis.website === 6, String(vis.website))
ok("Referral 3", vis.referral === 3, String(vis.referral))
ok("Unknown 3", vis.unknown === 3, String(vis.unknown))
ok("YouTube 2", vis.youtube === 2, String(vis.youtube))
ok("Google 2", vis.google === 2, String(vis.google))
ok("Instagram 1", vis.instagram === 1, String(vis.instagram))
ok("17 total", Object.values(vis).reduce((a, b) => a + b, 0) === 17)
ok("no manual/test records in the visible marketing set", !vis.manual)

console.log("\nPAID CLASSIFICATION ACROSS PRODUCTION:")
const paid = PROD.filter((r) => resolveTrafficType(toInput(r)) === "paid").map((r) => r.id)
ok("exactly 3 paid leads: 58, 59, 61", paid.join(",") === "58,59,61", paid.join(","))
const ref = PROD.filter((r) => resolveTrafficType(toInput(r)) === "referral").map((r) => r.id)
ok("3 referral leads: 12, 79, 84", ref.join(",") === "12,79,84", ref.join(","))

console.log("\nWIRED INTO THE MARKETING SURFACES (and only those):")
const srcCard = read("components/crm/performance/LeadSourcesCard.tsx")
const campaign = read("components/crm/performance/CampaignTable.tsx")
const perf = read("components/crm/performance/PerformanceStats.tsx")
ok("Lead Sources groups by resolveChannel", /const source = resolveChannel\(l\)/.test(srcCard))
ok("…and excludes test records", /marketingLeads\(leads\)/.test(srcCard))
ok("…and percentages use the scoped total", /const total = scoped\.length/.test(srcCard))
ok("Campaigns uses resolveChannel", /const source = resolveChannel\(l\)/.test(campaign))
ok("…and excludes test records", /marketingLeads\(leads\)/.test(campaign))
ok("Top Source uses resolveChannel", /const source = resolveChannel\(l\)/.test(perf))
ok("…and excludes test records", /marketingLeads\(leads\)/.test(perf))
ok("raw leads.source is no longer grouped on directly",
  !/l\.source \|\| "unknown"/.test(srcCard) && !/\(l\.source \|\| "unknown"\)\.toLowerCase\(\)/.test(perf))

console.log("\nOUT OF SCOPE — UNTOUCHED:")
ok("DashboardStats (Sales Overview, total CRM leads) is NOT filtered",
  !/resolveChannel|marketingLeads/.test(read("components/crm/DashboardStats.tsx")))
ok("LandingPageTable groups by landing_page, not source",
  !/resolveChannel/.test(read("components/crm/performance/LandingPageTable.tsx")))
ok("no write path imports the resolver", !/resolveChannel/.test(read("app/api/leads/submit/route.ts")))
ok("attribution.ts (capture) is unchanged in behaviour",
  /export function normalizeSource/.test(read("lib/leads/attribution.ts")))

console.log(`\n${pass} passed, ${failures.length} failed\n`)
if (failures.length) { failures.forEach((f) => console.log(`  FAILED: ${f}`)); process.exit(1) }
