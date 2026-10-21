// Comments — THE SUPABASE-BACKED STORE. Persistence only; no rules live here.
//
// Every method is the database half of a decision made by a pure function elsewhere. The runner
// holds the order, commentSafety/commentIdentity hold the rules, and this file holds the SQL. That
// separation is what lets the whole pipeline be tested with a fake store and no database.
//
// SERVICE ROLE, DELIBERATELY. The migration grants owner-scoped SELECT only and no write policy at
// all — the poller and the webhook are system actors with no session, exactly like the follow-up
// engine. The UI reads these tables through RLS as the owner; nothing here is reachable from a
// browser request.

import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  CommentStore, ConnectionContext, GateState, ActionKind, ActionStatus,
} from "@/lib/social/commentRunner"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"
import { resolveProfileUrl } from "@/lib/social/commentIdentity"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

const PUBLIC_ORIGIN = "https://locatorbeast.com"

/**
 * The connected account's workspace slug — the `{username}` in the branded form link.
 *
 * REFUSES RATHER THAN GUESSES. A DM whose link is wrong is worse than no DM: the person clicks,
 * lands nowhere, and the one message we are allowed to send them is spent. With no slug the runner
 * never gets a connection context, so nothing is sent.
 */
async function workspaceSlug(db: Db, ownerUserId: string): Promise<string | null> {
  const { data: member } = await db
    .from("workspace_members").select("workspace_id").eq("user_id", ownerUserId).limit(1).maybeSingle()
  const workspaceId = (member as { workspace_id?: string } | null)?.workspace_id
  if (!workspaceId) return null
  const { data: ws } = await db.from("workspaces").select("slug").eq("id", workspaceId).maybeSingle()
  const slug = (ws as { slug?: string | null } | null)?.slug
  return slug && slug.trim() ? slug.trim() : null
}

