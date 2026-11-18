// THE I/O HALF OF THE INSTAGRAM TOKEN REFRESH. The decision lives in instagramTokenRefresh.ts
// and is pure; everything that touches the network or the database is here.
//
// ── THE ONE RULE THAT SHAPES THIS FILE ──────────────────────────────────────────────────────
// Every write goes through sa_update_instagram_token_by_connection — BY ID, never by owner. The
// owner-scoped writer this replaces updated `where owner_user_id = … and provider = 'instagram'`
// with no account filter, so with two Instagram accounts it gave both the same secret and
// deleted the loser's. That is reproduced and fixed in
// 20261119000000_instagram_connection_scoped_tokens.sql; this module must never reach for the
// old function, and a test asserts it does not.
//
// ── FAILURE IS EXPECTED AND IS NOT DAMAGE ───────────────────────────────────────────────────
// A refresh can fail for reasons entirely outside this system: Meta is down, the token was
// revoked on the phone, the app's permissions changed. So a failure here:
//   · never writes anything — not a status, not an expiry, not a secret
//   · never marks the connection broken; the publish worker already reports an expired token,
//     and a refresh failure is not the same fact
//   · never retries in-run; the next scheduled pass is the retry, and the window is wide enough
//     to absorb a fortnight of them
//   · is counted and named in the result, so a run that fixed nothing says so loudly

import { supabaseAdmin } from "@/lib/supabase/admin"
import { refreshLongLivedToken, expiryFromExpiresIn } from "@/lib/social/instagram"
import {
  refreshDecision,
  daysUntilExpiry,
  needsHumanAttention,
  type RefreshSkip,
} from "@/lib/social/instagramTokenRefresh"

export type RunMode = "preview" | "persist"

export type RefreshOutcome = {
  connectionId: string
  username: string | null
  daysLeft: number | null
  action: "refreshed" | "would_refresh" | "skipped" | "failed"
  reason?: RefreshSkip | "provider_error" | "no_token_returned"
  attention?: boolean
}

export type RefreshRunResult = {
  mode: RunMode
  checked: number
  refreshed: number
  failed: number
  attention: number
  outcomes: RefreshOutcome[]
}

type ConnRow = {
  id: string
  username: string | null
  status: string | null
  token_expires_at: string | null
  updated_at: string | null
}

/**
 * Walk every Instagram connection and renew the ones that are due.
 *
 * `preview` is the default everywhere above this function: it performs the SAME reads and the
 * SAME decisions and makes no provider call and no write, so the report it produces is exactly
 * what a persist run would do.
 */
export async function runInstagramTokenRefresh(opts: {
  mode: RunMode
  now?: Date
}): Promise<RefreshRunResult> {
  const now = opts.now ?? new Date()
  const mode = opts.mode

  // Safe display/decision fields only — never token_secret_id, never the token itself. The token
  // is read inside the database by the RPC; this process never holds the stored one.
  const { data, error } = await supabaseAdmin
    .from("social_connections")
    .select("id, username, status, token_expires_at, updated_at")
    .eq("provider", "instagram")
    .order("created_at", { ascending: true })

  if (error) throw new Error(`instagram token refresh: could not read connections: ${error.message}`)

  const rows = (data ?? []) as ConnRow[]
  const outcomes: RefreshOutcome[] = []

  for (const row of rows) {
    const candidate = { status: row.status, tokenExpiresAt: row.token_expires_at, updatedAt: row.updated_at }
    const daysLeft = daysUntilExpiry(row.token_expires_at, now)
    const attention = needsHumanAttention(candidate, now)
    const decision = refreshDecision(candidate, now)

    if (!decision.refresh) {
      outcomes.push({
        connectionId: row.id,
        username: row.username,
        daysLeft,
        action: "skipped",
        reason: decision.reason,
        ...(attention ? { attention: true } : {}),
      })
      continue
    }

    if (mode === "preview") {
      outcomes.push({ connectionId: row.id, username: row.username, daysLeft, action: "would_refresh" })
      continue
    }

    try {
      // THE CURRENT TOKEN, read by connection id. The owner-scoped reader is not used here even
      // though it would work today with one account — it returns nothing once there are two, and
      // a module that only works while you have one account is the bug being fixed.
      const { data: tokenRows, error: tokenErr } = await supabaseAdmin.rpc(
        "sa_get_instagram_token_by_connection",
        { p_connection_id: row.id },
      )
      if (tokenErr) throw new Error(tokenErr.message)
      const current = (Array.isArray(tokenRows) ? tokenRows[0] : tokenRows) as { token?: string | null } | null
      const token = current?.token ?? null
      if (!token) {
        outcomes.push({ connectionId: row.id, username: row.username, daysLeft, action: "failed", reason: "no_token_returned" })
        continue
      }

      const refreshed = await refreshLongLivedToken(token)
      if (!refreshed?.access_token) {
        outcomes.push({ connectionId: row.id, username: row.username, daysLeft, action: "failed", reason: "no_token_returned" })
        continue
      }

      // BY ID. The whole point.
      const { error: writeErr } = await supabaseAdmin.rpc("sa_update_instagram_token_by_connection", {
        p_connection_id: row.id,
        p_token: refreshed.access_token,
        p_expires_at: expiryFromExpiresIn(refreshed.expires_in),
      })
      if (writeErr) throw new Error(writeErr.message)

      outcomes.push({ connectionId: row.id, username: row.username, daysLeft, action: "refreshed" })
    } catch (e) {
      // NOTHING IS WRITTEN ON THIS PATH. The message is logged server-side, never returned to a
      // browser, and never includes the token: refreshLongLivedToken throws a status plus Meta's
      // own redacted error fields, and the
      // RPC errors are Postgres messages.
      console.error(`[instagram-token-refresh] ${row.id}: ${(e as Error).message}`)
      outcomes.push({ connectionId: row.id, username: row.username, daysLeft, action: "failed", reason: "provider_error" })
    }
  }

  return {
    mode,
    checked: rows.length,
    refreshed: outcomes.filter((o) => o.action === "refreshed").length,
    failed: outcomes.filter((o) => o.action === "failed").length,
    attention: outcomes.filter((o) => o.attention).length,
    outcomes,
  }
}
