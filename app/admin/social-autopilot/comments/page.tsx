export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import CommentsClient, { type CommentRow, type RuleRow, type AccountRow } from "@/components/crm/social/CommentsClient"
import { COMMENT_KEYWORDS } from "@/lib/social/commentKeywords"
import { sendGate } from "@/lib/social/commentSendPolicy"

// Social Beast → Comments (Automated Lead Capture). Platform-admin gated, like every sibling tab.
//
// READ-ONLY. Nothing on this page polls Instagram, replies, or messages anyone — it reads state
// and renders it. The webhook, the reconciliation poll and the senders live elsewhere and are
// gated independently (see lib/social/commentSendPolicy).
//
// ── THE PERMISSION, CORRECTED ───────────────────────────────────────────────────────────────
// This needs ONE scope: instagram_business_manage_comments. An earlier note here said a separate
// instagram_business_manage_messages was also required; that is wrong. Meta's Instagram Login
// private-reply endpoint is POST /{ig-user-id}/messages with recipient.comment_id, and its
// documented permissions are instagram_business_basic + instagram_business_manage_comments. The
// comments scope covers reading, public replies AND private replies.
//
// ── WHAT THIS SCREEN MAY NOT DO ─────────────────────────────────────────────────────────────
// It may not print a safeguard's value as a literal. Three lines here once did — the status pill,
// "Automatic public replies" and "Maximum comment age" — and after the switches were armed the
// screen reported automation off while it was live. Every status below is read; an unreadable
// setting renders as "unknown", never as "off".
//
// ── THE TABLES EXIST ────────────────────────────────────────────────────────────────────────
// 20261014000000_comment_automation IS applied: all seven tables are present. The safe() wrapper
// below is kept anyway, because tolerating an unreadable relation is the right behaviour in
// general — a page that cannot read its own state must show nothing rather than guess. What
// changed is that an unreadable SETTING is no longer silently reported as "off": see the
// globalEnabled read below, which distinguishes "off" from "unknown" and fails closed on both.
export default async function CommentsPage() {
  await ensurePlatformAdminPage()
  const supabase = await createClient()

  /** Any read error — including "relation does not exist" — yields the fallback. Fail closed. */
  async function safe<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<T> {
    try {
      const { data, error } = await run()
      return error || !data ? fallback : data
    } catch {
      return fallback
    }
  }

  const connections = await safe<AccountRow[]>(
    // `scopes` drives the per-account permission line. Safe display data: no token, no
    // external_account_id, no owner_user_id.
    () => supabase.from("social_connections").select("id, provider, username, status, scopes").order("provider") as never,
    [],
  )

  const rules = await safe<RuleRow[]>(
    () =>
      supabase
        .from("comment_rules")
        .select("id, keyword, property_type, enabled, comment_reply_variants(id, body, claims_dm)")
        .order("keyword") as never,
    [],
  )

  // ── THE GLOBAL SWITCH, READ RATHER THAN ASSUMED ─────────────────────────────────────────
  // This was hardcoded to `false`, which was true at the time and would have quietly stayed false
  // after the switch was turned on. It is now read.
  //
  // FAIL CLOSED, AND DISTINGUISH THE TWO FAILURES. A MISSING ROW means off — the column defaults
  // to false, so a fresh install is silent by construction. An unreadable TABLE means we do not
  // know, which is reported separately so the page can say so instead of showing a confident
  // "Off" it has not earned. Both render as not-enabled; only one of them is a problem.
  let globalEnabled = false
  let globalUnreadable = false
  try {
    const { data, error } = await supabase
      .from("comment_automation_settings")
      .select("global_enabled")
      .maybeSingle()
    if (error) globalUnreadable = true
    else globalEnabled = data?.global_enabled === true
  } catch {
    globalUnreadable = true
  }

  // ── THE PER-ACCOUNT SETTINGS, READ RATHER THAN HARDCODED ────────────────────────────────
  // The Automation panel used to print "Automatic public replies: Off" and "Maximum comment age:
  // 24 hours" as literal strings. Both were true when written; after public replies were switched
  // on, the first became a confident lie and the second stayed right only by coincidence. A screen
  // that states a safeguard's value must read it.
  //
  // Keyed on the Instagram connection, because these settings are per-account. Unreadable is kept
  // DISTINCT from off for the same reason as the global switch: "we do not know" must not render
  // as a confident "Off".
  const igConnectionId = connections.find((a) => a.provider === "instagram")?.id ?? null
  let publicRepliesEnabled = false
  let accountEnabled = false
  let maxCommentAgeMinutes: number | null = null
  let accountSettingsUnreadable = false
  if (igConnectionId) {
    try {
      const { data, error } = await supabase
        .from("comment_account_settings")
        .select("enabled, public_replies_enabled, max_comment_age_minutes")
        .eq("connection_id", igConnectionId)
        .maybeSingle()
      if (error) accountSettingsUnreadable = true
      else {
        publicRepliesEnabled = data?.public_replies_enabled === true
        accountEnabled = data?.enabled === true
        maxCommentAgeMinutes = typeof data?.max_comment_age_minutes === "number" ? data.max_comment_age_minutes : null
      }
    } catch {
      accountSettingsUnreadable = true
    }
  }

  const comments = await safe<CommentRow[]>(
    () =>
      supabase
        .from("social_comments")
        .select(
          "id, provider, body, author_username, permalink, commented_at, matched_keyword, hold_reason, external_media_id, " +
            "social_commenters(provider_user_id, username, profile_url, dm_sent_at), " +
            "comment_actions(kind, status, reason), social_posts(post_name)",
        )
        .order("commented_at", { ascending: false })
        .limit(100) as never,
    [],
  )

  // With no rules stored yet, show the approved keyword set as the proposed bank so the tab is
  // reviewable before the migration runs. Flagged as a preview so it is never mistaken for saved
  // configuration.
  const seeded = rules.length === 0
  const previewRules: RuleRow[] = seeded
    ? COMMENT_KEYWORDS.map((k) => ({
        id: `preview-${k.keyword}`,
        keyword: k.keyword,
        property_type: k.propertyType,
        enabled: true,
        comment_reply_variants: [],
      }))
    : rules

  // THE SWITCH THAT ACTUALLY DECIDES. Read server-side, because it is an environment variable and
  // the browser must never be asked to guess it. Without this the screen could read "On" for every
  // database toggle while SOCIAL_COMMENT_SEND_ENABLED kept the senders inert — an operator would
  // have no way to tell "armed" from "dry run", which is the one distinction that matters here.
  const sendingEnabled = sendGate(process.env).active

  return (
    <CommentsClient
      accounts={connections}
      rules={previewRules}
      rulesArePreview={seeded}
      comments={comments}
      globalEnabled={globalEnabled}
      globalUnreadable={globalUnreadable}
      sendingEnabled={sendingEnabled}
      accountEnabled={accountEnabled}
      publicRepliesEnabled={publicRepliesEnabled}
      maxCommentAgeMinutes={maxCommentAgeMinutes}
      accountSettingsUnreadable={accountSettingsUnreadable}
    />
  )
}
