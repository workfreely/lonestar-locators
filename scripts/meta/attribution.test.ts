// Meta Ads Phase 2A — attribution capture, ad-link builder, insights parser (pure). Run:
//   npx tsx scripts/meta/attribution.test.ts
import { collectLeadAttribution, normalizeSource } from "@/lib/leads/attribution"
import { buildAdDestinationUrl } from "@/lib/meta/adLink"
import { parseInsights, isoDaysAgo } from "@/lib/meta/insights"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const P = (s: string) => new URLSearchParams(s)

console.log("Source normalization:")
ok("instagram variants → instagram", normalizeSource("Instagram") === "instagram" && normalizeSource("ig") === "instagram")
ok("facebook variants → facebook", normalizeSource("Facebook") === "facebook" && normalizeSource("fb") === "facebook")
ok("tiktok/youtube/google", normalizeSource("TikTok") === "tiktok" && normalizeSource("YouTube") === "youtube" && normalizeSource("google") === "google")
ok("empty → undefined", normalizeSource("") === undefined && normalizeSource(undefined) === undefined)

console.log("\nAttribution capture (Smart Lead Form):")
const paid = collectLeadAttribution(
  P("utm_source=instagram&utm_medium=paid_social&utm_campaign=Spring+SA&utm_content=Reel+A&fbclid=abc123&meta_campaign_id=120001&meta_adset_id=120002&meta_ad_id=120003&meta_campaign_name=Spring+SA&meta_ad_name=Reel+A"),
  "https://locatorbeast.com/realestatepro-tx?utm_source=instagram",
  "https://l.instagram.com/",
)
ok("preserves utm_source/medium/campaign/content", paid.utm_source === "instagram" && paid.utm_medium === "paid_social" && paid.utm_campaign === "Spring SA" && paid.utm_content === "Reel A")
ok("preserves fbclid", paid.fbclid === "abc123")
ok("preserves stable Meta ids", paid.meta_campaign_id === "120001" && paid.meta_adset_id === "120002" && paid.meta_ad_id === "120003")
ok("preserves Meta name snapshots", paid.meta_campaign_name === "Spring SA" && paid.meta_ad_name === "Reel A")
ok("captures landing_page + referrer", !!paid.landing_page && paid.referrer_url === "https://l.instagram.com/")
ok("derives source=instagram from utm_source (overrides default)", paid.source === "instagram")
ok("facebook paid → source=facebook", collectLeadAttribution(P("utm_source=facebook&utm_medium=paid_social"), "x", undefined).source === "facebook")

console.log("\nNo fabricated data:")
const organic = collectLeadAttribution(
  P("utm_source=instagram&meta_campaign_id=%7B%7Bcampaign.id%7D%7D&meta_ad_id=%7B%7Bad.id%7D%7D"),
  "https://locatorbeast.com/realestatepro-tx",
  undefined,
)
ok("un-substituted Meta placeholders ({{...}}) are DROPPED, not stored", organic.meta_campaign_id === undefined && organic.meta_ad_id === undefined)
ok("still keeps the real utm_source", organic.utm_source === "instagram" && organic.source === "instagram")
const empty = collectLeadAttribution(P(""), undefined, undefined)
ok("no params → no fabricated fields (source stays default)", empty.utm_source === undefined && empty.source === undefined && Object.keys(empty).length === 0)

console.log("\nAd-destination URL builder:")
const link = buildAdDestinationUrl("realestatepro-tx", "instagram")
ok("points at the Smart Lead Form slug", link.startsWith("https://locatorbeast.com/realestatepro-tx?"))
ok("carries utm_source=instagram + utm_medium=paid_social", link.includes("utm_source=instagram") && link.includes("utm_medium=paid_social"))
ok("carries Meta stable-id placeholders", link.includes("meta_campaign_id={{campaign.id}}") && link.includes("meta_adset_id={{adset.id}}") && link.includes("meta_ad_id={{ad.id}}"))
ok("facebook variant sets utm_source=facebook", buildAdDestinationUrl("x", "facebook").includes("utm_source=facebook"))

console.log("\nInsights parser (entities + daily rows from one level=ad response):")
const raw = [
  { campaign_id: "120001", campaign_name: "Spring SA", adset_id: "120002", adset_name: "SA Renters", ad_id: "120003", ad_name: "Reel A", spend: "12.50", impressions: "1000", reach: "800", clicks: "40", date_start: "2026-09-14" },
  { campaign_id: "120001", campaign_name: "Spring SA", adset_id: "120002", adset_name: "SA Renters", ad_id: "120003", ad_name: "Reel A", spend: "8.00", impressions: "600", reach: "500", clicks: "25", date_start: "2026-09-15" },
]
const { entities, insights } = parseInsights(raw)
ok("builds deduped campaign/adset/ad entities (3)", entities.length === 3 && entities.some((e) => e.level === "campaign" && e.externalId === "120001") && entities.some((e) => e.level === "ad" && e.parentExternalId === "120002"))
ok("adset parent is the campaign; ad parent is the adset", entities.find((e) => e.level === "adset")?.parentExternalId === "120001" && entities.find((e) => e.level === "ad")?.parentExternalId === "120002")
ok("one daily insight row per ad per day", insights.length === 2 && insights[0].entityExternalId === "120003" && insights[0].campaignExternalId === "120001")
ok("parses numeric spend/impressions/clicks", insights[0].spend === 12.5 && insights[0].impressions === 1000 && insights[0].clicks === 40)
ok("isoDaysAgo returns YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(isoDaysAgo(30)) && /^\d{4}-\d{2}-\d{2}$/.test(isoDaysAgo(0)))

console.log(`\nMeta attribution unit: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
