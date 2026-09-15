// Meta ad performance sync — server-side only. Decrypts the workspace's user token (service-role
// meta_get_token), fetches read-only insights, and upserts the local cache (idempotent). Never
// throws into the caller's happy path with partial writes: upserts are keyed on unique constraints,
// so a re-run cleanly overwrites. Read-only (ads_read); no ads management.
import { supabaseAdmin } from "@/lib/supabase/admin"
import { fetchAccountInsights, parseInsights, isoDaysAgo } from "@/lib/meta/insights"

export type SyncResult = { entities: number; insights: number }

/** Sync one workspace's connected ad account into meta_ad_entities + meta_insights_daily. `days` is
 *  the rolling window (default 30). Throws on token/Graph failure so the caller can report — the
 *  existing local cache is untouched on failure. */
export async function syncWorkspaceInsights(
  workspaceId: string,
  connectionId: string | null,
  adAccountId: string,
  days = 30,
): Promise<SyncResult> {
  const { data: token } = await supabaseAdmin.rpc("meta_get_token", { p_workspace_id: workspaceId, p_which: "user" })
  if (!token) throw new Error("no_token")

  const raw = await fetchAccountInsights(String(token), adAccountId, isoDaysAgo(days), isoDaysAgo(0))
  const { entities, insights } = parseInsights(raw)
  const now = new Date().toISOString()

  if (entities.length) {
    await supabaseAdmin.from("meta_ad_entities").upsert(
      entities.map((e) => ({
        workspace_id: workspaceId, connection_id: connectionId, level: e.level, external_id: e.externalId,
        name: e.name, status: e.status, parent_external_id: e.parentExternalId, updated_at: now,
      })),
      { onConflict: "workspace_id,external_id" },
    )
  }
  if (insights.length) {
    await supabaseAdmin.from("meta_insights_daily").upsert(
      insights.map((i) => ({
        workspace_id: workspaceId, connection_id: connectionId, entity_external_id: i.entityExternalId,
        campaign_external_id: i.campaignExternalId, date: i.date, spend: i.spend, impressions: i.impressions,
        reach: i.reach, clicks: i.clicks, updated_at: now,
      })),
      { onConflict: "workspace_id,entity_external_id,date" },
    )
  }
  // Stamp last_synced_at on the connection (best effort).
  await supabaseAdmin.from("meta_connections").update({ last_synced_at: now }).eq("workspace_id", workspaceId).eq("provider", "meta")

  return { entities: entities.length, insights: insights.length }
}
