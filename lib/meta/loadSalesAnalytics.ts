// Server-side loader for Meta Sales Analytics. Reads the workspace's synced Meta
// performance + attributed leads through the RLS-enforced client (same pattern as
// app/admin/analytics/page.tsx::getLeads — no service role, so tenancy is enforced
// by the meta_* / leads SELECT policies), then hands everything to the pure
// buildMetaSalesAnalytics. The attributed leads are passed IN (reusing the page's
// already-scoped, deduped lead set) so we don't re-query or re-dedupe them.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ProjectionMethod } from "@/lib/leads/commissionEstimate"
import {
  buildMetaSalesAnalytics,
  type MetaSalesAnalytics,
  type AttributedLeadInput,
} from "@/lib/meta/salesAnalytics"

export async function loadMetaSalesAnalytics(
  supabase: SupabaseClient,
  allLeads: any[],
  settings: { method: ProjectionMethod; avgCommission: number },
): Promise<MetaSalesAnalytics> {
  // Only leads that actually carry Meta attribution participate.
  const attributed: AttributedLeadInput[] = (allLeads || []).filter(
    (l) => l && (l.meta_ad_id || l.meta_campaign_id),
  )
  const attributedIds = attributed.map((l) => l.id)

  const [entitiesRes, insightsRes, connRes] = await Promise.all([
    supabase.from("meta_ad_entities").select("level, external_id, name, parent_external_id"),
    supabase
      .from("meta_insights_daily")
      .select("entity_external_id, campaign_external_id, spend, impressions, reach, clicks"),
    supabase
      .from("meta_connections")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1),
  ])

  // Milestone events tell us which attributed leads REACHED tour / application
  // (current crm_status can't, since a closed lead no longer reads "applied").
  const tourLeadIds = new Set<string>()
  const applicationLeadIds = new Set<string>()
  if (attributedIds.length > 0) {
    const { data: events } = await supabase
      .from("lead_timeline")
      .select("lead_id, type")
      .in("lead_id", attributedIds)
      .in("type", ["tour_outcome", "application_outcome"])
    for (const e of events || []) {
      if (e.type === "tour_outcome") tourLeadIds.add(String(e.lead_id))
      else if (e.type === "application_outcome") applicationLeadIds.add(String(e.lead_id))
    }
  }

  return buildMetaSalesAnalytics(
    {
      entities: entitiesRes.data || [],
      insights: insightsRes.data || [],
      leads: attributed,
      tourLeadIds,
      applicationLeadIds,
      lastSyncedAt: connRes.data?.[0]?.last_synced_at ?? null,
    },
    settings,
  )
}
