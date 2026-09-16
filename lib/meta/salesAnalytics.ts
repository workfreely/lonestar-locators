// Meta Sales Analytics — joins locally-synced Meta ad performance to canonical
// attributed CRM leads, workspace-scoped, and rolls it up into an
// Overview → Campaign → Ad Set → Ad hierarchy focused on SALES outcomes
// (leads → tours → applications → closed → estimated commission → ROAS).
//
// SOURCES (all already workspace-scoped by the caller / RLS):
//   • meta_ad_entities   — the campaign/adset/ad hierarchy (level, parent chain)
//   • meta_insights_daily — per-ad, per-day spend/impressions/reach/clicks
//   • leads               — attributed via meta_ad_id/meta_campaign_id; closed
//                           revenue is the FROZEN closed_estimated_commission
//   • lead_timeline       — tour_outcome / application_outcome milestone events
//
// KEY HONESTY CONSTRAINTS (see the Phase 2A audit):
//   • Spend has NO publisher-platform breakdown in the synced data, so the
//     Facebook/Instagram breakdown is a LEAD-side split (leads/closed/commission),
//     never spend or ROAS.
//   • Estimated Commission is the frozen per-lead snapshot — NOT actual/paid.
//   • ROAS is null when spend is 0 (never Infinity/NaN).
//
// The core builder is pure (deterministic, unit-testable); the loader below does
// the workspace-scoped reads and calls it.

import {
  estimateLeadCommission,
  toFrozenOrEstimate,
  type ProjectionMethod,
} from "@/lib/leads/commissionEstimate"
import { normalizeMetaPublisherPlatform, type PublisherPlatform } from "@/lib/meta/publisherPlatform"

export type MetaEntityInput = {
  level: "campaign" | "adset" | "ad" | string
  external_id: string
  name: string | null
  parent_external_id: string | null
}
export type MetaInsightInput = {
  entity_external_id: string // ad-level
  campaign_external_id: string | null
  spend: number | string | null
  impressions: number | string | null
  reach: number | string | null
  clicks: number | string | null
}
export type AttributedLeadInput = {
  id: number | string
  meta_campaign_id: string | null
  meta_adset_id: string | null
  meta_ad_id: string | null
  meta_ad_name?: string | null
  meta_adset_name?: string | null
  meta_campaign_name?: string | null
  meta_publisher_platform: string | null
  crm_status: string | null
  closed_at?: string | null
  closed_estimated_commission: number | string | null
  desired_rent?: string | null
}

export type MetaSalesMetrics = {
  spend: number
  impressions: number
  reach: number
  clicks: number
  leads: number
  tours: number
  applications: number
  closed: number
  estimatedCommission: number // frozen closed snapshot (est., not actual)
  costPerLead: number | null
  costPerClose: number | null
  roas: number | null // estimatedCommission / spend; null when spend == 0
}
export type MetaSalesRow = MetaSalesMetrics & {
  level: "campaign" | "adset" | "ad"
  externalId: string
  name: string
  parentExternalId: string | null
}
export type MetaPlatformRow = {
  key: string
  label: string
  leads: number
  closed: number
  estimatedCommission: number
}
export type MetaSalesAnalytics = {
  overview: MetaSalesMetrics
  campaigns: MetaSalesRow[]
  adsets: MetaSalesRow[]
  ads: MetaSalesRow[]
  platforms: MetaPlatformRow[]
  lastSyncedAt: string | null
  /** Attributed leads whose Meta ad is unknown in the entity hierarchy (e.g. the
   *  ad was deleted in Meta). Surfaced so their revenue is never silently lost. */
  unattributedLeads: number
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

function emptyMetrics(): MetaSalesMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, clicks: 0,
    leads: 0, tours: 0, applications: 0, closed: 0, estimatedCommission: 0,
    costPerLead: null, costPerClose: null, roas: null,
  }
}

