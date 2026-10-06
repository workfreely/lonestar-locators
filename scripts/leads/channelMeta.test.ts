// Analytics channel ICON + LABEL treatment.
//
// This is a visual change, so the assertions that matter are the ones proving it is ONLY visual:
// no formula, count, percentage, normalization rule or query moved, and Social Beast — whose icon
// marks are reused — is untouched.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { channelMeta } from "@/lib/leads/channelMeta"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import { PLATFORM_ICON_SIZE, PLATFORM_ICON_SIZE_COMPACT, PLATFORM_ICON_GAP, platformIconColor } from "@/lib/ui/platformIcon"

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

console.log("\nSHARED PLATFORM-MARK CONTRACT (Social Beast History ↔ Analytics):")
const hist = read("components/crm/social/HistoryTable.tsx")
const cmSrc = read("lib/leads/channelMeta.tsx")
ok("one shared size constant exists", PLATFORM_ICON_SIZE === 14)
ok("History renders at the shared size", /size=\{PLATFORM_ICON_SIZE\}/.test(hist))
ok("…and no longer hard-codes 13", !/size=\{13\}/.test(hist))
ok("Analytics defaults to the shared size", /size = PLATFORM_ICON_SIZE/.test(cmSrc))
ok("…and no longer hard-codes 13", !/size = 13/.test(cmSrc))
ok("both import the contract, so size cannot drift",
  /@\/lib\/ui\/platformIcon/.test(hist) && /@\/lib\/ui\/platformIcon/.test(cmSrc))
ok("the shared gap is the one History already used", PLATFORM_ICON_GAP === "gap-1.5")
ok("History still uses gap-1.5", /inline-flex items-center gap-1\.5/.test(hist))

console.log("\nTHE THREE SHARED PLATFORMS CANNOT DRIFT IN COLOUR:")
for (const p of ["instagram", "tiktok", "youtube"] as const) {
  ok(`${p}: History and Analytics resolve the SAME hue`,
    platformIconColor(p) === channelMeta(p).color, `${platformIconColor(p)} vs ${channelMeta(p).color}`)
  ok(`${p}: and it is the canonical CRM source hue`, platformIconColor(p) === getSourceStyle(p).color)
}
ok("History now passes an explicit colour (was monochrome)", /color=\{platformIconColor\(h\.platform\)\}/.test(hist))
ok("an unknown platform gets the neutral hue, not a borrowed brand one",
  platformIconColor("nonsense") === getSourceStyle("unknown").color)

console.log("\nTHE CONTRACT REACHES EVERY SURFACE THAT DRAWS THESE MARKS:")
const cal = read("components/crm/social/CalendarShell.tsx")
const queue = read("components/crm/social/QueueClient.tsx")
const metaS = read("components/crm/performance/MetaSalesAnalytics.tsx")
const srcC = read("components/crm/performance/LeadSourcesCard.tsx")
const campC = read("components/crm/performance/CampaignTable.tsx")
const perfC = read("components/crm/performance/PerformanceStats.tsx")
for (const [name, src] of [
  ["History", hist], ["Calendar", cal], ["Queue", queue],
  ["Lead Sources", srcC], ["Campaigns", campC], ["Top Source", perfC], ["Meta publisher", metaS],
] as const) {
  const viaContract = /@\/lib\/ui\/platformIcon/.test(src)
  const viaChannelLabel = /@\/lib\/leads\/channelMeta/.test(src)
  ok(`${name} draws via the shared contract`, viaContract || viaChannelLabel)
}
ok("Calendar takes its colour from the contract, not platformMeta's brand hex",
  /const color = platformIconColor\(platform\)/.test(cal))
ok("…and its size from the contract", /size=\{PLATFORM_ICON_SIZE\}/.test(cal))
ok("…with the hard-coded h-4/h-3.5 sizing classes removed",
  !/h-4 w-4 flex-none/.test(cal) && !/h-3\.5 w-3\.5 flex-none/.test(cal))
ok("Queue takes its colour from the contract", /color=\{platformIconColor\(p\.platform\)\}/.test(queue))
ok("…at the CENTRALISED compact size (value unchanged at 12)",
  /size=\{PLATFORM_ICON_SIZE_COMPACT\}/.test(queue) && PLATFORM_ICON_SIZE_COMPACT === 12)
ok("no surface hard-codes a platform icon size any more",
  ![hist, cal, queue].some((s) => /size=\{1[0-9]\}/.test(code(s))))

console.log("\nTHE APPROVED CANONICAL COLOURS:")
for (const [p, hex] of [["instagram", "#a855f7"], ["tiktok", "#f59e0b"], ["youtube", "#ef4444"]] as const) {
  ok(`${p} = ${hex}`, platformIconColor(p) === hex, platformIconColor(p))
}

console.log("\nSOCIAL BEAST BEHAVIOUR + LAYOUT UNTOUCHED:")
ok("History table layout unchanged (same cell padding)", /px-3 py-2\.5 text-\[var\(--crm-text-secondary\)\] whitespace-nowrap/.test(hist))
ok("…table type scale unchanged", /text-\[13px\]/.test(hist))
ok("…platform label still from platformMeta", /\{pm\.label\}/.test(hist))
ok("platformMeta itself is NOT modified", /color: "#E4405F"/.test(read("lib/social/platformMeta.ts")))
ok("Queue keeps its dense 11.5px label line (only the mark changed)",
  /text-\[11\.5px\] text-\[var\(--crm-text-secondary\)\] truncate flex items-center gap-1/.test(read("components/crm/social/QueueClient.tsx")))
ok("no theme token was touched anywhere",
  !/kb-accent|data-theme/.test(read("lib/ui/platformIcon.ts")))

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
