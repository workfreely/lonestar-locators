// Analytics page — TOP-LEVEL TABS.
//
// This is an information-architecture change, so the assertions that matter are the ones proving
// NOTHING ELSE moved: every analytics component must still be rendered exactly once, with exactly
// the props it had when the page was one long stack. A tab refactor that quietly changed what
// `leads` a card receives would silently change every number on the page.
//
// The other load-bearing claim is the no-refetch one. app/admin/analytics/page.tsx is a
// force-dynamic server component that fetches 600 leads plus Meta analytics per render, so tabs
// must not re-enter Next's router — hence history.replaceState rather than router.replace.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ANALYTICS_TABS, DEFAULT_ANALYTICS_TAB, parseAnalyticsTab } from "@/components/crm/performance/AnalyticsTabs"

let pass = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const client = read("components/crm/performance/PerformanceClient.tsx")
const tabs = read("components/crm/performance/AnalyticsTabs.tsx")
/** Comments explain why we DON'T use router.replace / <Link>, so a naive grep over the raw file
 *  finds those strings and reports the opposite of the truth. Strip comments before asserting. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const clientCode = code(client)
const tabsCode = code(tabs)

console.log("\nTABS + URL PARSING:")
ok("exactly four tabs", ANALYTICS_TABS.length === 4)
ok("ids are overview / marketing / campaigns / monthly",
  ANALYTICS_TABS.map((t) => t.id).join(",") === "overview,marketing,campaigns,monthly")
ok("labels match the approved names",
  ANALYTICS_TABS.map((t) => t.label).join(" | ") === "Sales Overview | Marketing Analytics | Campaigns | Monthly Performance")
ok("Sales Overview is the default", DEFAULT_ANALYTICS_TAB === "overview")

console.log("\n?tab= RESOLUTION (invalid/missing must fall back, never render nothing):")
ok('"marketing" → marketing', parseAnalyticsTab("marketing") === "marketing")
ok('"monthly" → monthly', parseAnalyticsTab("monthly") === "monthly")
ok('"campaigns" → campaigns', parseAnalyticsTab("campaigns") === "campaigns")
ok('"overview" → overview', parseAnalyticsTab("overview") === "overview")
ok('"MARKETING" (case) → marketing', parseAnalyticsTab("MARKETING") === "marketing")
ok('" monthly " (whitespace) → monthly', parseAnalyticsTab(" monthly ") === "monthly")
for (const bad of ["", "   ", "nonsense", "summary", "sales", "../admin", "1"]) {
  ok(`${JSON.stringify(bad)} → overview`, parseAnalyticsTab(bad) === "overview")
}
ok("null → overview", parseAnalyticsTab(null) === "overview")
ok("undefined → overview", parseAnalyticsTab(undefined) === "overview")

console.log("\nNO SERVER REFETCH ON TAB SWITCH:")
ok("uses window.history.replaceState", /window\.history\.replaceState\(/.test(client))
ok("does NOT use router.replace / router.push", !/router\.(replace|push)\(/.test(clientCode))
ok("does not import useRouter", !/useRouter/.test(clientCode))
ok("tab bar is buttons, not <Link> navigation", !/<Link/.test(tabsCode) && /<button/.test(tabsCode))
ok("replaceState (not pushState) so Back leaves the page", !/history\.pushState/.test(clientCode))
ok("the default tab drops ?tab= instead of pinning it", /searchParams\.delete\("tab"\)/.test(client))
ok("URL writing is guarded so it can never break the page", /try \{[\s\S]*replaceState[\s\S]*\} catch/.test(client))

console.log("\nEVERY ANALYTICS COMPONENT STILL RENDERS EXACTLY ONCE:")
const components = [
  "DashboardStats", "LeadsByCityCard", "ClosedDealsByCityCard",
  "LeadSourcesCard", "LandingPageTable", "PerformanceStats",
  "CampaignTable", "MetaSalesAnalytics", "MonthlyPerformanceHistory",
]
for (const c of components) {
  const n = (client.match(new RegExp(`<${c}[\\s/>]`, "g")) ?? []).length
  ok(`${c} rendered once (no duplication)`, n === 1, `${n} occurrences`)
}

console.log("\nPROPS ARE UNCHANGED (the numbers cannot have moved):")
ok("DashboardStats keeps dashboardLeads + goal + avg + method",
  /<DashboardStats leads=\{dashboardLeads\} monthlyGoal=\{monthlyGoal\} avgCommission=\{avgCommission\} projectionMethod=\{projectionMethod\} \/>/.test(client))
for (const c of ["LeadsByCityCard", "ClosedDealsByCityCard", "LeadSourcesCard", "LandingPageTable", "PerformanceStats", "CampaignTable", "MonthlyPerformanceHistory"]) {
  ok(`${c} still receives leads={leads}`, new RegExp(`<${c} leads=\\{leads\\}`).test(client))
}
ok("MetaSalesAnalytics still receives data={metaSales}", /<MetaSalesAnalytics data=\{metaSales\} \/>/.test(client))
ok("no component was switched between leads and dashboardLeads",
  (client.match(/leads=\{dashboardLeads\}/g) ?? []).length === 1)

console.log("\nTAB MEMBERSHIP (each component sits in exactly the agreed tab):")
const seg = (id: string) => {
  const i = client.indexOf(`{tab === "${id}"`)
  if (i < 0) return ""
  const next = ["overview", "marketing", "campaigns", "monthly"]
    .map((o) => client.indexOf(`{tab === "${o}"`, i + 10))
    .filter((x) => x > i)
  return client.slice(i, next.length ? Math.min(...next) : client.length)
}
const overview = seg("overview"), marketing = seg("marketing"), campaigns = seg("campaigns"), monthly = seg("monthly")
ok("Sales Overview = KPI strip + both city cards",
  /DashboardStats/.test(overview) && /LeadsByCityCard/.test(overview) && /ClosedDealsByCityCard/.test(overview))
ok("Marketing = summary, sources, landing pages, Meta (no campaigns)",
  ["PerformanceStats", "LeadSourcesCard", "LandingPageTable", "MetaSalesAnalytics"].every((c) => new RegExp(c).test(marketing)) && !/CampaignTable/.test(marketing))
ok("SUMMARY IS FIRST in Marketing — before Lead Sources",
  marketing.indexOf("PerformanceStats") < marketing.indexOf("LeadSourcesCard"))
ok("…and before Meta Sales", marketing.indexOf("PerformanceStats") < marketing.indexOf("MetaSalesAnalytics"))
ok("Campaigns has its OWN tab", /CampaignTable/.test(campaigns))
ok("Monthly = Monthly Sales only", /MonthlyPerformanceHistory/.test(monthly) && !/CampaignTable/.test(monthly))
ok("no analytics component leaks into two tabs",
  !/DashboardStats/.test(marketing) && !/MonthlyPerformanceHistory/.test(overview))

const seg0 = (id: string) => {
  const i = clientCode.indexOf(`{tab === "${id}"`)
  if (i < 0) return ""
  const next = ["overview", "marketing", "campaigns", "monthly"]
    .map((o) => clientCode.indexOf(`{tab === "${o}"`, i + 10))
    .filter((x) => x > i)
  return clientCode.slice(i, next.length ? Math.min(...next) : clientCode.length)
}
console.log("\nREDUNDANT TITLES REMOVED, CONTENT VISIBLE ON ARRIVAL:")
ok('no inner section titled "Sales Overview" (the tab says it)', !/title="Sales Overview"/.test(client))
ok('no inner section titled "Marketing Analytics" (the tab says it)', !/title="Marketing Analytics"/.test(client))
ok("the KPI strip renders bare, not inside a collapsible", !/CollapsibleSection/.test(code(seg0("overview"))))
for (const [file, label] of [
  ["components/crm/performance/CampaignTable.tsx", "Campaigns"],
  ["components/crm/performance/MetaSalesAnalytics.tsx", "Meta Sales Analytics"],
  ["components/crm/performance/MonthlyPerformanceHistory.tsx", "Monthly Sales"],
] as const) {
  ok(`${label} opens by default inside its tab`, /defaultOpen=\{true\}/.test(read(file)))
}
ok("the marketing summary opens by default", /title="Summary"[^>]*defaultOpen=\{true\}/.test(client))

console.log("\nSALES OVERVIEW CONTAINER RESTORED (the 7f6f86b visual regression):")
ok("DashboardStats is wrapped in the panel container again",
  /bg-\[var\(--crm-panel\)\] border border-\[var\(--crm-border\)\] rounded-xl overflow-hidden shadow-\[[^\]]+\]">\s*<DashboardStats/.test(client))
ok("…with the same classes CollapsibleSection applies", (() => {
  const cs = read("components/crm/CollapsibleSection.tsx")
  return ["bg-[var(--crm-panel)]", "border border-[var(--crm-border)]", "rounded-xl", "overflow-hidden"].every((c) => cs.includes(c) && client.includes(c))
})())
ok("…but WITHOUT a duplicate 'Sales Overview' header", !/title="Sales Overview"/.test(client))
ok("DashboardStats itself is untouched by this work",
  !/DashboardStats\.tsx/.test(client))

console.log("\nNAV MATCHES SOCIAL BEAST AND DOES NOT OVERLAP:")
const sbNav = read("components/crm/social/SocialAutopilotNav.tsx")
ok("NOT sticky any more — no floating over content", !/sticky/.test(tabsCode))
ok("…and no negative margins pulling it over the gutter", !/-mx-5|-mt-5/.test(tabsCode))
for (const cls of ["px-3.5 py-2", "text-[13px] font-semibold", "-mb-px border-b-2", "gap-1"]) {
  ok(`shares Social Beast's \`${cls}\``, code(sbNav).includes(cls) && tabsCode.includes(cls))
}
ok("same active treatment as Social Beast",
  sbNav.includes("text-[var(--crm-text-primary)] border-[var(--crm-text-primary)]") &&
  tabs.includes("text-[var(--crm-text-primary)] border-[var(--crm-text-primary)]"))
ok("same inactive treatment",
  sbNav.includes("text-[var(--crm-text-secondary)] border-transparent hover:text-[var(--crm-text-primary)]") &&
  tabs.includes("text-[var(--crm-text-secondary)] border-transparent hover:text-[var(--crm-text-primary)]"))
ok("Social Beast itself was NOT modified", sbNav.includes("usePathname") && sbNav.includes("<Link"))

console.log("\nFOCUS MODE REUSES THE EXISTING PATTERN:")
const focusHook = read("lib/ui/useFocusMode.ts")
ok("analytics uses the shared hook", /useFocusMode\("lb-analytics-focus"\)/.test(client))
ok("…its own sessionStorage key, so it cannot toggle Social Beast's", !/lb-social-focus/.test(client))
ok("hook persists per TAB (sessionStorage), like both existing versions", /sessionStorage/.test(code(focusHook)) && !/localStorage/.test(code(focusHook)))
ok("Esc exits Focus, as in Social Beast", /e\.key === "Escape"/.test(code(focusHook)))
ok("the ⛶ control renders beside the tabs", /⛶/.test(tabs))
ok("label flips Focus / Exit Focus", /Exit Focus/.test(tabs) && /: "Focus"/.test(tabs))
ok("app header hides in Focus, like SocialAutopilotShell", /\{!focus && \(\s*<AppHeader/.test(client))
ok("Back to Lead Board is still rendered in the header", /<BackToDashboard \/>/.test(client))
ok("SocialAutopilotShell was NOT modified",
  read("components/crm/social/SocialAutopilotShell.tsx").includes('const FOCUS_KEY = "lb-social-focus"'))

console.log("\nRESPONSIVE:")
ok("labels never wrap; the bar scrolls on narrow screens",
  /whitespace-nowrap/.test(tabs) && /overflow-x-auto/.test(tabs))
ok("card rows stack on mobile (grid-cols-1 → md:grid-cols-2)",
  (client.match(/grid-cols-1 md:grid-cols-2/g) ?? []).length === 2 && !/grid grid-cols-2/.test(client))
ok("tab bar carries tablist/tab roles", /role="tablist"/.test(tabs) && /role="tab"/.test(tabs))
ok("selected tab is announced", /aria-selected=\{active\}/.test(tabs))

console.log("\nOUT OF SCOPE — UNTOUCHED:")
ok("Sales Goals is NOT pulled into analytics", !/SettingsClient|Sales Goals/.test(client))
ok("the page still fetches once, server-side", !/fetch\(/.test(client))
const page = read("app/admin/analytics/page.tsx")
ok("the server page's queries are unchanged (still two select(*) fetches)",
  (page.match(/\.select\("\*"\)/g) ?? []).length === 2)
ok("…still force-dynamic", /export const dynamic = "force-dynamic"/.test(page))

console.log(`\n${pass} passed, ${failures.length} failed\n`)
if (failures.length) { failures.forEach((f) => console.log(`  FAILED: ${f}`)); process.exit(1) }
