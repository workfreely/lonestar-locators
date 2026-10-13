export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { createClient } from "@/lib/supabase/server"
import CommentsClient, { type CommentRow, type RuleRow, type AccountRow } from "@/components/crm/social/CommentsClient"
import { COMMENT_KEYWORDS } from "@/lib/social/commentKeywords"

// Social Beast → Comments (Automated Lead Capture). Platform-admin gated, like every sibling tab.
//
// READ-ONLY IN PHASE 2. Nothing here polls Instagram, replies, or messages anyone: the structures
// and the surface exist so the rules can be reviewed before any permission is requested. The
// Instagram scopes this needs (instagram_business_manage_comments, and separately
// instagram_business_manage_messages) have deliberately NOT been added yet.
//
// THE TABLES MAY NOT EXIST. 20261014000000_comment_automation is written but not applied, so every
// read below tolerates a missing relation and falls back to an empty list. That keeps the tab
// openable for review without a production migration, and it is also the right behaviour in
// general: a page that cannot read its own state shows nothing rather than guessing.
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
    () => supabase.from("social_connections").select("id, provider, username, status").order("provider") as never,
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

  return (
    <CommentsClient
      accounts={connections}
      rules={previewRules}
      rulesArePreview={seeded}
      comments={comments}
      globalEnabled={false}
    />
  )
}