// Fill the derived rate fields once the additive fields are summed.
function withDerived(m: MetaSalesMetrics): MetaSalesMetrics {
  return {
    ...m,
    costPerLead: ratio(m.spend, m.leads),
    costPerClose: ratio(m.spend, m.closed),
    roas: ratio(m.estimatedCommission, m.spend),
  }
}

export function buildMetaSalesAnalytics(
  input: {
    entities: MetaEntityInput[]
    insights: MetaInsightInput[]
    leads: AttributedLeadInput[]
    tourLeadIds: Set<string>
    applicationLeadIds: Set<string>
    lastSyncedAt: string | null
  },
  settings: { method: ProjectionMethod; avgCommission: number },
): MetaSalesAnalytics {
  const { entities, insights, leads, tourLeadIds, applicationLeadIds, lastSyncedAt } = input
  const { method, avgCommission } = settings

  // ── Entity indexes ──────────────────────────────────────────────────────
  const byId = new Map<string, MetaEntityInput>()
  for (const e of entities) byId.set(e.external_id, e)
  const nameOf = (id: string | null) => (id && byId.get(id)?.name) || ""

  // Resolve an ad's adset + campaign external ids by walking the parent chain,
  // falling back to the denormalized campaign id from insights when needed.
  function chainForAd(adId: string, insightCampaignId: string | null): { adsetId: string | null; campaignId: string | null } {
    const ad = byId.get(adId)
    const adsetId = ad?.parent_external_id ?? null
    const adset = adsetId ? byId.get(adsetId) : undefined
    const campaignId = adset?.parent_external_id ?? insightCampaignId ?? null
    return { adsetId, campaignId }
  }

  // ── Ad-level accumulation ────────────────────────────────────────────────
  // Every ad id seen in insights OR referenced by a lead gets a row, so revenue
  // is never dropped just because performance/attribution is one-sided.
  const ads = new Map<string, MetaSalesRow>()
  const adCampaign = new Map<string, string | null>()
  const adAdset = new Map<string, string | null>()

  function ensureAd(adId: string, insightCampaignId: string | null): MetaSalesRow {
    let row = ads.get(adId)
    if (!row) {
      const { adsetId, campaignId } = chainForAd(adId, insightCampaignId)
      adAdset.set(adId, adsetId)
      adCampaign.set(adId, campaignId)
      row = {
        ...emptyMetrics(),
        level: "ad",
        externalId: adId,
        name: nameOf(adId),
        parentExternalId: adsetId,
      }
      ads.set(adId, row)
    }
    return row
  }

  // Spend/impressions/reach/clicks from ad-level dailies.
  for (const i of insights) {
    if (!i.entity_external_id) continue
    const row = ensureAd(i.entity_external_id, i.campaign_external_id)
    row.spend += num(i.spend)
    row.impressions += num(i.impressions)
    row.reach += num(i.reach)
    row.clicks += num(i.clicks)
  }

  // ── Lead outcomes → ad rows + platform breakdown ──────────────────────────
  const platforms = new Map<string, MetaPlatformRow>()
  let unattributedLeads = 0

  for (const lead of leads) {
    const leadKey = String(lead.id)
    const isClosed = lead.crm_status === "closed" || !!lead.closed_at
    const commission = isClosed
      ? toFrozenOrEstimate(lead.closed_estimated_commission, lead, method, avgCommission)
      : 0

    // Publisher-platform breakdown (lead-side only — spend has no platform split).
    const pf: PublisherPlatform = normalizeMetaPublisherPlatform(lead.meta_publisher_platform)
    let pr = platforms.get(pf.key)
    if (!pr) { pr = { key: pf.key, label: pf.label, leads: 0, closed: 0, estimatedCommission: 0 }; platforms.set(pf.key, pr) }
    pr.leads += 1
    if (isClosed) { pr.closed += 1; pr.estimatedCommission += commission }

    // Attribute to the ad row. A lead with a campaign id but no ad id can't sit on
    // an ad; it still counts at campaign level via the campaign fallback below.
    const adId = lead.meta_ad_id
    if (adId) {
      const row = ensureAd(adId, lead.meta_campaign_id)
      if (!row.name && lead.meta_ad_name) row.name = lead.meta_ad_name
      // Ensure campaign linkage even if this ad had no insights and no entity.
      if (adCampaign.get(adId) == null && lead.meta_campaign_id) adCampaign.set(adId, lead.meta_campaign_id)
      row.leads += 1
      if (tourLeadIds.has(leadKey)) row.tours += 1
      if (applicationLeadIds.has(leadKey)) row.applications += 1
      if (isClosed) { row.closed += 1; row.estimatedCommission += commission }
    } else {
      // Campaign-only (or fully unattributed) lead — tracked so its revenue rolls
      // into the campaign/overview totals without inventing an ad row.
      unattributedLeads += 1
      const campId = lead.meta_campaign_id
      if (campId) {
        const key = `__campaign_only__:${campId}`
        const row = ensureAd(key, campId) // synthetic ad bucket under the campaign
        row.name = row.name || "(campaign-level, no ad)"
        adCampaign.set(key, campId)
        adAdset.set(key, null)
        row.parentExternalId = null
        row.leads += 1
        if (tourLeadIds.has(leadKey)) row.tours += 1
        if (applicationLeadIds.has(leadKey)) row.applications += 1
        if (isClosed) { row.closed += 1; row.estimatedCommission += commission }
      }
    }
  }

  // ── Roll up ads → adsets → campaigns ──────────────────────────────────────
  const adsets = new Map<string, MetaSalesRow>()
  const campaigns = new Map<string, MetaSalesRow>()

  function ensureRollup(map: Map<string, MetaSalesRow>, level: "adset" | "campaign", id: string, parent: string | null): MetaSalesRow {
    let row = map.get(id)
    if (!row) {
      row = { ...emptyMetrics(), level, externalId: id, name: nameOf(id) || (level === "campaign" ? "(unknown campaign)" : "(unknown ad set)"), parentExternalId: parent }
      map.set(id, row)
    }
    return row
  }

  function addInto(target: MetaSalesRow, src: MetaSalesRow) {
    target.spend += src.spend
    target.impressions += src.impressions
    target.reach += src.reach
    target.clicks += src.clicks
    target.leads += src.leads
    target.tours += src.tours
    target.applications += src.applications
    target.closed += src.closed
    target.estimatedCommission += src.estimatedCommission
  }

  const overview = emptyMetrics()
  for (const [adId, row] of ads) {
    const adsetId = adAdset.get(adId) ?? null
    const campId = adCampaign.get(adId) ?? (adsetId ? byId.get(adsetId)?.parent_external_id ?? null : null)
    if (campId) {
      const camp = ensureRollup(campaigns, "campaign", campId, null)
      addInto(camp, row)
    }
    if (adsetId) {
      const adset = ensureRollup(adsets, "adset", adsetId, campId)
      addInto(adset, row)
    }
    // overview
    overview.spend += row.spend; overview.impressions += row.impressions
    overview.reach += row.reach; overview.clicks += row.clicks
    overview.leads += row.leads; overview.tours += row.tours
    overview.applications += row.applications; overview.closed += row.closed
    overview.estimatedCommission += row.estimatedCommission
  }

  const finalize = (m: Map<string, MetaSalesRow>) =>
    Array.from(m.values())
      .map((r) => ({ ...withDerived(r), level: r.level, externalId: r.externalId, name: r.name, parentExternalId: r.parentExternalId }))
      .sort((a, b) => b.spend - a.spend || b.estimatedCommission - a.estimatedCommission)

  return {
    overview: withDerived(overview),
    campaigns: finalize(campaigns),
    adsets: finalize(adsets),
    // Hide the synthetic campaign-only buckets from the Ad list (their metrics
    // still rolled up into campaigns/overview above).
    ads: finalize(ads).filter((r) => !r.externalId.startsWith("__campaign_only__:")),
    platforms: Array.from(platforms.values()).sort((a, b) => b.leads - a.leads),
    lastSyncedAt,
    unattributedLeads,
  }
}
