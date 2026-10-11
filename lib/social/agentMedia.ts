// THE MEDIA AUTHORIZATION BOUNDARY FOR AGENTS.
//
// ── WHY THIS IS NOT A UI CONCERN ────────────────────────────────────────────────────────────
// Social Beast video lives in the PRIVATE `social-media` bucket and reaches a browser as a signed
// URL minted server-side. A signed URL is a BEARER TOKEN: once issued it works for anyone holding
// it, for its full TTL, with no further authorization check and no way to recall it. Filtering a
// list in the interface therefore protects nothing — the only moment that matters is the moment
// before signing.
//
// So every agent-facing signed URL goes through signAgentMedia(), which re-reads the row and
// refuses unless the admin has explicitly shared it. Jay's master library contains videos that
// feature him personally; "not shared" is the default and this function is what makes that
// default mean something.
//
// ── THE CHECK IS A RE-READ, NOT A PARAMETER ─────────────────────────────────────────────────
// Callers pass a content id, never a storage path and never an "allowed" boolean. If a caller
// could hand in the path, the gate would be asking the caller for permission to let the caller
// through. The path comes out of the same read that checks the flag.
import type { SupabaseClient } from "@supabase/supabase-js"

/** Short, deliberately. Long enough to start playback, short enough that a leaked URL expires. */
export const AGENT_SIGNED_URL_TTL = 60 * 10 // 10 minutes

export type AgentMediaRefusal =
  | "not_found"          // no such content row, or RLS hid it
  | "not_shared"         // exists, but available_to_agents is false
  | "not_your_owner"     // shared, but belongs to an owner this agent has no connection with
  | "no_media"           // shared, but the row has no storage path
  | "sign_failed"

export type AgentMediaResult =
  | { ok: true; url: string; contentId: string }
  | { ok: false; reason: AgentMediaRefusal }

type ContentRow = {
  id: string
  owner_user_id: string
  available_to_agents: boolean | null
  storage_path: string | null
}

/**
 * Mint a signed URL for a master video, for an agent, or refuse with a reason.
 *
 * `ownerUserIds` comes from requireSocialAgent and is session-derived. It is checked here as well
 * as in RLS because defence in depth is the point: RLS protects the row, this protects the bytes,
 * and the two fail independently.
 */
export async function signAgentMedia(
  supabase: SupabaseClient,
  input: { contentId: string; ownerUserIds: readonly string[]; pathField?: "storage_path"; ttlSeconds?: number },
): Promise<AgentMediaResult> {
  const { data, error } = await supabase
    .from("social_content")
    .select("id, owner_user_id, available_to_agents, storage_path")
    .eq("id", input.contentId)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: "not_found" }
  const row = data as ContentRow

  // THE SHARE SWITCH. Checked explicitly rather than relying on the RLS policy that also enforces
  // it: a future caller using a service-role client would bypass RLS entirely and still land here.
  if (row.available_to_agents !== true) return { ok: false, reason: "not_shared" }
  if (!input.ownerUserIds.includes(row.owner_user_id)) return { ok: false, reason: "not_your_owner" }
  if (!row.storage_path) return { ok: false, reason: "no_media" }

  const { data: signed, error: signErr } = await supabase.storage
    .from("social-media")
    .createSignedUrl(row.storage_path, input.ttlSeconds ?? AGENT_SIGNED_URL_TTL)

  if (signErr || !signed?.signedUrl) return { ok: false, reason: "sign_failed" }
  return { ok: true, url: signed.signedUrl, contentId: row.id }
}

/**
 * Is this master video currently shareable with agents?
 *
 * The SAME predicate the library query and the claim path must use, so "visible in the library"
 * and "claimable" and "renderable to a signed URL" can never drift into three different answers.
 * Revoking availability therefore stops new scheduling, not merely list visibility.
 */
export function isSharedWithAgents(row: { available_to_agents?: boolean | null } | null | undefined): boolean {
  return row?.available_to_agents === true
}
