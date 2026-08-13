import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_TIMEZONE, isValidTimeZone } from "@/lib/timezone"

/**
 * Resolve the authoritative IANA timezone for a locator, server-side, via the
 * EXISTING resolve_timezone(profile_id, workspace_id) DB function — the single
 * source of the precedence: profiles.timezone → workspaces.timezone →
 * 'America/Chicago'. Never re-implement that precedence per-route.
 *
 * Always returns a valid IANA zone; falls back to the default on any error so a
 * workflow date calculation can never throw for a missing/invalid zone.
 */
export async function resolveUserTimeZone(
  supabase: SupabaseClient,
  profileId: string | null | undefined,
  workspaceId: string | null | undefined,
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("resolve_timezone", {
      p_profile_id: profileId ?? null,
      p_workspace_id: workspaceId ?? null,
    })
    if (!error && isValidTimeZone(data)) return data
  } catch {
    /* fall through to default */
  }
  return DEFAULT_TIMEZONE
}
