// Meta Sales Analytics aggregation — join, rollup, frozen commission, safe ROAS,
// publisher-platform breakdown. Run: npx tsx scripts/meta/metaSalesAnalytics.test.ts
import { buildMetaSalesAnalytics } from "@/lib/meta/salesAnalytics"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

// Hierarchy: campaign C1 → adset S1 → ads A1, A2.
const entities = [
  { level: "campaign", external_id: "C1", name: "Dallas Apartments September", parent_external_id: null },
  { level: "adset", external_id: "S1", name: "Dallas Movers", parent_external_id: "C1" },
  { level: "ad", external_id: "A1", name: "Video 03", parent_external_id: "S1" },
  { level: "ad", external_id: "A2", name: "Carousel 01", parent_external_id: "S1" },
]
// Two days of spend on A1, one on A2.
const insights = [
  { entity_external_id: "A1", campaign_external_id: "C1", spend: 100, impressions: 1000, reach: 800, clicks: 50 },
  { entity_external_id: "A1", campaign_external_id: "C1", spend: 100, impressions: 1000, reach: 700, clicks: 40 },
  { entity_external_id: "A2", campaign_external_id: "C1", spend: 200, impressions: 500, reach: 400, clicks: 20 },
]
// Leads: A1 → 2 leads, 1 closed (frozen 1500) on Instagram; A2 → 1 lead, closed (frozen 2000) on Facebook.
const leads = [
  { id: 1, meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A1", meta_publisher_platform: "ig", crm_status: "closed", closed_estimated_commission: 1500 },
  { id: 2, meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A1", meta_publisher_platform: "ig", crm_status: "searching", closed_estimated_commission: null },
  { id: 3, meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A2", meta_publisher_platform: "fb", crm_status: "closed", closed_estimated_commission: 2000 },
]
const tourLeadIds = new Set(["1", "2"])       // both A1 leads reached a tour
const applicationLeadIds = new Set(["1", "3"]) // one A1 + the A2 lead reached application

const a = buildMetaSalesAnalytics(
  { entities, insights, leads, tourLeadIds, applicationLeadIds, lastSyncedAt: "2026-09-16T05:00:00Z" },
  { method: "avg_commission", avgCommission: 1000 },
)

console.log("Ad-level metrics:")
const A1 = a.ads.find((r) => r.externalId === "A1")!
const A2 = a.ads.find((r) => r.externalId === "A2")!
ok("A1 spend summed across days (200)", A1.spend === 200)
ok("A1 leads = 2", A1.leads === 2)
ok("A1 tours = 2, applications = 1", A1.tours === 2 && A1.applications === 1)
ok("A1 closed = 1, frozen commission = 1500", A1.closed === 1 && A1.estimatedCommission === 1500)
ok("A1 CPL = 200/2 = 100", A1.costPerLead === 100)
ok("A1 ROAS = 1500/200 = 7.5", A1.roas === 7.5)
ok("A2 ROAS = 2000/200 = 10", A2.roas === 10)

console.log("\nRollup to ad set + campaign + overview:")
const S1 = a.adsets.find((r) => r.externalId === "S1")!
const C1 = a.campaigns.find((r) => r.externalId === "C1")!
ok("adset spend = 200+200 = 400", S1.spend === 400)
ok("adset leads = 3, closed = 2", S1.leads === 3 && S1.closed === 2)
ok("adset commission = 1500+2000 = 3500", S1.estimatedCommission === 3500)
ok("campaign mirrors adset totals", C1.spend === 400 && C1.estimatedCommission === 3500)
ok("overview spend 400, leads 3, closed 2, commission 3500", a.overview.spend === 400 && a.overview.leads === 3 && a.overview.closed === 2 && a.overview.estimatedCommission === 3500)
ok("overview ROAS = 3500/400 = 8.75", a.overview.roas === 8.75)

console.log("\nPublisher platform breakdown (lead-side; known labels):")
const ig = a.platforms.find((p) => p.key === "ig")!
const fb = a.platforms.find((p) => p.key === "fb")!
ok("IG: 2 leads, 1 closed, 1500", ig.label === "Instagram" && ig.leads === 2 && ig.closed === 1 && ig.estimatedCommission === 1500)
ok("FB: 1 lead, 1 closed, 2000", fb.label === "Facebook" && fb.leads === 1 && fb.closed === 1 && fb.estimatedCommission === 2000)

console.log("\nSafety: zero spend → ROAS null (never Infinity/NaN), empty input:")
const noSpend = buildMetaSalesAnalytics(
  { entities: [{ level: "ad", external_id: "AX", name: "x", parent_external_id: null }], insights: [], leads: [{ id: 9, meta_campaign_id: null, meta_adset_id: null, meta_ad_id: "AX", meta_publisher_platform: null, crm_status: "closed", closed_estimated_commission: 500 }], tourLeadIds: new Set<string>(), applicationLeadIds: new Set<string>(), lastSyncedAt: null },
  { method: "avg_commission", avgCommission: 1000 },
)
// Spend but zero leads → CPL/CPClose have a zero denominator → null.
const empty0Leads = buildMetaSalesAnalytics(
  { entities: [{ level: "ad", external_id: "AZ", name: "z", parent_external_id: null }], insights: [{ entity_external_id: "AZ", campaign_external_id: null, spend: 300, impressions: 0, reach: 0, clicks: 0 }], leads: [], tourLeadIds: new Set<string>(), applicationLeadIds: new Set<string>(), lastSyncedAt: null },
  { method: "avg_commission", avgCommission: 1000 },
)
ok("closed with no spend → ROAS null (never Infinity)", noSpend.ads.find((r) => r.externalId === "AX")!.roas === null)
ok("no spend but 1 lead → CPL/CPClose = 0 (denominator is leads/closed, not spend)", noSpend.overview.costPerLead === 0 && noSpend.overview.costPerClose === 0)
ok("truly empty (0 leads) → CPL/CPClose null", empty0Leads.overview.costPerLead === null && empty0Leads.overview.costPerClose === null)
ok("null platform → Unknown bucket", noSpend.platforms.some((p) => p.key === "unknown" && p.leads === 1))
const empty = buildMetaSalesAnalytics({ entities: [], insights: [], leads: [], tourLeadIds: new Set<string>(), applicationLeadIds: new Set<string>(), lastSyncedAt: null }, { method: "avg_commission", avgCommission: 1000 })
ok("empty input → zero overview, no rows, ROAS null", empty.overview.leads === 0 && empty.campaigns.length === 0 && empty.overview.roas === null)

console.log("\nLegacy/pre-snapshot close inside Meta rollup falls back to live estimate:")
const legacy = buildMetaSalesAnalytics(
  { entities, insights: [{ entity_external_id: "A1", campaign_external_id: "C1", spend: 100, impressions: 0, reach: 0, clicks: 0 }], leads: [{ id: 5, meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A1", meta_publisher_platform: "ig", crm_status: "closed", closed_estimated_commission: null, desired_rent: null }], tourLeadIds: new Set<string>(), applicationLeadIds: new Set<string>(), lastSyncedAt: null },
  { method: "avg_commission", avgCommission: 1234 },
)
ok("null frozen close → live estimate (1234) in rollup", legacy.ads.find((r) => r.externalId === "A1")!.estimatedCommission === 1234)

console.log(`\nMeta Sales Analytics unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
