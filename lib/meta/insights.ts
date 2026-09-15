// Meta read-only ad performance (ads_read). ONE account-level insights call (level=ad,
// time_increment=1) yields BOTH the entity hierarchy (campaign/adset/ad ids+names) AND per-ad daily
// spend/impressions/reach/clicks. Pure parser is unit-tested; the fetch is a thin network layer.
// NO ads_management, NO create/edit — read only.
import { META_GRAPH_BASE } from "@/lib/meta/config"

export type MetaEntity = { level: "campaign" | "adset" | "ad"; externalId: string; name: string | null; status: string | null; parentExternalId: string | null }
export type MetaInsightRow = { entityExternalId: string; campaignExternalId: string | null; date: string; spend: number; impressions: number; reach: number; clicks: number }

// Raw insight row (subset of Graph fields we request).
type RawInsight = {
  campaign_id?: string; campaign_name?: string
  adset_id?: string; adset_name?: string
  ad_id?: string; ad_name?: string
  spend?: string; impressions?: string; reach?: string; clicks?: string
  date_start?: string
}

const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** PURE: turn a level=ad, time_increment=1 insights payload into deduped entities + daily rows. */
export function parseInsights(rows: RawInsight[]): { entities: MetaEntity[]; insights: MetaInsightRow[] } {
  const ent = new Map<string, MetaEntity>()
  const insights: MetaInsightRow[] = []
  for (const r of rows) {
    if (r.campaign_id) ent.set(r.campaign_id, { level: "campaign", externalId: r.campaign_id, name: r.campaign_name ?? null, status: null, parentExternalId: null })
    if (r.adset_id) ent.set(r.adset_id, { level: "adset", externalId: r.adset_id, name: r.adset_name ?? null, status: null, parentExternalId: r.campaign_id ?? null })
    if (r.ad_id) ent.set(r.ad_id, { level: "ad", externalId: r.ad_id, name: r.ad_name ?? null, status: null, parentExternalId: r.adset_id ?? null })
    if (r.ad_id && r.date_start) {
      insights.push({
        entityExternalId: r.ad_id,
        campaignExternalId: r.campaign_id ?? null,
        date: r.date_start,
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        clicks: num(r.clicks),
      })
    }
  }
  return { entities: [...ent.values()], insights }
}

/** ISO date (YYYY-MM-DD) `days` ago (UTC). */
export function isoDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

const FIELDS = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks"

/** Fetch per-ad daily insights for an ad account over [since, until]. Follows paging up to a cap.
 *  Read-only. Throws on a non-OK Meta response (the caller keeps the last-good local cache). */
export async function fetchAccountInsights(token: string, adAccountId: string, since: string, until: string): Promise<RawInsight[]> {
  const rows: RawInsight[] = []
  const params = new URLSearchParams({
    access_token: token,
    level: "ad",
    time_increment: "1",
    fields: FIELDS,
    time_range: JSON.stringify({ since, until }),
    limit: "200",
  })
  let url: string | null = `${META_GRAPH_BASE}/${encodeURIComponent(adAccountId)}/insights?${params.toString()}`
  for (let page = 0; url && page < 25; page++) {
    const res: Response = await fetch(url)
    if (!res.ok) throw new Error(`meta insights failed: ${res.status}`)
    const j = (await res.json()) as { data?: RawInsight[]; paging?: { next?: string } }
    if (j.data?.length) rows.push(...j.data)
    url = j.paging?.next ?? null
  }
  return rows
}
