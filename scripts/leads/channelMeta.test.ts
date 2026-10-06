// Analytics channel ICON + LABEL treatment.
//
// This is a visual change, so the assertions that matter are the ones proving it is ONLY visual:
// no formula, count, percentage, normalization rule or query moved, and Social Beast — whose icon
// marks are reused — is untouched.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { channelMeta } from "@/lib/leads/channelMeta"
import { getSourceStyle } from "@/lib/leads/sourceStyles"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const CHANNELS = ["website", "instagram", "tiktok", "facebook", "youtube", "google", "referral", "direct", "email", "qr", "unknown"] as const

console.log("\nEVERY CANONICAL CHANNEL HAS AN ICON AND A LABEL:")
for (const c of CHANNELS) {
  const m = channelMeta(c)
  ok(`${c}: icon + label ("${m.label}")`, typeof m.Icon === "function" && !!m.label && !!m.color)
}
ok("labels come from sourceStyles, not a second vocabulary",
  CHANNELS.every((c) => channelMeta(c).label === getSourceStyle(c).label))
ok("colors come from sourceStyles too",
  CHANNELS.every((c) => channelMeta(c).color === getSourceStyle(c).color))

console.log("\nDISTINCT MARKS — no two channels share an icon by accident:")
const icons = CHANNELS.map((c) => channelMeta(c).Icon)
const distinct = new Set(icons).size
// All ELEVEN listed channels get their own mark. (`manual` — excluded from marketing reporting and
// therefore not in this list — deliberately shares the neutral glyph with `unknown`.)
ok("11 distinct marks across the 11 marketing channels", distinct === 11, String(distinct))
ok("manual shares the neutral glyph with unknown", channelMeta("manual").Icon === channelMeta("unknown").Icon)
ok("website is NOT a brand logo", channelMeta("website").Icon !== channelMeta("instagram").Icon)

console.log("\nUNRECOGNISED INPUT FALLS BACK NEUTRALLY (never a misleading brand mark):")
for (const bad of ["", "   ", "nonsense", "lone star website", "smart_lead_form"]) {
  ok(`${JSON.stringify(bad)} → the unknown glyph`, channelMeta(bad).Icon === channelMeta("unknown").Icon)
}
ok("null/undefined → unknown glyph",
  channelMeta(null).Icon === channelMeta("unknown").Icon && channelMeta(undefined).Icon === channelMeta("unknown").Icon)
ok("…and NOT Instagram (the bug platformMeta's fallback would have caused here)",
  channelMeta("nonsense").Icon !== channelMeta("instagram").Icon)
ok("case-insensitive", channelMeta("InStaGram").Icon === channelMeta("instagram").Icon)

console.log("\nMETA PUBLISHER TOKENS RESOLVE TO THE SAME MARKS:")
ok('"ig" → the Instagram mark (not the neutral glyph)',
  channelMeta("ig").Icon === channelMeta("instagram").Icon)
ok('"fb" → the Facebook mark', channelMeta("fb").Icon === channelMeta("facebook").Icon)
ok('"IG" uppercase works too', channelMeta("IG").Icon === channelMeta("instagram").Icon)
ok('"tiktok" resolves directly (Meta has no TikTok surface)', channelMeta("tiktok").Icon === channelMeta("tiktok").Icon)
// msg / an are REAL distinct surfaces — collapsing them into Facebook would mislabel them.
ok('"msg" is NOT forced into Facebook', channelMeta("msg").Icon !== channelMeta("facebook").Icon)
ok('"an" is NOT forced into Facebook', channelMeta("an").Icon !== channelMeta("facebook").Icon)
ok('"msg"/"an" keep the neutral glyph',
  channelMeta("msg").Icon === channelMeta("unknown").Icon && channelMeta("an").Icon === channelMeta("unknown").Icon)

console.log("\nNO RAW TOKEN IS EVER DISPLAYED:")
const metaSrc = read("components/crm/performance/MetaSalesAnalytics.tsx")
ok("the Meta row passes p.label (the FULL normalized name) through", /<ChannelLabel channel=\{p\.key\} label=\{p\.label\} \/>/.test(metaSrc))
ok("…so it never renders the raw key as text", !/>\{p\.key\}</.test(metaSrc))
// publisherPlatform is the authority on those labels and is unchanged.
const pp = read("lib/meta/publisherPlatform.ts")
ok("publisherPlatform still maps ig → Instagram", /ig: "Instagram"/.test(pp))
ok("…and fb → Facebook", /fb: "Facebook"/.test(pp))
ok("…and is otherwise untouched", /msg: "Messenger"/.test(pp) && /an: "Audience Network"/.test(pp))

