import { google } from "googleapis"
import { recordGoogleFailure, clearGoogleFailure, classifyGoogleError } from "./integrationHealth"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Per-agent Google OAuth client — the phase-2 replacement for the single global
// getOAuthClient() (GOOGLE_REFRESH_TOKEN). Reads the agent's own refresh token
// from the `google_credentials` table (keyed on user_id, RLS-protected — hence
// the service-role admin client) and builds a client that acts as THAT agent's
// Google account.
//
// FOUNDATION ONLY (Checkpoint A): nothing consumes this yet. The global path in
// getOAuthClient.ts is unchanged; contact/calendar/follow-up behavior is not
// repointed here. Contract for future best-effort callers:
//   - not connected / no refresh token  → null   (caller skips silently)
//   - stored token revoked/expired        → null  (invalid_grant, warned once)
//   - working                             → an authenticated OAuth2 client
// so a caller can treat `null` as "no Google sync for this agent" and never
// block lead creation or workflow progression.
//
// Secrets never leave the server and are never logged: warnings carry only the
// opaque user/workspace id and the error class, never the refresh token,
// google_email, or any lead/client PII.

type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>

function buildBaseClient(): GoogleOAuthClient {
  // Same server-side client ID/secret/redirect the global path uses.
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/google/callback`,
  )
}

/**
 * Build an OAuth2 client acting as the given agent's connected Google account.
 * Returns null when the agent has not connected Google (no stored refresh
 * token) or the stored token is no longer valid.
 *
 * @param ownerUserId the agent's auth user id (google_credentials.user_id)
 * @param opts.verify when true (default) performs a lightweight token refresh so
 *   a revoked/expired credential resolves to null up front; pass false to skip
 *   the network round-trip and build the client without validating.
 */
export async function getOAuthClientForUser(
  ownerUserId: string | null | undefined,
  { verify = true }: { verify?: boolean } = {},
): Promise<GoogleOAuthClient | null> {
  if (!ownerUserId) return null

  const { data, error } = await supabaseAdmin
    .from("google_credentials")
    .select("refresh_token")
    .eq("user_id", ownerUserId)
    .maybeSingle()

  if (error) {
    console.warn(`[google/oauth] credential lookup failed for user ${ownerUserId}`)
    return null
  }
  if (!data?.refresh_token) return null // agent has not connected Google

  const client = buildBaseClient()
  client.setCredentials({ refresh_token: data.refresh_token })

  if (verify) {
    try {
      // Forces a refresh against Google; throws invalid_grant if the agent
      // revoked access or the token expired. Read-only — no user-visible Google
      // side effect.
      await client.getAccessToken()
    } catch (e: unknown) {
      const code =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e as { code?: string })?.code ??
        "auth_error"
      const label = code === "invalid_grant" ? "invalid_grant — agent must reconnect Google" : "auth error"
      // Non-PII: opaque user id + error class only. Never the token or email.
      console.warn(`[google/oauth] token refresh failed for user ${ownerUserId} (${label})`)
      // RECORD IT. A log line is not a signal anyone sees; this is what lets the Integrations
      // page show "Reconnect Google" rather than the connection failing quietly for months.
      await recordGoogleFailure(ownerUserId, classifyGoogleError(e))
      return null
    }
  }

  // Verified good: clear any recorded failure so the indicator reflects the CURRENT state.
  if (verify) await clearGoogleFailure(ownerUserId)
  return client
}

/**
 * Convenience: resolve a workspace to its owning agent (workspaces.created_by)
 * and build that agent's Google client. Useful for call sites that hold a
 * workspace id rather than the owner's user id (e.g. the follow-up workflow,
 * or resolving from a lead's workspace_id). Returns null if the workspace or its
 * owner can't be resolved, or the owner has no valid Google credential.
 */
export async function getOAuthClientForWorkspace(
  workspaceId: string | null | undefined,
  opts?: { verify?: boolean },
): Promise<GoogleOAuthClient | null> {
  if (!workspaceId) return null

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("created_by")
    .eq("id", workspaceId)
    .maybeSingle()

  if (error || !data?.created_by) return null
  return getOAuthClientForUser(data.created_by, opts)
}
