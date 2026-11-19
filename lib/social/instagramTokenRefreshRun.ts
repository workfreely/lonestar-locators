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
import { alertSubjects, buildRefreshAlert } from "@/lib/social/instagramTokenRefreshAlert"
import { sendNotification, absoluteUrl } from "@/lib/notifications"

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
  owner_user_id: string | null
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
    .select("id, owner_user_id, username, status, token_expires_at, updated_at")
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

  // ── TELL SOMEBODY ─────────────────────────────────────────────────────────────────────────
  // Last, and unconditionally non-fatal. A renewal that worked must not be reported as failed
  // because an email bounced, so this cannot throw and cannot change a single outcome above.
  await notifyOwners(rows, outcomes)

  return {
    mode,
    checked: rows.length,
    refreshed: outcomes.filter((o) => o.action === "refreshed").length,
    failed: outcomes.filter((o) => o.action === "failed").length,
    attention: outcomes.filter((o) => o.attention).length,
    outcomes,
  }
}

/**
 * Email each owner about THEIR OWN problem accounts, once per run.
 *
 * ── WHY THE OWNER AND NOT THE AGENT ─────────────────────────────────────────────────────────
 * A connection has an agent_user_id (whose account it is) and an owner_user_id (whose Social
 * Beast it lives in). Renewal is an operator concern: the owner is the one who can see the
 * Accounts page, read the connection's status and decide whether to reconnect. An agent cannot
 * act on "the token did not renew" without being told what to do by the owner anyway.
 *
 * ── IT CANNOT BREAK A RUN ───────────────────────────────────────────────────────────────────
 * sendNotification never throws by contract, and everything else here is wrapped regardless:
 * a missing profile, an unreachable database or an unconfigured mail provider must leave the
 * refresh result exactly as it was. Nothing is retried — the next scheduled pass re-evaluates
 * and re-alerts while the condition lasts, which is the behaviour an operator wants from a
 * daily job: a message every day until it is fixed, and silence the day it is.
 */
async function notifyOwners(rows: ConnRow[], outcomes: RefreshOutcome[]): Promise<void> {
  try {
    const ownerOf = new Map(rows.map((r) => [r.id, r.owner_user_id]))

    // Group by owner, keeping each owner's outcomes together.
    const byOwner = new Map<string, RefreshOutcome[]>()
    for (const o of outcomes) {
      const owner = ownerOf.get(o.connectionId)
      if (!owner) continue
      const list = byOwner.get(owner)
      if (list) list.push(o)
      else byOwner.set(owner, [o])
    }

    // Decide BEFORE reading any profile, so a healthy run touches nothing at all.
    const pending = [...byOwner.entries()]
      .map(([owner, os]) => ({ owner, subjects: alertSubjects(os) }))
      .filter((p) => p.subjects.length > 0)
    if (pending.length === 0) return

    const accountsUrl = absoluteUrl("/admin/social-autopilot/accounts")

    for (const { owner, subjects } of pending) {
      const alert = buildRefreshAlert({ subjects, accountsUrl })
      if (!alert) continue

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", owner)
        .maybeSingle()
      const to = (profile as { email?: string | null } | null)?.email ?? null
      if (!to) {
        console.error(`[instagram-token-refresh] no email on file for owner ${owner} — alert not sent`)
        continue
      }

      const sent = await sendNotification({ to, subject: alert.subject, html: alert.html, text: alert.text })
      console.log(
        `[instagram-token-refresh] alert for ${subjects.length} account(s): ${sent.ok ? "sent" : `not sent (${sent.error})`}`,
      )
    }
  } catch (e) {
    console.error(`[instagram-token-refresh] alerting failed: ${(e as Error).message}`)
  }
}