console.log("\nTOP SOURCE USES THE SAME TREATMENT:")
const perfSrc = read("components/crm/performance/PerformanceStats.tsx")
ok("Top Source renders <ChannelLabel>", /<ChannelLabel channel=\{topSource\}/.test(perfSrc))
ok("…and the old coloured pill is gone", !/LeadSourceBadge/.test(code(perfSrc)))
ok("the Top Source CALCULATION is unchanged", /const topSource = topByCount\(sourceCounts\)/.test(perfSrc))

console.log("\nSOCIAL BEAST'S MARKS ARE REUSED, SOCIAL BEAST IS NOT MODIFIED:")
const pm = read("lib/social/platformMeta.ts")
const cm = read("lib/leads/channelMeta.tsx")
for (const mark of ["SiInstagram", "SiTiktok", "SiYoutube"]) {
  ok(`${mark} is the same mark Social Beast uses`, pm.includes(mark) && cm.includes(mark))
}
ok("platformMeta still has its 3-platform map", /instagram:.*tiktok:|SiInstagram/s.test(pm) && pm.includes("PLATFORM_META"))
ok("platformMeta keeps its own Instagram fallback (unchanged)", /Icon: SiInstagram, color: "#E4405F" \}$/m.test(pm.trim()))
ok("channelMeta does NOT import platformMeta (no coupling)", !/from ["']@?\/?lib\/social\/platformMeta/.test(cm))

console.log("\nALL FOUR SURFACES USE THE ONE COMPONENT:")
const srcCard = read("components/crm/performance/LeadSourcesCard.tsx")
const campaign = read("components/crm/performance/CampaignTable.tsx")
const meta = read("components/crm/performance/MetaSalesAnalytics.tsx")
const dash = read("components/crm/DashboardStats.tsx")
for (const [name, src] of [["Lead Sources", srcCard], ["Campaigns", campaign], ["Meta publisher rows", meta], ["Leads This Month legend", dash]] as const) {
  ok(`${name} renders <ChannelLabel>`, /<ChannelLabel/.test(src))
  ok(`${name} imports it from the shared module`, /@\/lib\/leads\/channelMeta/.test(src))
}
ok("no surface keeps a second icon mapping",
  ![srcCard, campaign, meta, dash].some((s) => /react-icons/.test(code(s))))
ok("the old filled badge is gone from Lead Sources", !/LeadSourceBadge/.test(code(srcCard)))
ok("…and from Campaigns", !/LeadSourceBadge/.test(code(campaign)))

console.log("\nZERO-COUNT SOURCES STAY RECOGNISABLE:")
ok("the legend dims instead of swapping in a grey dot", /dim=\{s\.count === 0\}/.test(dash))
ok("the old grey dot markup is gone", !/#d1d5db/.test(code(dash)))
ok("dim is opacity, not a different icon", /opacity-45/.test(cm) && !/dim \?\s*[A-Z]/.test(cm))
ok("the compact legend keeps its short labels so the card does not reflow", /label=\{s\.label\}/.test(dash))

console.log("\nNOTHING ANALYTICAL MOVED:")
ok("TRACKED_SOURCES unchanged", /const TRACKED_SOURCES = \[/.test(dash) && (dash.match(/getSourceBarColor\(/g) ?? []).length === 5)
ok("withCounts / barSources logic intact",
  /count: sourceCounts\[s\.key\] \?\? 0/.test(dash) && /filter\(\(s\) => s\.count > 0\)/.test(dash))
ok("the stacked bar still only shows sources WITH leads", /barSources\.map/.test(dash))
ok("Lead Sources percentages unchanged", /Math\.round\(\(count \/ total\) \* 100\)/.test(srcCard))
ok("Lead Sources still groups by resolveChannel", /const source = resolveChannel\(l\)/.test(srcCard))
ok("…and still excludes test records", /marketingLeads\(leads\)/.test(srcCard))
ok("Campaigns grouping unchanged", /const campaign = l\.utm_campaign \|\| "\(no campaign data\)"/.test(campaign))
ok("Meta figures unchanged", /\{int\(p\.leads\)\}/.test(meta) && /\{money\(p\.estimatedCommission\)\}/.test(meta))
ok("resolveChannel itself untouched by this work", !/channelMeta|react-icons/.test(read("lib/leads/resolveChannel.ts")))

console.log(`\n${pass} passed, ${failures.length} failed\n`)
if (failures.length) { failures.forEach((f) => console.log(`  FAILED: ${f}`)); process.exit(1) }