export function createCommentStore(db: Db): CommentStore {
  return {
    /**
     * Match the webhook's recipient id to one of OUR connections.
     *
     * Keyed on external_account_id — the Instagram-scoped account id Meta puts in entry.id. A null
     * recipient matches nothing: an unattributable delivery must not be pinned onto the only
     * connection we happen to have, which is how one account's webhook ends up driving replies
     * from another.
     */
    async findConnection(provider, recipientProviderUserId): Promise<ConnectionContext | null> {
      const recipient = (recipientProviderUserId ?? "").trim()
      if (!recipient) return null

      const { data, error } = await db
        .from("social_connections")
        .select("id, owner_user_id, external_account_id, username, scopes, status")
        .eq("provider", provider)
        .eq("external_account_id", recipient)
        .maybeSingle()
      if (error || !data) return null

      const row = data as {
        id: string; owner_user_id: string; external_account_id: string
        username: string | null; scopes: string[] | null; status: string | null
      }
      if (row.status !== "connected") return null

      // The token is fetched through the same security-definer function the publish worker and the
      // probe use, so the secret is never selected into application code by this file.
      const { data: tok, error: tokErr } = await db.rpc(
        "sa_get_instagram_token_by_connection", { p_connection_id: row.id },
      )
      if (tokErr) return null
      const tokenRow = (Array.isArray(tok) ? tok[0] : tok) as { token?: string } | null
      const accessToken = (tokenRow?.token ?? "").trim()
      if (!accessToken) return null

      const slug = await workspaceSlug(db, row.owner_user_id)
      if (!slug) return null

      return {
        connectionId: row.id,
        ownProviderUserId: row.external_account_id,
        username: row.username ?? "",
        accessToken,
        // The gate reads this; a connection without the comments scope can never be active.
        permissionsOk: (row.scopes ?? []).includes(INSTAGRAM_COMMENTS_SCOPE),
        formOrigin: PUBLIC_ORIGIN,
        formUsername: slug,
        formPlatformSlug: "ig",
      }
    },

    /**
     * Read both switches and the account's activation boundary.
     *
     * settingsReadOk is FALSE on any read error, and accountAutomationGate refuses on that — an
     * unreadable settings row must never resolve to a default, because the only safe default when
     * you cannot tell whether a feature is enabled is "it is not".
     *
     * A MISSING ROW IS NOT AN ERROR, it is "off": both tables default their flags to false, so a
     * fresh install and a fresh connection are silent until somebody deliberately turns them on.
     */
    async readGate(connectionId): Promise<GateState> {
      const { data: conn, error: connErr } = await db
        .from("social_connections").select("owner_user_id").eq("id", connectionId).maybeSingle()
      if (connErr || !conn) return BLIND_GATE
      const ownerUserId = (conn as { owner_user_id: string }).owner_user_id

      const [{ data: global, error: gErr }, { data: account, error: aErr }] = await Promise.all([
        db.from("comment_automation_settings").select("global_enabled").eq("owner_user_id", ownerUserId).maybeSingle(),
        db.from("comment_account_settings")
          .select("enabled, activated_at, max_comment_age_minutes, public_replies_enabled, public_reply_cooldown_minutes")
          .eq("connection_id", connectionId).maybeSingle(),
      ])
      if (gErr || aErr) return BLIND_GATE

      const g = global as { global_enabled?: boolean } | null
      const a = account as {
        enabled?: boolean; activated_at?: string | null; max_comment_age_minutes?: number | null
        public_replies_enabled?: boolean; public_reply_cooldown_minutes?: number | null
      } | null

      return {
        settingsReadOk: true,
        globalEnabled: g?.global_enabled ?? false,
        accountEnabled: a?.enabled ?? false,
        activatedAt: a?.activated_at ?? null,
        maxCommentAgeMinutes: a?.max_comment_age_minutes ?? null,
        publicRepliesEnabled: a?.public_replies_enabled ?? false,
        publicReplyCooldownMinutes: a?.public_reply_cooldown_minutes ?? null,
      }
    },

    async findComment(provider, externalCommentId) {
      const { data } = await db
        .from("social_comments").select("id")
        .eq("provider", provider).eq("external_comment_id", externalCommentId).maybeSingle()
      return (data as { id: string } | null) ?? null
    },

    /**
     * Upsert the commenter on (connection_id, provider_user_id) — the unique index.
     *
     * CRITICALLY: the upsert never writes dm_sent_at, dm_claimed_at or last_public_reply_at. A
     * returning commenter's message history survives being seen again, which is the whole basis of
     * "one DM per person, ever". Only last_seen_at moves.
     */
    async upsertCommenter(input) {
      const profileUrl = input.profileUrl
        ?? resolveProfileUrl(input.provider, { username: input.username })
      const nowIso = new Date().toISOString()
      const { data, error } = await db
        .from("social_commenters")
        .upsert(
          {
            connection_id: input.connectionId,
            provider: input.provider,
            provider_user_id: input.providerUserId,
            username: input.username,
            profile_url: profileUrl,
            last_seen_at: nowIso,
          },
          { onConflict: "connection_id,provider_user_id" },
        )
        .select("id, provider_user_id, dm_sent_at, dm_claimed_at, last_public_reply_at")
        .single()
      if (error) throw new Error(`upsertCommenter failed: ${error.message}`)
      const r = data as {
        id: string; provider_user_id: string
        dm_sent_at: string | null; dm_claimed_at: string | null; last_public_reply_at: string | null
      }
      return {
        id: r.id,
        providerUserId: r.provider_user_id,
        dmSentAt: r.dm_sent_at,
        dmClaimedAt: r.dm_claimed_at,
        lastPublicReplyAt: r.last_public_reply_at,
      }
    },

    async insertComment(input) {
      const { data, error } = await db
        .from("social_comments")
        .insert({
          connection_id: input.connectionId,
          provider: input.provider,
          external_comment_id: input.externalCommentId,
          external_media_id: input.externalMediaId,
          commenter_id: input.commenterId,
          author_username: input.authorUsername,
          body: input.body,
          commented_at: input.commentedAt,
          matched_keyword: input.matchedKeyword,
          hold_reason: input.holdReason,
        })
        .select("id")
        .single()
      if (error) {
        // A unique violation here means a concurrent delivery stored it first. Read the existing
        // row rather than failing: the runner's own findComment check can go stale between two
        // simultaneous webhook deliveries, and the index is what actually serialises them.
        const { data: existing } = await db
          .from("social_comments").select("id")
          .eq("provider", input.provider).eq("external_comment_id", input.externalCommentId).maybeSingle()
        if (existing) return existing as { id: string }
        throw new Error(`insertComment failed: ${error.message}`)
      }
      return data as { id: string }
    },

    /**
     * THE ATOMIC CLAIM. The predicate is DM_CLAIM_SQL's, expressed through PostgREST:
     *
     *     update social_commenters set dm_claimed_at = now()
     *      where id = $1 and dm_claimed_at is null and dm_sent_at is null
     *     returning id
     *
     * One UPDATE with both null checks in its WHERE clause, so the database serialises concurrent
     * callers and exactly one gets a row back. Returning false is NOT an error — it means somebody
     * else owns this person's DM, and the correct response is to not send.
     *
     * BOTH null checks are load-bearing and neither may be dropped: without dm_sent_at a person
     * already messaged could be claimed again, and without dm_claimed_at two workers could both
     * claim and both send.
     */
    async claimDm(commenterId) {
      const { data, error } = await db
        .from("social_commenters")
        .update({ dm_claimed_at: new Date().toISOString() })
        .eq("id", commenterId)
        .is("dm_claimed_at", null)
        .is("dm_sent_at", null)
        .select("id")
      if (error) return false
      return Array.isArray(data) && data.length === 1
    },

    /**
     * Resolve a finished attempt, exactly as resolveDmOutcome decided.
     *
     * The UNCERTAIN case writes NOTHING — no stamp and no release — which leaves the person
     * claimed for ever. That is deliberate: a send we could not confirm may have arrived, and a
     * permanent claim is the correct failure direction when the alternative is messaging a stranger
     * twice. These rows are indexed for the review queue.
     */
    async resolveDm(commenterId, r) {
      const patch: Record<string, unknown> = {}
      if (r.markSent) patch.dm_sent_at = new Date().toISOString()
      if (r.releaseClaim) patch.dm_claimed_at = null
      if (Object.keys(patch).length === 0) return
      await db.from("social_commenters").update(patch).eq("id", commenterId)
    },

    async touchPublicReply(commenterId, atIso) {
      await db.from("social_commenters").update({ last_public_reply_at: atIso }).eq("id", commenterId)
    },

    /**
     * Append to the ledger.
     *
     * UNIQUE (comment_id, kind) means a second write for the same comment and kind is rejected,
     * and that rejection is SWALLOWED on purpose — it is the index doing its job, not a fault. The
     * first record of what happened is the true one; a retry must not overwrite it with a later
     * verdict.
     */
    async logAction(input: {
      commentId: string; kind: ActionKind; status: ActionStatus
      reason: string | null; externalId: string | null; error: string | null
    }) {
      const nowIso = new Date().toISOString()
      await db.from("comment_actions").insert({
        comment_id: input.commentId,
        kind: input.kind,
        status: input.status,
        reason: input.reason,
        external_id: input.externalId,
        error: input.error,
        attempted_at: input.status === "skipped" ? null : nowIso,
        completed_at: input.status === "skipped" ? null : nowIso,
      })
    },

    /** Reply variations for a keyword. An empty bank is normal; the runner falls back truthfully. */
    async publicReplyVariants(connectionId, keyword) {
      const { data: rule } = await db
        .from("comment_rules").select("id").eq("keyword", keyword).limit(1).maybeSingle()
      const ruleId = (rule as { id?: string } | null)?.id
      if (!ruleId) return []
      const { data } = await db
        .from("comment_reply_variants").select("body, claims_dm").eq("rule_id", ruleId)
      // claims_dm defaults to FALSE when absent or null: a variant whose intent we cannot read is
      // treated as not claiming a DM, which is the direction that cannot say something untrue.
      return ((data ?? []) as { body: string | null; claims_dm: boolean | null }[])
        .map((r) => ({ body: (r.body ?? "").trim(), claimsDm: r.claims_dm === true }))
        .filter((v) => v.body.length > 0)
    },
  }
}

/** What we report when we could not read the switches. Every flag null ⇒ the gate refuses. */
const BLIND_GATE: GateState = {
  settingsReadOk: false,
  globalEnabled: null,
  accountEnabled: null,
  activatedAt: null,
  maxCommentAgeMinutes: null,
  publicRepliesEnabled: null,
  publicReplyCooldownMinutes: null,
}
