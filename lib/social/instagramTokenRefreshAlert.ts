// WHAT AN OPERATOR IS TOLD WHEN A RENEWAL GOES WRONG — the message, with nothing attached to it.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// Every cron in this app reports failure the same way: console.error into the platform logs.
// That is fine for a publish worker, where a missed post is visible in the queue the next
// morning. It is not fine for token renewal, because the failure is SILENT and TIMED: a refresh
// that fails leaves a still-valid token behind, so nothing looks wrong until the day the token
// dies and every post from that account starts failing at once. Nobody reads the logs on a
// Tuesday to find out that something will break in a fortnight.
//
// So a failed or at-risk renewal sends one email. It is deliberately the only alerting in this
// module: no paging, no webhook, no second channel to keep working.
//
// ── WHAT IT MUST NEVER CONTAIN ──────────────────────────────────────────────────────────────
// No access token, no Vault secret id, no connection id, no provider error body. An operator
// needs to know WHICH ACCOUNT, WHAT WENT WRONG and HOW LONG THEY HAVE — the diagnosis lives in
// the logs where the redacted provider detail already goes. An alert that leaks a credential
// into an inbox is worse than no alert.
//
// Pure: builds a subject and a body from outcomes and returns null when there is nothing to say.

import type { RefreshOutcome } from "./instagramTokenRefreshRun"

/** Why one account earned a place in the alert. Ordered worst-first when rendered. */
export type AlertProblem =
  | "expired"      // past saving automatically; needs re-authorization today
  | "no_expiry"    // we cannot tell when it dies, so it cannot be renewed on a schedule
  | "failed"       // due for renewal and the attempt did not land

export type AlertSubjectAccount = {
  username: string | null
  daysLeft: number | null
  problem: AlertProblem
}

export type RefreshAlert = { subject: string; html: string; text: string }

const RANK: Record<AlertProblem, number> = { expired: 0, no_expiry: 1, failed: 2 }

/**
 * Which accounts belong in an alert, worst first.
 *
 * A SKIPPED account is not a problem unless it was flagged for attention: `not_due_yet` and
 * `too_new` are the system working, and emailing about them daily would train the operator to
 * ignore the one message that matters.
 */
export function alertSubjects(outcomes: RefreshOutcome[]): AlertSubjectAccount[] {
  const subjects: AlertSubjectAccount[] = []
  for (const o of outcomes) {
    let problem: AlertProblem | null = null
    if (o.action === "failed") problem = "failed"
    else if (o.attention) problem = o.reason === "no_expiry_recorded" ? "no_expiry" : "expired"
    if (!problem) continue
    subjects.push({ username: o.username, daysLeft: o.daysLeft, problem })
  }
  return subjects.sort((a, b) => RANK[a.problem] - RANK[b.problem])
}

const handle = (u: string | null) => (u ? `@${u}` : "an Instagram account")

/** The one line that tells an operator how much time they actually have. */
function urgency(a: AlertSubjectAccount): string {
  if (a.problem === "no_expiry") return "No expiry date recorded, so it cannot be renewed automatically."
  if (a.problem === "expired" || a.daysLeft === null || a.daysLeft <= 0) {
    return "The access token has expired. Posting from this account will fail until it is reconnected."
  }
  if (a.daysLeft === 1) return "The access token expires tomorrow. Automatic renewal has one more attempt."
  return `The access token expires in ${a.daysLeft} days. Automatic renewal will retry daily until then.`
}

/** What the operator should actually do, which differs by problem. */
function remedy(a: AlertSubjectAccount): string {
  return a.problem === "failed" && (a.daysLeft ?? 0) > 1
    ? "No action is needed yet — renewal retries every day. Reconnect the account if this message keeps arriving."
    : "Reconnect this account from Social Beast → Accounts to restore posting."
}

/**
 * Build the alert, or null when every account is healthy.
 *
 * `accountsUrl` is passed in rather than derived, so this file needs no knowledge of routing.
 */
export function buildRefreshAlert(args: {
  subjects: AlertSubjectAccount[]
  accountsUrl: string
}): RefreshAlert | null {
  const { subjects, accountsUrl } = args
  if (subjects.length === 0) return null

  const worst = subjects[0]
  const subject =
    subjects.length === 1
      ? `Instagram renewal needs attention — ${handle(worst.username)}`
      : `Instagram renewal needs attention — ${subjects.length} accounts`

  const lines = subjects.map((a) => `${handle(a.username)} — ${urgency(a)} ${remedy(a)}`)

  const html = [
    `<p>Social Beast could not renew ${subjects.length === 1 ? "an Instagram access token" : "some Instagram access tokens"}.</p>`,
    "<ul>",
    ...subjects.map(
      (a) =>
        `<li><strong>${handle(a.username)}</strong><br>${urgency(a)}<br>${remedy(a)}</li>`,
    ),
    "</ul>",
    `<p><a href="${accountsUrl}">Open Social Beast → Accounts</a></p>`,
    "<p>Instagram access tokens last 60 days and are renewed automatically before they expire. This message is sent only when that did not work.</p>",
  ].join("\n")

  const text = [
    `Social Beast could not renew ${subjects.length === 1 ? "an Instagram access token" : "some Instagram access tokens"}.`,
    "",
    ...lines,
    "",
    accountsUrl,
  ].join("\n")

  return { subject, html, text }
}
