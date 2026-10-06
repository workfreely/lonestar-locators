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
